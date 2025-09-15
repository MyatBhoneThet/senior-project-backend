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
      password, // will be hashed via pre-save hook
      profileImageUrl,
    });
    const token = generateToken(user);
    return res.status(201).json({
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        profileImageUrl: user.profileImageUrl,
      },
    });
  } catch (err) {
    console.error('Registration error:', err);
    return res
      .status(500)
      .json({ message: 'Error registering user', error: err.message });
  }
};

/**
 * POST /auth/login - FIXED VERSION
 */
exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Find user and explicitly select password field
    const user = await User.findOne({ email }).select('+password');
    
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Compare password using the method
    const isPasswordValid = await user.comparePassword(password);
    
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = generateToken(user);
    return res.status(200).json({
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        profileImageUrl: user.profileImageUrl,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res
      .status(500)
      .json({ message: 'Error logging in user', error: err.message });
  }
};

/**
 * POST /auth/google
 */
exports.googleAuth = async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ message: 'Missing credential' });
    }
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const googleId = payload.sub;
    const email = payload.email;
    let user = await User.findOne({ $or: [{ googleId }, { email }] });
    if (!user) {
      user = await User.create({
        fullName: payload.name,
        email,
        googleId,
        profileImageUrl: payload.picture,
      });
    } else {
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
        id: user._id,
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
 * GET /auth/me
 */
exports.getUserInfo = async (req, res) => {
  try {
    const user = await User.findById(req.user._id || req.user.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.status(200).json(user);
  } catch (err) {
    console.error('Get user info error:', err);
    return res
      .status(500)
      .json({ message: 'Error fetching user', error: err.message });
  }
};

/**
 * POST /auth/change-password
 */
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Missing password fields' });
    }
    const user = await User.findById(req.user._id || req.user.id).select('+password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }
    
    user.password = newPassword; // will be hashed via pre-save hook
    await user.save();
    return res.json({ message: 'Password updated' });
  } catch (err) {
    console.error('Change password error:', err);
    return res.status(500).json({ message: 'Error updating password', error: err.message });
  }
};

/**
 * DELETE /auth/delete-account
 */
exports.deleteAccount = async (req, res) => {
  try {
    const user = await User.findById(req.user._id || req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    await User.findByIdAndDelete(user._id);
    return res.status(200).json({ message: 'Account deleted successfully' });
  } catch (err) {
    console.error('Delete account error:', err);
    return res.status(500).json({ message: 'Error deleting account', error: err.message });
  }
};

exports.updateUserInfo = async (req, res) => {
  try {
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id || req.user.id,
      req.body,
      { new: true, runValidators: true }
    ).select('-password');
    if (!updatedUser)
      return res.status(404).json({ message: 'User not found' });
    res.status(200).json(updatedUser);
  } catch (err) {
    console.error('Update user info error:', err);
    res.status(500).json({ message: 'Error updating user', error: err.message });
  }
};
