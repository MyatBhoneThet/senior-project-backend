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

// Profile
router.get('/me', protect, getUserInfo);
router.put('/me', protect, updateUserInfo);  // Add this PUT handler if not present

// Password + Account
router.post('/change-password', protect, changePassword);
router.delete('/delete-account', protect, deleteAccount);

// Upload
router.post('/upload-image', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }
  const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.status(200).json({ imageUrl });
});

module.exports = router;
