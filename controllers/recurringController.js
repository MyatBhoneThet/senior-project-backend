// backend/controllers/recurringController.js
const RecurringRule = require('../models/RecurringRule');
const { runRecurrenceOnce } = require('../services/recurrenceEngine');

// Create rule
exports.createRule = async (req, res, next) => {
  try {
    const body = req.body || {};
    const repeat = String(body.repeat || 'monthly').toLowerCase();
    if (!['weekly', 'monthly', 'yearly'].includes(repeat)) {
      return res.status(400).json({ message: 'repeat must be weekly, monthly, or yearly' });
    }

    const rule = await RecurringRule.create({
      userId: req.user._id,
      type: body.type,
      category: body.category,
      source: body.source || '',
      amount: Number(body.amount),
      repeat,
      dayOfMonth: body.dayOfMonth || undefined,
      startDate: body.startDate,
      endDate: body.endDate || undefined,
      isActive: body.isActive !== false,
      notes: body.notes || '',
      tzOffsetMinutes: body.tzOffsetMinutes ?? 420,
    });

    res.json(rule);
  } catch (err) { next(err); }
};

// List rules
exports.getRules = async (req, res, next) => {
  try {
    const rules = await RecurringRule.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json(rules);
  } catch (err) { next(err); }
};

// Update rule
exports.updateRule = async (req, res, next) => {
  try {
    const id = req.params.id;
    const body = req.body || {};
    if (body.repeat) {
      body.repeat = String(body.repeat).toLowerCase();
      if (!['weekly', 'monthly', 'yearly'].includes(body.repeat)) {
        return res.status(400).json({ message: 'repeat must be weekly, monthly, or yearly' });
      }
    }
    const rule = await RecurringRule.findOneAndUpdate(
      { _id: id, userId: req.user._id },
      {
        $set: {
          type: body.type,
          category: body.category,
          source: body.source,
          amount: body.amount,
          repeat: body.repeat,
          dayOfMonth: body.dayOfMonth,
          startDate: body.startDate,
          endDate: body.endDate,
          isActive: body.isActive,
          notes: body.notes,
          tzOffsetMinutes: body.tzOffsetMinutes,
        },
      },
      { new: true }
    );
    if (!rule) return res.status(404).json({ message: 'Rule not found' });
    res.json(rule);
  } catch (err) { next(err); }
};

// Toggle active
exports.toggleRule = async (req, res, next) => {
  try {
    const id = req.params.id;
    const { isActive } = req.body || {};
    const rule = await RecurringRule.findOneAndUpdate(
      { _id: id, userId: req.user._id },
      { $set: { isActive: !!isActive } },
      { new: true }
    );
    if (!rule) return res.status(404).json({ message: 'Rule not found' });
    res.json(rule);
  } catch (err) { next(err); }
};

// Delete
exports.deleteRule = async (req, res, next) => {
  try {
    const id = req.params.id;
    await RecurringRule.deleteOne({ _id: id, userId: req.user._id });
    res.json({ ok: true });
  } catch (err) { next(err); }
};

// Manual run (and also used by cron)
exports.runNow = async (req, res, next) => {
  try {
    const userId = req.user?._id || null;
    await runRecurrenceOnce(userId); // if userId null, run for all
    res.json({ ok: true });
  } catch (err) { next(err); }
};
