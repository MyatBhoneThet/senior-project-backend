const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const { getUserProfile, updateUserProfile, removeProfilePhoto } = require('../controllers/userController');

const router = express.Router();
const User = require('../models/User');

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

// Update current user profile
router.put('/me', protect, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const updateData = { ...req.body };

    // Handle array fields
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

// Update user preferences - FIXED: Now uses nested preferences object
router.put('/me/preferences', protect, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { currency, theme, weekStartsOn, language } = req.body;

    // Build the preferences update object
    const preferencesUpdate = {};
    if (currency !== undefined) preferencesUpdate['preferences.currency'] = currency;
    if (theme !== undefined) preferencesUpdate['preferences.theme'] = theme;
    if (weekStartsOn !== undefined) preferencesUpdate['preferences.weekStartsOn'] = weekStartsOn;
    if (language !== undefined) preferencesUpdate['preferences.language'] = language;

    // Also update flat fields for backward compatibility
    if (currency !== undefined) preferencesUpdate.currency = currency;
    if (theme !== undefined) preferencesUpdate.theme = theme;
    if (weekStartsOn !== undefined) preferencesUpdate.weekStartsOn = weekStartsOn;
    if (language !== undefined) preferencesUpdate.language = language;

    const updatedUser = await User.findByIdAndUpdate(
      userId, 
      { $set: preferencesUpdate }, 
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      message: 'Preferences updated successfully',
      preferences: {
        currency: updatedUser.preferences?.currency || updatedUser.currency,
        theme: updatedUser.preferences?.theme || updatedUser.theme,
        weekStartsOn: updatedUser.preferences?.weekStartsOn || updatedUser.weekStartsOn,
        language: updatedUser.preferences?.language || updatedUser.language
      }
    });
  } catch (err) {
    console.error('Update preferences error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating preferences', 
      error: err.message 
    });
  }
});

// Get user preferences separately if needed
router.get('/me/preferences', protect, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const preferences = {
      currency: user.preferences?.currency || user.currency || 'THB',
      theme: user.preferences?.theme || user.theme || 'light',
      weekStartsOn: user.preferences?.weekStartsOn || user.weekStartsOn || 'Mon',
      language: user.preferences?.language || user.language || 'en'
    };

    res.json({
      success: true,
      preferences
    });
  } catch (err) {
    console.error('Get preferences error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching preferences', 
      error: err.message 
    });
  }
});

// Delete current user
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

// Upload profile photo (Base64 in MongoDB)
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
            uploadDate: new Date()
          } 
        } 
      },
      { new: true }
    );

    if (!updatedUser) return res.status(404).json({ success: false, message: 'User not found' });

    res.json({
      success: true,
      message: 'Profile photo uploaded successfully',
      user: updatedUser
    });
  } catch (err) {
    console.error('Upload profile photo error:', err);
    res.status(500).json({ success: false, message: 'Error uploading profile photo', error: err.message });
  }
});

// Remove profile photo
router.delete('/me/photo', protect, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: { profilePhoto: { data: "", contentType: "", filename: "", size: 0 } } },
      { new: true }
    );

    if (!updatedUser) return res.status(404).json({ success: false, message: 'User not found' });

    res.json({ success: true, message: 'Profile photo removed successfully', user: updatedUser });
  } catch (err) {
    console.error('Remove profile photo error:', err);
    res.status(500).json({ success: false, message: 'Error removing profile photo', error: err.message });
  }
});

// Get user profile photo by user ID
router.get('/photo/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user || !user.profilePhoto?.data) {
      return res.status(404).send('No profile photo found');
    }

    res.contentType(user.profilePhoto.contentType);
    res.send(Buffer.from(user.profilePhoto.data, 'base64'));
  } catch (err) {
    console.error('Get profile photo error:', err);
    res.status(500).json({ message: 'Error fetching profile photo' });
  }
});

// Other routes using controllers
router.get('/:id', getUserProfile);
router.put('/:id', protect, upload.single('profilePhoto'), updateUserProfile);
router.delete('/:id/photo', protect, removeProfilePhoto);

module.exports = router;
