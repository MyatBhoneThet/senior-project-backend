const jwt = require('jsonwebtoken');
const axios = require('axios');
const mongoose = require('mongoose');
const User = require('../models/User');
const { OAuth2Client } = require('google-auth-library');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const GOOGLE_VERIFY_TIMEOUT_MS = Number(process.env.GOOGLE_VERIFY_TIMEOUT_MS || 10000);
const MONGO_READY_TIMEOUT_MS = Number(process.env.MONGO_READY_TIMEOUT_MS || 5000);

/* =========================
   HELPERS
========================= */
const generateToken = (user) =>
  jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });

const waitForMongoReady = async (timeoutMs = MONGO_READY_TIMEOUT_MS) => {
  if (mongoose.connection.readyState === 1) return true;

  await new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      const err = new Error('Database connection not ready');
      err.code = 'DB_NOT_READY';
      reject(err);
    }, timeoutMs);

    const onConnected = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(true);
    };

    const onError = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error || new Error('Database connection failed'));
    };

    const cleanup = () => {
      clearTimeout(timer);
      mongoose.connection.off('connected', onConnected);
      mongoose.connection.off('open', onConnected);
      mongoose.connection.off('error', onError);
    };

    mongoose.connection.on('connected', onConnected);
    mongoose.connection.on('open', onConnected);
    mongoose.connection.on('error', onError);
  });

  return true;
};

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

/* =========================
   REGISTER
========================= */
exports.registerUser = async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    const user = await User.create({ fullName, email, password });

    res.status(201).json({ token: generateToken(user), user });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Registration failed' });
  }
};

/* =========================
   LOGIN
========================= */
exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    res.json({ token: generateToken(user), user });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Login failed' });
  }
};

/* =========================
   GOOGLE AUTH
========================= */
exports.googleAuth = async (req, res) => {
  try {
    const { credential } = req.body;

    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(500).json({ message: 'Google auth is not configured on server' });
    }

    if (!credential) {
      return res.status(400).json({ message: 'Missing Google credential' });
    }

    await waitForMongoReady();

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        const timeoutError = new Error('Google token verification timed out');
        timeoutError.code = 'ETIMEDOUT';
        reject(timeoutError);
      }, GOOGLE_VERIFY_TIMEOUT_MS);
    });

    const ticket = await Promise.race([
      googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      }),
      timeoutPromise,
    ]);

    const payload = ticket.getPayload() || {};
    const sub = String(payload.sub || '').trim();
    const email = normalizeEmail(payload.email);
    const name = String(payload.name || '').trim();
    const picture = String(payload.picture || '').trim();

    if (!sub || !email) {
      return res.status(401).json({ message: 'Google account payload is missing required fields' });
    }

    let user = await User.findOne({ $or: [{ googleId: sub }, { email }] });

    if (!user) {
      user = await User.create({
        fullName: name || email.split('@')[0],
        email,
        googleId: sub,
        profileImageUrl: picture,
      });
    } else {
      let shouldSave = false;
      if (!user.googleId) {
        user.googleId = sub;
        shouldSave = true;
      }
      if (name && user.fullName !== name) {
        user.fullName = name;
        shouldSave = true;
      }
      if (picture && user.profileImageUrl !== picture) {
        user.profileImageUrl = picture;
        shouldSave = true;
      }
      if (shouldSave) {
        await user.save();
      }
    }

    res.json({ token: generateToken(user), user });
  } catch (err) {
    console.error('Google auth error:', {
      message: err?.message,
      code: err?.code,
      name: err?.name,
      readyState: mongoose.connection.readyState,
      responseData: err?.response?.data,
    });

    if (err?.code === 'ETIMEDOUT') {
      return res.status(504).json({ message: 'Google sign-in timed out. Please try again.' });
    }

    if (err?.code === 'DB_NOT_READY' || mongoose.connection.readyState !== 1) {
      return res.status(503).json({ message: 'Database temporarily unavailable' });
    }

    if (err?.name === 'MongoServerError' && err?.code === 11000) {
      return res.status(409).json({ message: 'Google account is already linked to another user record' });
    }

    if (err?.name === 'ValidationError') {
      return res.status(400).json({ message: 'Google account data is invalid for this app profile' });
    }

    const message = String(err?.message || '').toLowerCase();
    if (
      message.includes('wrong recipient') ||
      message.includes('audience') ||
      message.includes('client id') ||
      message.includes('origin')
    ) {
      return res.status(401).json({ message: 'Google client configuration mismatch. Check authorized origins and client ID.' });
    }

    return res.status(401).json({ message: 'Google sign-in failed' });
  }
};

/* =========================
   GITHUB AUTH (FIXED)
========================= */
exports.githubAuth = async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ message: 'Missing authorization code' });
    }

    // 1. Exchange Code for Token
    const tokenRes = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      },
      { headers: { Accept: 'application/json' } }
    );

    if (tokenRes.data.error) {
       console.error("GitHub Token Error:", tokenRes.data);
       return res.status(401).json({ message: tokenRes.data.error_description || 'GitHub token exchange failed' });
    }

    const accessToken = tokenRes.data.access_token;

    // 2. Get User Profile
    const userRes = await axios.get('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const ghUser = userRes.data;

    // 3. Get Email (if private)
    let email = ghUser.email;
    if (!email) {
      const emailRes = await axios.get('https://api.github.com/user/emails', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      // Find primary and verified email
      const primaryEmail = emailRes.data.find((e) => e.primary && e.verified);
      email = primaryEmail ? primaryEmail.email : null;
    }

    if (!email) {
      return res.status(400).json({ message: 'GitHub email not accessible. Please verify your email on GitHub.' });
    }

    // 4. Find or Create User
    // Note: Converted githubId to String to ensure matching works
    let user = await User.findOne({
      $or: [{ githubId: String(ghUser.id) }, { email }],
    });

    if (!user) {
      user = await User.create({
        fullName: ghUser.name || ghUser.login,
        email,
        githubId: String(ghUser.id),
        profileImageUrl: ghUser.avatar_url,
      });
    } else if (!user.githubId) {
       // Merge account if email exists but not linked to github yet
       user.githubId = String(ghUser.id);
       await user.save();
    }

    res.json({ token: generateToken(user), user });
  } catch (err) {
    console.error('GitHub auth error:', err.response?.data || err.message);
    res.status(401).json({ message: 'GitHub authentication failed' });
  }
};

/* =========================
   GET ME & UTILS
========================= */
exports.getUserInfo = async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ message: 'Database temporarily unavailable' });
    }
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch user' });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id).select('+password');
    
    if (!user || !(await user.comparePassword(currentPassword))) {
      return res.status(400).json({ message: 'Current password incorrect' });
    }

    user.password = newPassword;
    await user.save();
    res.json({ message: 'Password updated' });
  } catch (err) {
    res.status(500).json({ message: 'Password change failed' });
  }
};

exports.deleteAccount = async (req, res) => {
  try {
    await User.findByIdAndDelete(req.user.id);
    res.json({ message: 'Account deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Delete account failed' });
  }
};
