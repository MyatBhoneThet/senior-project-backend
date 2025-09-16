const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/recurringController');

router.use(protect);
router.get('/', ctrl.getRules);
router.post('/', ctrl.createRule);
router.patch('/:id', ctrl.updateRule);
router.patch('/:id/toggle', ctrl.toggleRule);
router.delete('/:id', ctrl.deleteRule);
router.post('/run', ctrl.runNow); // manual trigger

module.exports = router;
