const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { updatePreferences, deleteMe } = require('../controllers/userController');

const router = express.Router();

// Save preferences (theme, language, currency, weekStartsOn)
router.put('/me/preferences', protect, updatePreferences);

// Delete my account
router.delete('/me', protect, deleteMe);

module.exports = router;
