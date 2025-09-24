const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/transactionController');

router.use(protect);

router.post('/', ctrl.createTransaction);
router.get('/', ctrl.listTransactions);
router.get('/analytics/sum', ctrl.sumBy); // place BEFORE param routes to avoid conflicts
router.get('/:id', ctrl.getTransaction);
router.patch('/:id', ctrl.updateTransaction);
router.delete('/:id', ctrl.deleteTransaction);

module.exports = router;