// backend/controllers/authController.js
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const generateToken = (user) =>
  jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });

/**
 * POST /auth/register
 */
exports.registerUser = async (req, res) => {
  try {
    const { fullName, email, password, profileImageUrl } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({ message: 'Please fill all fields' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    const user = await User.create({
      fullName,
      email,
      password, // assume model hashes via pre-save hook
      profileImageUrl,
    });

    const token = generateToken(user);
    return res.status(201).json({
      token,
      user: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        profileImageUrl: user.profileImageUrl,
      },
    });
  } catch (err) {
    return res
      .status(500)
      .json({ message: 'Error registering user', error: err.message });
  }
};

/**
 * POST /auth/login
 */
exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = generateToken(user); // ← fix: pass the user, not user._id
    return res.status(200).json({
      token,
      user: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        profileImageUrl: user.profileImageUrl,
      },
    });
  } catch (err) {
    return res
      .status(500)
      .json({ message: 'Error logging in user', error: err.message });
  }
};

/**
 * POST /auth/google
 * Body: { credential }  // Google ID token from frontend
 */
exports.googleAuth = async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ message: 'Missing credential' });
    }

    // Verify Google ID token
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    // payload contains: sub, email, name, picture, email_verified, etc.
    const googleId = payload.sub;
    const email = payload.email;

    // Find by googleId or email (account linking)
    let user = await User.findOne({
      $or: [{ googleId }, { email }],
    });

    if (!user) {
      // Create a new user from Google profile
      user = await User.create({
        fullName: payload.name,
        email,
        googleId,
        profileImageUrl: payload.picture,
        // Note: no password for Google accounts
      });
    } else {
      // Update linkage/picture if needed
      let changed = false;
      if (!user.googleId) {
        user.googleId = googleId;
        changed = true;
      }
      if (!user.profileImageUrl && payload.picture) {
        user.profileImageUrl = payload.picture;
        changed = true;
      }
      if (changed) await user.save();
    }

    const token = generateToken(user);
    return res.status(200).json({
      token,
      user: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        profileImageUrl: user.profileImageUrl,
      },
    });
  } catch (err) {
    console.error('Google auth error:', err);
    return res
      .status(401)
      .json({ message: 'Google sign-in failed', error: err.message });
  }
};

/**
 * GET /auth/me  (protected)
 */
exports.getUserInfo = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    return res.status(200).json(user);
  } catch (err) {
    return res
      .status(500)
      .json({ message: 'Error fetching user', error: err.message });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Missing password fields' });
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const ok = await user.comparePassword(currentPassword);
    if (!ok) return res.status(400).json({ message: 'Current password is incorrect' });

    user.password = newPassword; // hash via pre-save hook
    await user.save();

    return res.json({ message: 'Password updated' });
  } catch (err) {
    return res.status(500).json({ message: 'Error updating password', error: err.message });
  }
};
exports.deleteAccount = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    await user.remove();
    return res.status(200).json({ message: 'Account deleted successfully' });
  } catch (err) {
    return res.status(500).json({ message: 'Error deleting account', error: err.message });
  }
};