// backend/routes/userRoutes.js
const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const { getUserProfile, updateUserProfile, removeProfilePhoto } = require('../controllers/userController');

const router = express.Router();
const User = require('../models/User');

/* -------------------- helpers to normalize inputs -------------------- */

function normalizeTheme(v) {
  if (v == null) return undefined;
  const s = String(v).trim().toLowerCase();
  return s === 'dark' ? 'dark' : 'light';
}

function normalizeCurrency(v) {
  if (v == null) return undefined;
  let s = String(v).trim();
  // Accept "THB — Thai Baht", "THB - Thai Baht", "THB Thai Baht"
  if (s.includes('—')) s = s.split('—')[0];
  else if (s.includes('-')) s = s.split('-')[0];
  s = s.trim();

  const m = s.match(/[A-Za-z]{3}/);
  return (m ? m[0] : s).toUpperCase();
}

function normalizeLanguage(v) {
  if (v == null) return undefined;
  const s = String(v).trim().toLowerCase();
  const map = {
    english: 'en',
    en: 'en',
    thai: 'th',
    th: 'th',
    myanmar: 'my',
    burmese: 'my',
    my: 'my',
  };
  return map[s] || (s.length > 2 ? s.slice(0, 2) : s);
}

function normalizeWeekStartsOn(v) {
  if (v == null) return undefined;
  const s = String(v).trim().toLowerCase();
  if (/^mon/.test(s) || s === '1' || s === 'monday') return 'monday';
  // default to sunday for anything else (including 'sun', '0', 'sunday')
  return 'sunday';
}

/* --------------------------- current user --------------------------- */

// Get current user profile
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id || req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json(user);
  } catch (err) {
    console.error('Get user profile error:', err);
    res.status(500).json({ success: false, message: 'Error fetching user profile', error: err.message });
  }
});

// Update current user profile (non-preference basic fields)
router.put('/me', protect, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const updateData = { ...req.body };

    if (typeof updateData.interests === 'string') {
      updateData.interests = updateData.interests.split(',').map(s => s.trim()).filter(Boolean);
    }
    if (typeof updateData.accomplishments === 'string') {
      updateData.accomplishments = updateData.accomplishments.split('\n').map(s => s.trim()).filter(Boolean);
    }
    if (updateData.age) updateData.age = Number(updateData.age);

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!updatedUser) return res.status(404).json({ success: false, message: 'User not found' });
    res.json(updatedUser);
  } catch (err) {
    console.error('Update user profile error:', err);
    if (err.name === 'ValidationError') {
      const validationErrors = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ success: false, message: 'Validation failed', errors: validationErrors });
    }
    res.status(500).json({ success: false, message: 'Error updating user profile', error: err.message });
  }
});

/* ------------------------ preferences endpoints ------------------------ */

// PUT /api/v1/users/me/preferences
router.put('/me/preferences', protect, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;

    // Accept labels or codes and normalize them
    const currency     = normalizeCurrency(req.body.currency);
    const theme        = normalizeTheme(req.body.theme);
    const language     = normalizeLanguage(req.body.language);
    const weekStartsOn = normalizeWeekStartsOn(req.body.weekStartsOn);

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Ensure nested object exists
    if (!user.preferences) user.preferences = {};

    if (currency !== undefined)     user.preferences.currency = currency;
    if (theme !== undefined)        user.preferences.theme = theme;
    if (language !== undefined)     user.preferences.language = language;
    if (weekStartsOn !== undefined) user.preferences.weekStartsOn = weekStartsOn;

    // (optional) keep flat fields for backward compatibility
    if (currency !== undefined)     user.currency = currency;
    if (theme !== undefined)        user.theme = theme;
    if (language !== undefined)     user.language = language;
    if (weekStartsOn !== undefined) user.weekStartsOn = weekStartsOn;

    await user.save();

    return res.json({
      success: true,
      message: 'Preferences updated successfully',
      preferences: {
        currency: user.preferences.currency,
        theme: user.preferences.theme,
        weekStartsOn: user.preferences.weekStartsOn,
        language: user.preferences.language,
      },
    });
  } catch (err) {
    console.error('Update preferences error:', err);
    return res.status(500).json({
      success: false,
      message: 'Error updating preferences',
      error: err.message,
    });
  }
});

// GET /api/v1/users/me/preferences
router.get('/me/preferences', protect, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Canonicalized values out
    const prefs = user.preferences || {};
    const preferences = {
      currency:     normalizeCurrency(prefs.currency || user.currency || 'THB'),
      theme:        normalizeTheme(prefs.theme || user.theme || 'light'),
      weekStartsOn: normalizeWeekStartsOn(prefs.weekStartsOn || user.weekStartsOn || 'sunday'),
      language:     normalizeLanguage(prefs.language || user.language || 'en'),
    };

    return res.json({ success: true, preferences });
  } catch (err) {
    console.error('Get preferences error:', err);
    return res.status(500).json({ success: false, message: 'Error fetching preferences', error: err.message });
  }
});

/* ---------------------- delete current user account --------------------- */

router.delete('/me', protect, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const user = await User.findByIdAndDelete(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, message: 'Account deleted successfully' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ success: false, message: 'Error deleting user', error: err.message });
  }
});

/* --------------------------- profile photo (me) -------------------------- */

// Upload profile photo (stored as base64 in MongoDB)
router.post('/me/photo', protect, upload.single('profilePhoto'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const userId = req.user.id || req.user._id;
    const base64Image = req.file.buffer.toString('base64');

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          profilePhoto: {
            data: base64Image,
            contentType: req.file.mimetype,
            filename: req.file.originalname,
            size: req.file.size,
            uploadDate: new Date(),
          },
        },
      },
      { new: true }
    );

    if (!updatedUser) return res.status(404).json({ success: false, message: 'User not found' });

    res.json({ success: true, message: 'Profile photo uploaded successfully', user: updatedUser });
  } catch (err) {
    console.error('Upload profile photo error:', err);
    res.status(500).json({ success: false, message: 'Error uploading profile photo', error: err.message });
  }
});

// Remove profile photo (me)
router.delete('/me/photo', protect, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: { profilePhoto: { data: '', contentType: '', filename: '', size: 0 } } },
      { new: true }
    );

    if (!updatedUser) return res.status(404).json({ success: false, message: 'User not found' });

    res.json({ success: true, message: 'Profile photo removed successfully', user: updatedUser });
  } catch (err) {
    console.error('Remove profile photo error:', err);
    res.status(500).json({ success: false, message: 'Error removing profile photo', error: err.message });
  }
});

/* ---------------------------- public by id ---------------------------- */

// Get user profile photo by user ID
router.get('/photo/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user || !user.profilePhoto?.data) return res.status(404).send('No profile photo found');

    res.contentType(user.profilePhoto.contentType || 'image/jpeg');
    res.send(Buffer.from(user.profilePhoto.data, 'base64'));
  } catch (err) {
    console.error('Get profile photo error:', err);
    res.status(500).json({ message: 'Error fetching profile photo' });
  }
});

// Controller-based ID endpoints (keep your originals)
router.get('/:id', getUserProfile);
router.put('/:id', protect, upload.single('profilePhoto'), updateUserProfile);
router.delete('/:id/photo', protect, removeProfilePhoto);

module.exports = router;
