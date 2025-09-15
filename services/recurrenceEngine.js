const cron = require('node-cron');
const mongoose = require('mongoose');
const RecurringRule = require('../models/RecurringRule');
const Transaction  = require('../models/Transaction');
const Income       = require('../models/Income');
const Expense      = require('../models/Expense');

// Helpers
function lastDayOfMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}
function clampDay(year, monthIndex, day) {
  const last = lastDayOfMonth(year, monthIndex);
  return Math.min(Math.max(day || 1, 1), last);
}
function periodKey(year, monthIndex) {
  const mm = String(monthIndex + 1).padStart(2, '0');
  return `${year}-${mm}`;
}
function* monthRange(startDate, endDate) {
  let y = startDate.getFullYear();
  let m = startDate.getMonth();
  const endY = endDate.getFullYear();
  const endM = endDate.getMonth();
  while (y < endY || (y === endY && m <= endM)) {
    yield { year: y, monthIndex: m };
    m++;
    if (m === 12) { m = 0; y++; }
  }
}

async function upsertMonthlyTransactionFor(rule, year, monthIndex) {
  const { _id: ruleId, userId, type, category, source, amount, dayOfMonth } = rule;
  const day = clampDay(year, monthIndex, dayOfMonth);
  const date = new Date(year, monthIndex, day, 0, 0, 0, 0);
  const pKey = periodKey(year, monthIndex);

  // 1) Transaction (idempotent)
  await Transaction.updateOne(
    { userId, recurringRuleId: ruleId, periodKey: pKey },
    { $setOnInsert: {
        type, category,
        source: source || category,
        amount, date,
        isRecurring: true, icon: ''
      }
    },
    { upsert: true }
  );

  // 2) Mirror into Income/Expense (idempotent) — your pages read these
  const commonFilter = {
    userId, date, amount,
    source: source || category,
    categoryName: category,
    category
  };
  if (type === 'income') {
    await Income.updateOne(commonFilter, { $setOnInsert: { icon: '' } }, { upsert: true });
  } else {
    await Expense.updateOne(commonFilter, { $setOnInsert: { icon: '' } }, { upsert: true });
  }
}

async function runGeneration(userId = null) {
  const now = new Date();
  const rules = await RecurringRule.find(
    Object.assign({ isActive: true }, userId ? { userId: new mongoose.Types.ObjectId(userId) } : {})
  ).lean();

  for (const rule of rules) {
    const start = new Date(rule.startDate);
    const until = new Date(Math.min(new Date(rule.endDate || now).getTime(), now.getTime()));
    if (until < start) continue;

    for (const { year, monthIndex } of monthRange(start, until)) {
      await upsertMonthlyTransactionFor(rule, year, monthIndex);
    }
    await RecurringRule.updateOne({ _id: rule._id }, { $set: { lastRunAt: new Date() } });
  }
}

function startRecurrenceCron() {
  // Run daily 00:15 server local time; NO timezone string → no TZ crashes
  cron.schedule('15 0 * * *', async () => {
    try {
      await runGeneration();
      console.log('[recurrence] OK');
    } catch (e) {
      console.error('[recurrence] error', e);
    }
  });
}

module.exports = { startRecurrenceCron, runGeneration };
