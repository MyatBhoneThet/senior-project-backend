const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  addExpense,
  getAllExpense,
  deleteExpense,
  downloadExpenseExcel,
  updateExpense, // ← ADD
} = require('../controllers/expenseController');

const router = express.Router();

router.post('/add', protect, addExpense);
router.get('/get', protect, getAllExpense);
router.put('/:id', protect, updateExpense);       // ← EDIT uses this
router.delete('/:id', protect, deleteExpense);
router.get('/downloadexcel', protect, downloadExpenseExcel);

module.exports = router;
