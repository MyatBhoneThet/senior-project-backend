const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware'); // adjust path to your auth middleware
const ctrl = require('../controllers/recurringController');

router.use(protect);
router.post('/', ctrl.createRule);
router.get('/', ctrl.getRules);
router.patch('/:id', ctrl.updateRule);
router.patch('/:id/toggle', ctrl.toggleRule);
router.delete('/:id', ctrl.deleteRule);

module.exports = router;