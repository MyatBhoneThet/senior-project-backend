const express = require('express');
const router = express.Router();
const { protect: auth } = require('../middleware/authMiddleware');  // direct import instead of auth wrapper
const { categorySummary } = require('../controllers/analyticsController');

// GET /api/v1/analytics/category-summary?type=expense&category=Food&range=30d
router.get('/category-summary', auth, categorySummary);

module.exports = router;
