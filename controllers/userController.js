// const User = require('../models/User');
// const fs = require('fs');
// const path = require('path');

// // Get user profile
// exports.getUserProfile = async (req, res) => {
//   try {
//     const user = await User.findById(req.params.id);
//     res.json(user);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// // Update user profile
// exports.updateUserProfile = async (req, res) => {
//   try {
//     const { name, username, bio, age, gender, aboutMe, interests, accomplishments, contact } = req.body;
//     const user = await User.findById(req.params.id);

//     if (!user) return res.status(404).json({ error: 'User not found' });

//     // Update fields
//     user.name = name || user.name;
//     user.username = username || user.username;
//     user.bio = bio || user.bio;
//     user.age = age || user.age;
//     user.gender = gender || user.gender;
//     user.aboutMe = aboutMe || user.aboutMe;
//     user.interests = interests ? interests.split(',').map(s => s.trim()) : user.interests;
//     user.accomplishments = accomplishments ? accomplishments.split('\n').map(s => s.trim()) : user.accomplishments;
//     user.contact = contact || user.contact;

//     // Profile photo
//     if (req.file) {
//       if (user.profilePhoto) {
//         // Remove old photo
//         fs.unlinkSync(path.join(__dirname, '../uploads', path.basename(user.profilePhoto)));
//       }
//       user.profilePhoto = req.file.path;
//     }

//     await user.save();
//     res.json(user);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// // Remove profile photo
// exports.removeProfilePhoto = async (req, res) => {
//   try {
//     const user = await User.findById(req.params.id);
//     if (user && user.profilePhoto) {
//       fs.unlinkSync(path.join(__dirname, '../uploads', path.basename(user.profilePhoto)));
//       user.profilePhoto = "";
//       await user.save();
//     }
//     res.json(user);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

const User = require('../models/User');

// Get current user profile
exports.getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id || req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Update profile info (without removing Base64)
exports.updateUserProfile = async (req, res) => {
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

    const updatedUser = await User.findByIdAndUpdate(userId, { $set: updateData }, { new: true, runValidators: true });
    if (!updatedUser) return res.status(404).json({ success: false, message: 'User not found' });

    res.json(updatedUser);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Upload profile photo (Base64)
exports.uploadProfilePhoto = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const userId = req.user.id || req.user._id;
    const base64Image = req.file.buffer.toString('base64');

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { profilePhoto: { data: base64Image, contentType: req.file.mimetype } },
      { new: true }
    );

    if (!updatedUser) return res.status(404).json({ success: false, message: 'User not found' });

    res.json({ success: true, message: 'Profile photo uploaded successfully', user: updatedUser });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Remove profile photo
exports.removeProfilePhoto = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { profilePhoto: { data: "", contentType: "" } },
      { new: true }
    );

    if (!updatedUser) return res.status(404).json({ success: false, message: 'User not found' });

    res.json({ success: true, message: 'Profile photo removed', user: updatedUser });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
