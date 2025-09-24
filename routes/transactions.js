// routes/transactions.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Income = require('../models/Income');
const Expense = require('../models/Expense');

// If you already have auth middleware that sets req.user, use it here:
let auth;
try {
  auth = require('../middleware/auth'); // adjust if your path/name differs
} catch {
  // fallback: no auth; DO NOT use in production
  auth = (req, _res, next) => next();
}

// Build Asia/Bangkok day boundaries so your local entries fall inside correctly
function toBangkokRange(startYYYYMMDD, endYYYYMMDD) {
  const start = new Date(`${startYYYYMMDD}T00:00:00.000+07:00`);
  const end   = new Date(`${endYYYYMMDD}T23:59:59.999+07:00`);
  return { start, end };
}

// GET /api/v1/transactions/analytics/sum?type=income|expense&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
router.get('/analytics/sum', auth, async (req, res) => {
  try {
    // if you use auth, req.user._id should be available
    const userId = req.user?._id;
    if (!userId) {
      // If you don’t have auth, replace with your own user id resolution
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const type = String(req.query.type || '').toLowerCase();
    if (!['income', 'expense'].includes(type)) {
      return res.status(400).json({ message: 'type required (income|expense)' });
    }

    const startDate = req.query.startDate;
    const endDate   = req.query.endDate;
    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'startDate and endDate are required' });
    }

    const { start, end } = toBangkokRange(startDate, endDate);
    const Model = type === 'income' ? Income : Expense;

    // Some docs may store the business date in `date`, some rely on `createdAt`.
    // We prefer `date` and fall back to `createdAt`.
    const pipeline = [
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      { $addFields: { _usedDate: { $ifNull: ['$date', '$createdAt'] }, _amt: { $ifNull: ['$amount', 0] } } },
      { $match: { _usedDate: { $gte: start, $lte: end } } },
      // if expenses are stored as negatives, $abs makes totals positive
      { $group: { _id: null, total: { $sum: type === 'expense' ? { $abs: '$_amt' } : '$_amt' } } },
      { $project: { _id: 0, total: 1 } },
    ];

    const agg = await Model.aggregate(pipeline);
    const total = agg?.[0]?.total || 0;

    return res.json({ total });
  } catch (err) {
    console.error('analytics/sum error:', err);
    return res.status(500).json({ message: 'Internal error' });
  }
});

module.exports = router;
