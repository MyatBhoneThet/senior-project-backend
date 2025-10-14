// backend/controllers/goalController.js
const mongoose = require('mongoose');
const Goal = require('../models/Goal');
const Jar = require('../models/Jar');
const { transfer } = require('../services/jarLedger');
const { autoAllocate } = require('../services/goalAutoAllocator');

// ——— helpers ———
function userIdOf(req) {
  return req.user?._id || req.user?.id;
}
function toUtcMidnight(v) {
  if (!v) return v;
  if (v instanceof Date) {
    return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate(), 0,0,0,0));
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Date.UTC(+m[1], +m[2]-1, +m[3], 0,0,0,0));
  const parsed = new Date(s);
  if (!isNaN(parsed)) {
    return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate(), 0,0,0,0));
  }
  return undefined;
}
async function withSession(res, next, handler) {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const result = await handler(session);
    await session.commitTransaction();
    return res.json(result);
  } catch (err) {
    try { await session.abortTransaction(); } catch {}
    // return readable error (400) for expected flow, otherwise let express handle
    if (err && err.message) return res.status(400).json({ message: err.message });
    return next(err);
  } finally {
    session.endSession();
  }
}

// ——— CRUD ———
// GET /api/v1/goals
exports.listGoals = async (req, res, next) => {
  try {
    const goals = await Goal.find({ userId: userIdOf(req) }).sort({ createdAt: -1 });
    res.json(goals);
  } catch (e) { next(e); }
};

// POST /api/v1/goals
exports.createGoal = async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const { title, targetAmount, targetDate, jarId, autoAllocate: aa } = req.body;

    if (!title || !targetAmount || !targetDate || !jarId) {
      return res.status(400).json({ message: 'title, targetAmount, targetDate, jarId are required' });
    }
    const jar = await Jar.findOne({ _id: jarId, userId });
    if (!jar) return res.status(400).json({ message: 'Jar not found' });

    const goal = await Goal.create({
      userId,
      title: String(title).trim(),
      targetAmount: Number(targetAmount),
      targetDate: toUtcMidnight(targetDate),
      jarId,
      currentAmount: 0,
      status: 'active',
      autoAllocate: {
        enabled: aa?.enabled || false,
        type: aa?.type === 'fixed' ? 'fixed' : 'percent',
        value: Number(aa?.value || 0),
      },
    });

    res.json(goal);
  } catch (e) { next(e); }
};

// DELETE /api/v1/goals/:id
exports.deleteGoal = async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const goal = await Goal.findOne({ _id: req.params.id, userId });
    if (!goal) return res.status(404).json({ message: 'Goal not found' });
    await Goal.deleteOne({ _id: goal._id });
    res.json({ ok: true });
  } catch (e) { next(e); }
};

// POST /api/v1/goals/:id/fund   body: { amount, memo? }
exports.fundGoal = async (req, res, next) => {
  const amount = Number(req.body?.amount);
  if (!(amount > 0)) return res.status(400).json({ message: 'Amount must be > 0' });

  const userId = userIdOf(req);

  return withSession(res, next, async (session) => {
    // load goal & jar
    const goal = await Goal.findOne({ _id: req.params.id, userId }, null, { session });
    if (!goal) throw new Error('Goal not found');
    const jar = await Jar.findOne({ _id: goal.jarId, userId }, null, { session });
    if (!jar) throw new Error('Linked jar not found');

    // move free cash → goal's jar, and tie to goal so progress updates
    const out = await transfer({
      userId,
      fromJarId: null,
      toJarId: jar._id,
      amount,
      memo: req.body?.memo || `Fund goal: ${goal.title}`,
      relatedGoalId: goal._id,
      session,
    });

    // reload goal to include updated currentAmount/status
    const updated = await Goal.findOne({ _id: goal._id, userId }, null, { session });

    return {
      ok: true,
      message: `Funded THB ${amount.toLocaleString()} to "${goal.title}"`,
      goal: updated,
      transfer: out.transfer,
    };
  });
};

// POST /api/v1/goals/auto-allocate   body: { amount }
exports.autoAllocateNow = async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const incomeAmount = Number(req.body?.amount);
    if (!(incomeAmount > 0)) return res.status(400).json({ message: 'Amount must be > 0' });

    const result = await autoAllocate({
      userId,
      incomeAmount,
      memo: 'Manual auto-allocate',
    });
    res.json({ ok: true, result });
  } catch (e) { next(e); }
};
