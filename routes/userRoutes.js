const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const { 
  getUserProfile, 
  updateUserProfile, 
  removeProfilePhoto 
} = require('../controllers/userController');

const router = express.Router();

router.get('/me', protect, async (req, res) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(req.user.id || req.user._id);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    res.json(user);
  } catch (err) {
    console.error('Get user profile error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching user profile', 
      error: err.message 
    });
  }
});

// Update current user's profile (matches your API_PATHS.USER.UPDATE)
router.put('/me', protect, async (req, res) => {
  try {
    const User = require('../models/User');
    const userId = req.user.id || req.user._id;
    
    // Get the update data from request body
    const updateData = { ...req.body };
    
    // Handle interests if it's a string
    if (typeof updateData.interests === 'string') {
      updateData.interests = updateData.interests.split(',').map(s => s.trim()).filter(Boolean);
    }
    
    // Handle accomplishments if it's a string
    if (typeof updateData.accomplishments === 'string') {
      updateData.accomplishments = updateData.accomplishments.split('\n').map(s => s.trim()).filter(Boolean);
    }
    
    // Ensure age is a number if provided
    if (updateData.age) {
      updateData.age = Number(updateData.age);
    }
    
    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true }
    );
    
    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json(updatedUser);
  } catch (err) {
    console.error('Update user profile error:', err);
    
    // Handle validation errors specifically
    if (err.name === 'ValidationError') {
      const validationErrors = Object.values(err.errors).map(error => error.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error updating user profile',
      error: err.message
    });
  }
});

// Delete current user's account
router.delete('/me', protect, async (req, res) => {
  try {
    const User = require('../models/User');
    const userId = req.user.id || req.user._id;
    
    const user = await User.findByIdAndDelete(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Account deleted successfully'
    });
  } catch (err) {
    console.error('Delete user account error:', err);
    res.status(500).json({
      success: false,
      message: 'Error deleting user account',
      error: err.message
    });
  }
});

// Upload profile photo for current user
router.post('/me/photo', protect, upload.single('profilePhoto'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }
    
    const User = require('../models/User');
    const userId = req.user.id || req.user._id;
    
    // Update user's profile photo path
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { profilePhoto: req.file.path },
      { new: true }
    );
    
    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Return the image URL
    const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    
    res.json({
      success: true,
      imageUrl,
      user: updatedUser
    });
  } catch (err) {
    console.error('Upload profile photo error:', err);
    res.status(500).json({
      success: false,
      message: 'Error uploading profile photo',
      error: err.message
    });
  }
});

// Remove profile photo for current user ✅ NOW THIS WILL WORK!
router.delete('/me/photo', protect, async (req, res) => {
  try {
    const User = require('../models/User');
    const fs = require('fs');
    const path = require('path');
    const userId = req.user.id || req.user._id;
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Remove the physical file if it exists
    if (user.profilePhoto) {
      try {
        const filePath = path.join(__dirname, '../uploads', path.basename(user.profilePhoto));
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (fileErr) {
        console.warn('Could not delete physical file:', fileErr.message);
      }
    }
    
    // Update user record
    user.profilePhoto = "";
    await user.save();
    
    res.json({
      success: true,
      message: 'Profile photo removed successfully',
      user
    });
  } catch (err) {
    console.error('Remove profile photo error:', err);
    res.status(500).json({
      success: false,
      message: 'Error removing profile photo',
      error: err.message
    });
  }
});
// Remove profile photo for current user - FIXED VERSION
router.delete('/me/photo', protect, async (req, res) => {
  try {
    const User = require('../models/User');
    const fs = require('fs');
    const path = require('path');
    const userId = req.user.id || req.user._id;
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Remove the physical file if it exists
    if (user.profilePhoto) {
      try {
        const filePath = path.join(__dirname, '../uploads', path.basename(user.profilePhoto));
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (fileErr) {
        console.warn('Could not delete physical file:', fileErr.message);
      }
    }

    // ✅ Update only profilePhoto, skip validation
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: { profilePhoto: "" } }, // use $set explicitly
      { new: true, runValidators: false } // skip validation entirely
    );

    res.json({
      success: true,
      message: 'Profile photo removed successfully',
      user: updatedUser
    });
  } catch (err) {
    console.error('Remove profile photo error:', err);
    res.status(500).json({
      success: false,
      message: 'Error removing profile photo',
      error: err.message
    });
  }
});

// Update user preferences
router.put('/me/preferences', protect, async (req, res) => {
  try {
    const User = require('../models/User');
    const userId = req.user.id || req.user._id;
    const { currency, theme, weekStartsOn, language } = req.body;
    
    const updateData = {};
    if (currency) updateData.currency = currency;
    if (theme) updateData.theme = theme;
    if (weekStartsOn !== undefined) updateData.weekStartsOn = weekStartsOn;
    if (language) updateData.language = language;
    
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true }
    );
    
    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Preferences updated successfully',
      user: {
        id: updatedUser._id,
        currency: updatedUser.currency,
        theme: updatedUser.theme,
        weekStartsOn: updatedUser.weekStartsOn,
        language: updatedUser.language
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
router.get('/:id', getUserProfile);

router.put('/:id', protect, upload.single('profilePhoto'), updateUserProfile);

router.delete('/:id/photo', protect, removeProfilePhoto);

module.exports = router;
