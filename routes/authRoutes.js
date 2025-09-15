
const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const { updateUserInfo } = require('../controllers/authController');
const {
  registerUser,
  loginUser,
  getUserInfo,
  googleAuth,
  changePassword,
  deleteAccount,
} = require('../controllers/authController');

const router = express.Router();

// Auth
router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/google', googleAuth);

// Profile - Enhanced getUserInfo to ensure proper photo flag
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
    
    // Use toJSON to ensure proper transformation with hasPhoto flag
    const userJSON = user.toJSON();
    
    res.json(userJSON);
  } catch (err) {
    console.error('Get user info error:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching user information',
      error: err.message
    });
  }
});

// Profile - Enhanced updateUserInfo
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
    
    // Don't allow updating certain sensitive fields via this route
    delete updateData.password;
    delete updateData.email;
    delete updateData.googleId;
    delete updateData.profilePhoto; // Photo handled separately
    
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
    
    // Return transformed JSON with proper photo flag
    res.json(updatedUser.toJSON());
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

// Password + Account
router.post('/change-password', protect, changePassword);
router.delete('/delete-account', protect, deleteAccount);

// ✅ UPDATED: Photo upload now stores in MongoDB instead of file system
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
    
    // Convert buffer to base64 for MongoDB storage
    const base64Image = req.file.buffer.toString('base64');
    const imageData = {
      data: base64Image,
      contentType: req.file.mimetype,
      filename: req.file.originalname,
      size: req.file.size,
      uploadDate: new Date()
    };
    
    // Update user's profile photo
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { profilePhoto: imageData },
      { new: true }
    );
    
    if (!updatedUser) {
      return res.status(400).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Profile photo uploaded successfully',
      user: updatedUser.toJSON() // Use toJSON for proper transformation
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

// ✅ NEW: Remove profile photo
router.delete('/me/photo', protect, async (req, res) => {
  try {
    const User = require('../models/User');
    const userId = req.user.id || req.user._id;
    
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $unset: { profilePhoto: 1 } }, // Remove profilePhoto field entirely
      { new: true, runValidators: false }
    );
    
    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'Profile photo removed successfully',
      user: updatedUser.toJSON()
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

// ✅ LEGACY: Keep the old upload-image endpoint for backward compatibility
// But update it to use MongoDB storage as well
router.post('/upload-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false,
        message: 'No file uploaded' 
      });
    }
    
    // For this endpoint, we'll still return a data URL since it might be used differently
    const base64Image = req.file.buffer.toString('base64');
    const dataUrl = `data:${req.file.mimetype};base64,${base64Image}`;
    
    res.status(200).json({ 
      success: true,
      imageUrl: dataUrl,
      message: 'Image uploaded successfully'
    });
  } catch (err) {
    console.error('Upload image error:', err);
    res.status(500).json({
      success: false,
      message: 'Error uploading image',
      error: err.message
    });
  }
});

module.exports = router;
