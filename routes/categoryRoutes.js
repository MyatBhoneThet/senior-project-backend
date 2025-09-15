const express = require('express');
const router = express.Router();

const { protect } = require('../middleware/authMiddleware');
const { listByType, create } = require('../controllers/categoryController');

// GET /api/v1/categories?type=expense|income
router.get('/',  protect, listByType);

// POST /api/v1/categories  { type: 'income'|'expense', name, icon?, color?, keywords? }
router.post('/', protect, create);

module.exports = router;
