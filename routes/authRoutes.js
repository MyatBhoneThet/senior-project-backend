const express = require('express');
const {
  registerUser,
  loginUser,
  googleAuth,
  githubAuth,
  getUserInfo,
  changePassword,
  deleteAccount,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/google', googleAuth);
router.post('/github', githubAuth);   // ✅ IMPORTANT
router.get('/me', protect, getUserInfo);
router.post('/change-password', protect, changePassword);
router.delete('/delete-account', protect, deleteAccount);

module.exports = router;
