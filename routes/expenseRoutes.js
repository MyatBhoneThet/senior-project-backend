const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  addExpense,
  getAllExpense,
  deleteExpense,
  downloadExpenseExcel,
  updateExpense,
  bulkDeleteExpense, // NEW
} = require('../controllers/expenseController');

const router = express.Router();

router.post('/add', protect, addExpense);
router.get('/get', protect, getAllExpense);
router.put('/:id', protect, updateExpense);
router.delete('/bulk-delete', protect, bulkDeleteExpense); // NEW: bulk delete route (MUST be before /:id)
router.delete('/:id', protect, deleteExpense);
router.get('/downloadexcel', protect, downloadExpenseExcel);

module.exports = router;
