const mongoose = require('mongoose');
const Jar = require('../models/Jar');
const JarTransfer = require('../models/JarTransfer');
const { transfer } = require('../services/jarLedger');

/* ---------------- helpers ---------------- */
function userIdOf(req) {
  return req.user?._id || req.user?.id;
}
function asAmount(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
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
    // Send friendly messages for expected errors; bubble others
    if (err && err.message) return res.status(400).json({ message: err.message });
    return next(err);
  } finally {
    session.endSession();
  }
}

/* ---------------- CRUD ---------------- */
exports.createJar = async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ message: 'Jar name is required' });

    const jar = await Jar.create({
      userId: userIdOf(req),
      name,
      color: req.body?.color || '#6b7280',
      isPrimary: !!req.body?.isPrimary,
      balance: 0,
    });
    res.json(jar);
  } catch (e) { next(e); }
};

exports.listJars = async (req, res, next) => {
  try {
    const jars = await Jar.find({ userId: userIdOf(req) }).sort({ isPrimary: -1, createdAt: -1 });
    res.json(jars);
  } catch (e) { next(e); }
};

exports.deleteJar = async (req, res, next) => {
  try {
    const jar = await Jar.findOne({ _id: req.params.id, userId: userIdOf(req) });
    if (!jar) return res.status(404).json({ message: 'Jar not found' });
    if ((jar.balance || 0) > 0) {
      return res.status(400).json({ message: 'You can only delete an empty jar. Withdraw to 0 first.' });
    }
    await Jar.deleteOne({ _id: jar._id });
    res.json({ ok: true });
  } catch (e) { next(e); }
};

/* ---------------- Money moves ---------------- */
// POST /api/v1/jars/:id/fund   → free cash → jar
exports.fundJar = async (req, res, next) => {
  const amount = asAmount(req.body?.amount);
  if (!(amount > 0)) return res.status(400).json({ message: 'Amount must be > 0' });

  return withSession(res, next, async (session) => {
    const out = await transfer({
      userId: userIdOf(req),
      fromJarId: null,
      toJarId: req.params.id,
      amount,
      memo: req.body?.memo || 'Fund jar',
      session,
    });
    return out;
  });
};

// POST /api/v1/jars/:id/withdraw  → jar → free cash
exports.withdrawJar = async (req, res, next) => {
  const amount = asAmount(req.body?.amount);
  if (!(amount > 0)) return res.status(400).json({ message: 'Amount must be > 0' });

  return withSession(res, next, async (session) => {
    const out = await transfer({
      userId: userIdOf(req),
      fromJarId: req.params.id,
      toJarId: null,
      amount,
      memo: req.body?.memo || 'Withdraw from jar',
      session,
    });
    return out;
  });
};

// POST /api/v1/jars/transfer   body: { fromJarId, toJarId, amount, memo? }
exports.transferBetweenJars = async (req, res, next) => {
  const amount = asAmount(req.body?.amount);
  if (!(amount > 0)) return res.status(400).json({ message: 'Amount must be > 0' });
  if (!req.body?.fromJarId || !req.body?.toJarId) {
    return res.status(400).json({ message: 'fromJarId and toJarId are required' });
  }

  return withSession(res, next, async (session) => {
    const out = await transfer({
      userId: userIdOf(req),
      fromJarId: req.body.fromJarId,
      toJarId: req.body.toJarId,
      amount,
      memo: req.body?.memo || 'Jar transfer',
      session,
    });
    return out;
  });
};

exports.listTransfers = async (req, res, next) => {
  try {
    const items = await JarTransfer.find({ userId: userIdOf(req) })
      .sort({ createdAt: -1 })
      .limit(200);
    res.json(items);
  } catch (e) { next(e); }
};
