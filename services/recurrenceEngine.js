const cron = require('node-cron');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const RecurringRule = require('../models/RecurringRule');
const Transaction = require('../models/Transaction');

// Register plugins
dayjs.extend(utc);
dayjs.extend(timezone);

const TZ_DEFAULT = 'Asia/Bangkok';

/** Clamp a desired dayOfMonth into an actual calendar date for the given month. */
function clampDay(year, monthIndex0, dayOfMonth) {
  // monthIndex0: 0..11
  const daysInMonth = dayjs().year(year).month(monthIndex0).daysInMonth();
  const day = Math.min(Math.max(1, dayOfMonth), daysInMonth);
  return day;
}

/** Returns a JS Date at local midnight in the given tz for a target Y-M-D */
function makeLocalDate(year, monthIndex0, day, timezoneName) {
  const d = dayjs.tz(
    `${year}-${String(monthIndex0 + 1).padStart(2,'0')}-${String(day).padStart(2,'0')} 00:05`,
    timezoneName
  );
  return d.toDate();
}

/** Compute all months between start and end (inclusive). */
function* monthIterator(start, end) {
  let cur = dayjs(start).startOf('month');
  const stop = dayjs(end).startOf('month');
  while (cur.isBefore(stop) || cur.isSame(stop)) {
    yield { year: cur.year(), monthIndex0: cur.month() };
    cur = cur.add(1, 'month');
  }
}

/** Core: ensure one transaction exists for a given rule+month. */
async function upsertMonthlyTransactionFor(rule, year, monthIndex0) {
  const tzName = rule.timezone || TZ_DEFAULT;
  const day = clampDay(year, monthIndex0, rule.dayOfMonth || 1);
  const date = makeLocalDate(year, monthIndex0, day, tzName);
  const periodKey = `${year}-${String(monthIndex0+1).padStart(2,'0')}`;

  const doc = {
    userId: rule.userId,
    type: rule.type,
    category: rule.category,
    source: rule.source,
    amount: rule.amount,
    date,
    notes: rule.notes,
    isRecurring: true,
    recurringRuleId: rule._id,
    periodKey,
  };

  try {
    await Transaction.updateOne(
      { userId: rule.userId, recurringRuleId: rule._id, periodKey },
      { $setOnInsert: doc },
      { upsert: true }
    );
    return true;
  } catch (err) {
    if (err?.code === 11000) return false; // duplicate ok
    throw err;
  }
}

/** Run generation for all due rules including catch-up. */
async function runGeneration({ now = new Date() } = {}) {
  const nowDj = dayjs(now);
  const rules = await RecurringRule.find({ isActive: true });

  for (const rule of rules) {
    const start = dayjs(rule.startDate);
    const end = rule.endDate ? dayjs(rule.endDate) : nowDj;
    if (end.isBefore(start, 'month')) continue;

    const fromMonth = rule.lastRunAt ? dayjs(rule.lastRunAt) : start;
    const windowStart = fromMonth.startOf('month');
    const windowEnd = nowDj.startOf('month');

    for (const { year, monthIndex0 } of monthIterator(windowStart, windowEnd)) {
      await upsertMonthlyTransactionFor(rule, year, monthIndex0);
    }

    rule.lastRunAt = nowDj.tz(rule.timezone || TZ_DEFAULT).toDate();
    await rule.save();
  }
}

/** Start cron that runs daily at 00:15 Asia/Bangkok. */
function startRecurrenceCron() {
  cron.schedule('15 0 * * *', async () => {
    try {
      await runGeneration();
      console.log('[recurrence] generation completed');
    } catch (e) {
      console.error('[recurrence] error', e);
    }
  }, { timezone: TZ_DEFAULT });
}

module.exports = { startRecurrenceCron, runGeneration, upsertMonthlyTransactionFor };