const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const c = require('../controllers/jarController');

router.get('/', protect, c.listJars);
router.post('/', protect, c.createJar);
router.delete('/:id', protect, c.deleteJar);

router.post('/:id/fund', protect, c.fundJar);
router.post('/:id/withdraw', protect, c.withdrawJar);
router.post('/transfer', protect, c.transferBetweenJars);
router.get('/transfers/history', protect, c.listTransfers);

module.exports = router;
