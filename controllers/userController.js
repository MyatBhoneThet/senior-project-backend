const User = require('../models/User');
const fs = require('fs');
const path = require('path');

// Get user profile
exports.getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, user });
  } catch (err) {
    console.error('Get user profile error:', err);
    res.status(500).json({ success: false, message: 'Error fetching user profile', error: err.message });
  }
};

// Update user profile
exports.updateUserProfile = async (req, res) => {
  try {
    const { name, fullName, username, bio, age, gender, aboutMe, interests, accomplishments, contact } = req.body;
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Update fields
    if (name !== undefined) user.name = name;
    if (fullName !== undefined) user.fullName = fullName;
    if (username !== undefined) user.username = username;
    if (bio !== undefined) user.bio = bio;
    if (age !== undefined) user.age = Number(age);
    if (gender !== undefined) user.gender = gender;
    if (aboutMe !== undefined) user.aboutMe = aboutMe;
    
    // Handle array fields
    if (interests !== undefined) {
      user.interests = typeof interests === 'string' 
        ? interests.split(',').map(s => s.trim()).filter(Boolean)
        : interests;
    }
    if (accomplishments !== undefined) {
      user.accomplishments = typeof accomplishments === 'string' 
        ? accomplishments.split('\n').map(s => s.trim()).filter(Boolean)
        : accomplishments;
    }
    if (contact !== undefined) {
      user.contact = { ...user.contact, ...contact };
    }

    // Handle profile photo upload (if using file system storage)
    if (req.file) {
      // Remove old photo if exists
      if (user.profilePhoto && typeof user.profilePhoto === 'string') {
        const oldPhotoPath = path.join(__dirname, '../uploads', path.basename(user.profilePhoto));
        if (fs.existsSync(oldPhotoPath)) {
          fs.unlinkSync(oldPhotoPath);
        }
      }
      
      // Save new photo path
      user.profilePhoto = req.file.path;
    }

    await user.save();
    res.json({ success: true, message: 'Profile updated successfully', user });
  } catch (err) {
    console.error('Update user profile error:', err);
    if (err.name === 'ValidationError') {
      const validationErrors = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ success: false, message: 'Validation failed', errors: validationErrors });
    }
    res.status(500).json({ success: false, message: 'Error updating user profile', error: err.message });
  }
};

// Remove profile photo
exports.removeProfilePhoto = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Remove file from filesystem if it exists
    if (user.profilePhoto && typeof user.profilePhoto === 'string') {
      const photoPath = path.join(__dirname, '../uploads', path.basename(user.profilePhoto));
      if (fs.existsSync(photoPath)) {
        fs.unlinkSync(photoPath);
      }
    }
    
    // Clear photo from database
    user.profilePhoto = "";
    await user.save();
    
    res.json({ success: true, message: 'Profile photo removed successfully', user });
  } catch (err) {
    console.error('Remove profile photo error:', err);
    res.status(500).json({ success: false, message: 'Error removing profile photo', error: err.message });
  }
};
