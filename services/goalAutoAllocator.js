const mongoose = require('mongoose');
const Goal = require('../models/Goal');
const Jar = require('../models/Jar');
const { transfer } = require('./jarLedger');

// Given an income amount, allocate to enabled goals in order of earliest deadline
async function autoAllocate({ userId, incomeAmount, memo = 'Auto-allocate on income', session }) {
  const opts = session ? { session } : {};

  const goals = await Goal.find({
    userId,
    status: 'active',
    'autoAllocate.enabled': true
  }).sort({ targetDate: 1 }).lean();

  for (const g of goals) {
    const remaining = Math.max(0, g.targetAmount - g.currentAmount);
    if (remaining <= 0) continue;

    let alloc = 0;
    if (g.autoAllocate.type === 'percent') {
      alloc = Math.floor((incomeAmount * g.autoAllocate.value) / 100);
    } else {
      alloc = g.autoAllocate.value;
    }
    alloc = Math.min(alloc, remaining);
    if (alloc <= 0) continue;

    // move from free cash (null) -> goal.jarId
    await transfer({
      userId,
      fromJarId: null,
      toJarId: g.jarId,
      amount: alloc,
      memo,
      relatedGoalId: g._id,
      session
    });

    incomeAmount -= alloc; // remaining free cash
    if (incomeAmount <= 0) break;
  }
}

module.exports = { autoAllocate };
