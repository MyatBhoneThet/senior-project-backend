const dayjs = require('dayjs');
const Transaction = require('../models/Transaction');

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

// Analytics: sums by category/source for 30d and overall
exports.sumBy = async (req, res) => {
  const userId = req.user._id;
  const { type, category, source } = req.query; // at least type
  if (!type) return res.status(400).json({ message: 'type required (income|expense)' });

  const matchBase = { userId, type };
  if (category) matchBase.category = category;
  if (source) matchBase.source = source;

  const now = dayjs();
  const from30 = now.subtract(30, 'day').toDate();

  const [last30, overall] = await Promise.all([
    Transaction.aggregate([
      { $match: { ...matchBase, date: { $gte: from30 } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Transaction.aggregate([
      { $match: matchBase },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
  ]);

  res.json({
    type,
    category: category || null,
    source: source || null,
    last30Days: last30[0]?.total || 0,
    overall: overall[0]?.total || 0,
  });
};