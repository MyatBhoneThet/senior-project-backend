const RecurringRule = require('../models/RecurringRule');
const { runGeneration } = require('../services/recurrenceEngine');

const parseDate = (v) => (v ? new Date(v) : undefined);

exports.createRule = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const b = req.body || {};
    const doc = await RecurringRule.create({
      userId,
      type: b.type,                 // 'income' | 'expense'
      category: b.category || '',
      source: b.source || '',
      amount: Number(b.amount),
      dayOfMonth: b.dayOfMonth ? Number(b.dayOfMonth) : undefined, // optional
      startDate: parseDate(b.startDate) || new Date(),
      endDate: parseDate(b.endDate),
      isActive: b.isActive !== false,
      notes: b.notes || '',
    });
    const result = await runGeneration(userId);   // immediate materialization
    res.status(201).json({ rule: doc, ...result });
  } catch (e) {
    console.error('createRule', e);
    res.status(400).json({ message: e.message || 'Failed to create rule' });
  }
};

exports.getRules = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const rules = await RecurringRule.find({ userId }).sort({ createdAt: -1 });
    res.json(rules);
  } catch (e) {
    res.status(500).json({ message: e.message || 'Failed to load rules' });
  }
};

exports.updateRule = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { id } = req.params;
    const b = req.body || {};

    const patch = {
      type: b.type,
      category: b.category,
      source: b.source,
      amount: b.amount !== undefined ? Number(b.amount) : undefined,
      dayOfMonth: b.dayOfMonth !== undefined ? Number(b.dayOfMonth) : undefined,
      startDate: b.startDate ? parseDate(b.startDate) : undefined,
      endDate: b.endDate ? parseDate(b.endDate) : undefined,
      isActive: typeof b.isActive === 'boolean' ? b.isActive : undefined,
      notes: b.notes,
    };
    Object.keys(patch).forEach(k => patch[k] === undefined && delete patch[k]);

    const doc = await RecurringRule.findOneAndUpdate({ _id: id, userId }, { $set: patch }, { new: true });
    if (!doc) return res.status(404).json({ message: 'Rule not found' });

    const result = await runGeneration(userId);
    res.json({ rule: doc, ...result });
  } catch (e) {
    res.status(400).json({ message: e.message || 'Failed to update rule' });
  }
};

exports.toggleRule = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { id } = req.params;
    const { isActive } = req.body;
    const doc = await RecurringRule.findOneAndUpdate({ _id: id, userId }, { $set: { isActive: !!isActive } }, { new: true });
    if (!doc) return res.status(404).json({ message: 'Rule not found' });
    res.json({ rule: doc });
  } catch (e) {
    res.status(400).json({ message: e.message || 'Failed to toggle rule' });
  }
};

exports.deleteRule = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { id } = req.params;
    await RecurringRule.deleteOne({ _id: id, userId });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ message: e.message || 'Failed to delete rule' });
  }
};


exports.runNow = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const result = await runGeneration(userId, true); // debug=true
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ message: e.message || 'Failed to run generator' });
  }
};

