// backend/routes/debugRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const Income = require('../models/Income');
const Expense = require('../models/Expense');

router.get('/me', protect, async (req, res) => {
  const userId = req.user?._id || req.user?.id || req.userId;
  const incMine = await Income.countDocuments({ userId });
  const expMine = await Expense.countDocuments({ userId });
  const incomeSample = await Income.find({ userId }).sort({ date:-1 }).limit(5).lean();
  const expenseSample = await Expense.find({ userId }).sort({ date:-1 }).limit(5).lean();
  res.json({ userId, counts: { incMine, expMine }, incomeSample, expenseSample });
});
module.exports = router;
