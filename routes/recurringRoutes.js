const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/recurringController');

router.use(protect);
router.post('/', ctrl.createRule);
router.get('/', ctrl.getRules);
router.patch('/:id', ctrl.updateRule);
router.patch('/:id/toggle', ctrl.toggleRule);
router.delete('/:id', ctrl.deleteRule);

// Optional manual trigger to debug/backfill
router.post('/run', ctrl.runNow);

module.exports = router;
