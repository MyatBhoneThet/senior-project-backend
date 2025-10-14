// backend/services/jarLedger.js
const mongoose = require('mongoose');
const Jar = require('../models/Jar');
const JarTransfer = require('../models/JarTransfer');
const Goal = require('../models/Goal');

/**
 * Move money between free cash (null) and jars.
 * - Prevents overdraft on fromJar.
 * - Updates goal.currentAmount when relatedGoalId is provided.
 * - Marks goal as 'achieved' when currentAmount >= targetAmount.
 */
async function transfer({
  userId,
  fromJarId = null,
  toJarId = null,
  amount,
  memo = '',
  relatedGoalId = null,
  session,
}) {
  if (!(amount > 0)) throw new Error('Amount must be > 0');
  const opts = session ? { session } : {};

  // 1) Validate "from" jar has enough balance
  let fromJar = null;
  if (fromJarId) {
    fromJar = await Jar.findOne({ _id: fromJarId, userId }, null, opts);
    if (!fromJar) throw new Error('Source jar not found');
    if ((fromJar.balance || 0) < amount) throw new Error('Insufficient jar balance');
  }

  // 2) Apply $inc to jar balances
  if (fromJarId) {
    await Jar.updateOne({ _id: fromJarId, userId }, { $inc: { balance: -amount } }, opts);
  }
  if (toJarId) {
    const toJar = await Jar.findOne({ _id: toJarId, userId }, null, opts);
    if (!toJar) throw new Error('Destination jar not found');
    await Jar.updateOne({ _id: toJarId, userId }, { $inc: { balance: amount } }, opts);
  }

  // 3) Create ledger row
  const [jt] = await JarTransfer.create(
    [{ userId, fromJarId, toJarId, amount, memo, relatedGoalId }],
    opts
  );

  // 4) If tied to a goal, maintain goal.currentAmount and status
  let goalAfter = null;
  if (relatedGoalId) {
    const delta = toJarId ? amount : -amount; // funding goal increases, withdrawing decreases
    goalAfter = await Goal.findOneAndUpdate(
      { _id: relatedGoalId, userId },
      { $inc: { currentAmount: delta } },
      { new: true, ...opts }
    );

    if (goalAfter) {
      const reached = Number(goalAfter.currentAmount || 0) >= Number(goalAfter.targetAmount || 0);
      if (reached && goalAfter.status !== 'achieved') {
        goalAfter = await Goal.findOneAndUpdate(
          { _id: goalAfter._id, userId },
          { $set: { status: 'achieved' } },
          { new: true, ...opts }
        );
      }
      if (!reached && goalAfter.status === 'achieved') {
        // If user withdraws back below target, return to 'active'
        goalAfter = await Goal.findOneAndUpdate(
          { _id: goalAfter._id, userId },
          { $set: { status: 'active' } },
          { new: true, ...opts }
        );
      }
    }
  }

  // 5) Return updated jar balances to caller (optional for UI)
  const [fromJarNew, toJarNew] = await Promise.all([
    fromJarId ? Jar.findOne({ _id: fromJarId, userId }, null, opts) : Promise.resolve(null),
    toJarId ? Jar.findOne({ _id: toJarId, userId }, null, opts) : Promise.resolve(null),
  ]);

  return {
    transfer: jt,
    fromJar: fromJarNew,
    toJar: toJarNew,
    goal: goalAfter,
  };
}

module.exports = { transfer };
