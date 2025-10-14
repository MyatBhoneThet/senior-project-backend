// backend/routes/recurringRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/recurringController');

// CRUD
router.get('/', protect, ctrl.getRules);
router.post('/', protect, ctrl.createRule);
router.patch('/:id', protect, ctrl.updateRule);
router.patch('/:id/toggle', protect, ctrl.toggleRule);
router.delete('/:id', protect, ctrl.deleteRule);

// Run generator now (used by UI after save/toggle/delete)
router.post('/run', protect, ctrl.runNow);

module.exports = router;
