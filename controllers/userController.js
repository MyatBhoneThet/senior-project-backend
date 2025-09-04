// // backend/controllers/userController.js
// const User = require('../models/User');
// const bcrypt = require('bcryptjs');

// exports.getUserInfo = async (req, res) => {
// res.json(req.user); // assuming protect middleware sets req.user
// };
// // PUT /users/me/preferences
// exports.updatePreferences = async (req, res) => {
//   try {
//     const { currency, theme, weekStartsOn, language } = req.body;
//     const user = await User.findById(req.user._id);
//     if (!user) return res.status(404).json({ message: 'User not found' });

//     if (currency) user.currency = currency;
//     if (theme) user.theme = theme;
//     if (weekStartsOn) user.weekStartsOn = weekStartsOn;
//     if (language) user.language = language;

//     await user.save();
//     return res.json({
//       message: 'Preferences updated',
//       user: {
//         _id: user._id,
//         currency: user.currency,
//         theme: user.theme,
//         weekStartsOn: user.weekStartsOn,
//         language: user.language,
//       },
//     });
//   } catch (err) {
//     return res.status(500).json({ message: 'Error updating preferences', error: err.message });
//   }
// };

// // DELETE /users/me
// exports.deleteMe = async (req, res) => {
//   try {
//     await User.findByIdAndDelete(req.user._id);
//     return res.json({ message: 'Account deleted' });
//   } catch (err) {
//     return res.status(500).json({ message: 'Error deleting account', error: err.message });
//   }
// };

// // POST /api/v1/auth/change-password  (we mount this under authRoutes below)
// exports.changePassword = async (req, res) => {
//   try {
//     const { currentPassword, newPassword } = req.body;
//     if (!currentPassword || !newPassword) {
//       return res.status(400).json({ message: 'Missing password fields' });
//     }
//     const user = await User.findById(req.user._id);
//     if (!user || !user.password) return res.status(400).json({ message: 'Current password is incorrect' });

//     const ok = await bcrypt.compare(currentPassword, user.password);
//     if (!ok) return res.status(400).json({ message: 'Current password is incorrect' });

//     user.password = newPassword; // will be hashed by pre-save hook
//     await user.save();
//     return res.json({ message: 'Password updated' });
//   } catch (err) {
//     return res.status(500).json({ message: 'Error updating password', error: err.message });
//   }
// };

// // PATCH /api/users/me
// exports.updateMe = async (req, res, next) => {
// try {
// const userId = req.user._id;

// // Allowed fields only
// const allowed = ['name','username','bio','aboutMe','interests','accomplishments','age','gender','profileImageUrl','contact'];
// const payload = {};

// for (const k of allowed) {
// if (req.body[k] !== undefined) payload[k] = req.body[k];
// }

// // Normalize arrays
// if (typeof payload.interests === 'string') {
// payload.interests = payload.interests.split(',').map(s => s.trim()).filter(Boolean);
// }
// if (typeof payload.accomplishments === 'string') {
// payload.accomplishments = payload.accomplishments.split('\n').map(s => s.trim()).filter(Boolean);
// }

// const updated = await User.findByIdAndUpdate(userId, payload, { new: true });
// res.json(updated);
// } catch (err) {
// next(err);
// }
// };

// // POST /api/auth/upload-image (returns absolute URL)
// exports.uploadImage = (req, res) => {
// const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
// res.json({ imageUrl });
// };

const User = require('../models/User');
const fs = require('fs');
const path = require('path');

// Get user profile
exports.getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update user profile
exports.updateUserProfile = async (req, res) => {
  try {
    const { name, username, bio, age, gender, aboutMe, interests, accomplishments, contact } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) return res.status(404).json({ error: 'User not found' });

    // Update fields
    user.name = name || user.name;
    user.username = username || user.username;
    user.bio = bio || user.bio;
    user.age = age || user.age;
    user.gender = gender || user.gender;
    user.aboutMe = aboutMe || user.aboutMe;
    user.interests = interests ? interests.split(',').map(s => s.trim()) : user.interests;
    user.accomplishments = accomplishments ? accomplishments.split('\n').map(s => s.trim()) : user.accomplishments;
    user.contact = contact || user.contact;

    // Profile photo
    if (req.file) {
      if (user.profilePhoto) {
        // Remove old photo
        fs.unlinkSync(path.join(__dirname, '../uploads', path.basename(user.profilePhoto)));
      }
      user.profilePhoto = req.file.path;
    }

    await user.save();
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Remove profile photo
exports.removeProfilePhoto = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (user && user.profilePhoto) {
      fs.unlinkSync(path.join(__dirname, '../uploads', path.basename(user.profilePhoto)));
      user.profilePhoto = "";
      await user.save();
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
