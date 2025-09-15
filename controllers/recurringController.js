const RecurringRule = require('../models/RecurringRule');
const { runGeneration } = require('../services/recurrenceEngine');

// Accepts "YYYY-MM-DD" OR "DD/MM/YYYY"
function parseDateLoose(v) {
  if (!v) return undefined;
  if (typeof v === 'string' && v.includes('/')) {
    const [dd, mm, yyyy] = v.split('/').map(Number);
    return new Date(yyyy, (mm || 1) - 1, dd || 1);
  }
  return new Date(v);
}

exports.createRule = async (req, res) => {
  try {
    const userId = req.user._id;
    const b = { ...req.body };
    delete b.timezone; // ignore any timezone coming from client/UI

    const rule = await RecurringRule.create({
      userId,
      type: b.type,
      category: b.category,
      source: b.source || '',
      amount: Number(b.amount),
      frequency: 'monthly',
      dayOfMonth: Number(b.dayOfMonth || 1),
      startDate: parseDateLoose(b.startDate),
      endDate: b.endDate ? parseDateLoose(b.endDate) : undefined,
      isActive: b.isActive !== false,
      notes: b.notes || ''
    });

    // Immediately backfill for this user (idempotent)
    await runGeneration(userId);
    res.status(201).json(rule);
  } catch (e) {
    console.error('createRule error:', e);
    res.status(400).json({ message: e.message });
  }
};

exports.getRules = async (req, res) => {
  try {
    const rules = await RecurringRule.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json(rules);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.updateRule = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const b = { ...req.body };
    delete b.timezone;

    const update = {
      type: b.type,
      category: b.category,
      source: b.source || '',
      amount: Number(b.amount),
      dayOfMonth: Number(b.dayOfMonth || 1),
      startDate: b.startDate ? parseDateLoose(b.startDate) : undefined,
      endDate: b.endDate ? parseDateLoose(b.endDate) : undefined,
      isActive: b.isActive,
      notes: b.notes || ''
    };

    const rule = await RecurringRule.findOneAndUpdate({ _id: id, userId }, update, { new: true });
    if (!rule) return res.status(404).json({ message: 'Rule not found' });

    await runGeneration(userId);
    res.json(rule);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

exports.toggleRule = async (req, res) => {
  try {
    const rule = await RecurringRule.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { isActive: !!req.body.isActive },
      { new: true }
    );
    if (!rule) return res.status(404).json({ message: 'Rule not found' });
    res.json(rule);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

exports.deleteRule = async (req, res) => {
  try {
    await RecurringRule.deleteOne({ _id: req.params.id, userId: req.user._id });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

exports.runNow = async (req, res) => {
  try {
    await runGeneration(req.user._id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
