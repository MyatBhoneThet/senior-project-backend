const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');  // <-- singular
const { categorySummary } = require('../controllers/analyticsController');

// GET /api/v1/analytics/category-summary?type=expense&category=Food&range=30d
router.get('/category-summary', auth, categorySummary);

module.exports = router;
