const dayjs = require('dayjs');
const Transaction = require('../models/Transaction');
const mongoose = require('mongoose');
const Income = require('../models/Income');
const Expense = require('../models/Expense');


exports.createTransaction = async (req, res) => {
  try {
    const doc = await Transaction.create({ ...req.body, userId: req.user._id });
    res.status(201).json(doc);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

exports.listTransactions = async (req, res) => {
  const userId = req.user._id;
  const { type, from, to } = req.query;
  const q = { userId };
  if (type) q.type = type;
  if (from || to) {
    q.date = {};
    if (from) q.date.$gte = new Date(from);
    if (to) q.date.$lte = new Date(to);
  }
  const rows = await Transaction.find(q).sort({ date: -1, createdAt: -1 });
  res.json(rows);
};

exports.getTransaction = async (req, res) => {
  const userId = req.user._id;
  const row = await Transaction.findOne({ _id: req.params.id, userId });
  if (!row) return res.status(404).json({ message: 'Not found' });
  res.json(row);
};

exports.updateTransaction = async (req, res) => {
  try {
    const userId = req.user._id;
    const row = await Transaction.findOneAndUpdate({ _id: req.params.id, userId }, req.body, { new: true });
    if (!row) return res.status(404).json({ message: 'Not found' });
    res.json(row);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

exports.deleteTransaction = async (req, res) => {
  const userId = req.user._id;
  await Transaction.deleteOne({ _id: req.params.id, userId });
  res.json({ ok: true });
};


function toBangkokRange(startYYYYMMDD, endYYYYMMDD) {
  const start = new Date(`${startYYYYMMDD}T00:00:00.000+07:00`);
  const end   = new Date(`${endYYYYMMDD}T23:59:59.999+07:00`);
  return { start, end };
}

// GET /api/v1/transactions/analytics/sum?type=income|expense&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
exports.sumBy = async (req, res) => {
  try {
    // protect middleware should attach the user; support either id or _id
    const uid = req.user?.id || req.user?._id;
    if (!uid) return res.status(401).json({ message: 'Unauthorized' });

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

    // Prefer business `date`, fall back to `createdAt` so older docs still count
    const pipeline = [
      { $match: { userId: new mongoose.Types.ObjectId(uid) } },
      {
        $addFields: {
          _usedDate: { $ifNull: ['$date', '$createdAt'] },
          _amt: { $ifNull: ['$amount', 0] },
        },
      },
      { $match: { _usedDate: { $gte: start, $lte: end } } },
      // If expenses are saved as negative amounts, $abs makes the sum positive
      { $group: { _id: null, total: { $sum: type === 'expense' ? { $abs: '$_amt' } : '$_amt' } } },
      { $project: { _id: 0, total: 1 } },
    ];

    const agg = await Model.aggregate(pipeline);
    const total = agg?.[0]?.total || 0;

    return res.json({ total });
  } catch (err) {
    console.error('transactions.analytics.sum error:', err);
    return res.status(500).json({ message: 'Internal error' });
  }
};
