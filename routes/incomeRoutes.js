const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  addIncome,
  getAllIncome,
  deleteIncome,
  downloadIncomeExcel,
  updateIncome,
  bulkDeleteIncome, // NEW
} = require('../controllers/incomeController');

const router = express.Router();

router.post('/add', protect, addIncome);
router.get('/get', protect, getAllIncome);
router.put('/:id', protect, updateIncome);
router.delete('/bulk-delete', protect, bulkDeleteIncome); // NEW: bulk delete route (MUST be before /:id)
router.delete('/:id', protect, deleteIncome);
router.get('/downloadexcel', protect, downloadIncomeExcel);

module.exports = router;
