const RecurringRule = require('../models/RecurringRule');
const { runGeneration } = require('../services/recurrenceEngine');

exports.createRule = async (req, res) => {
  try {
    const userId = req.user._id; // from protect middleware
    const rule = await RecurringRule.create({ ...req.body, userId });
    // Generate immediately for any missed months
    await runGeneration();
    res.status(201).json(rule);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

exports.getRules = async (req, res) => {
  const userId = req.user._id;
  const rules = await RecurringRule.find({ userId }).sort({ createdAt: -1 });
  res.json(rules);
};

exports.updateRule = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const rule = await RecurringRule.findOneAndUpdate({ _id: id, userId }, req.body, { new: true });
    if (!rule) return res.status(404).json({ message: 'Rule not found' });

    // If amount/day changed, future months will use new values; we also catch-up
    await runGeneration();
    res.json(rule);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

exports.toggleRule = async (req, res) => {
  const userId = req.user._id;
  const { id } = req.params;
  const { isActive } = req.body;
  const rule = await RecurringRule.findOneAndUpdate({ _id: id, userId }, { isActive }, { new: true });
  if (!rule) return res.status(404).json({ message: 'Rule not found' });
  res.json(rule);
};

exports.deleteRule = async (req, res) => {
  const userId = req.user._id;
  const { id } = req.params;
  await RecurringRule.deleteOne({ _id: id, userId });
  res.json({ ok: true });
};