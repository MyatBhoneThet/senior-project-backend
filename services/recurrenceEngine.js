// backend/services/recurrenceEngine.js
const RecurringRule = require('../models/RecurringRule');
const Expense = require('../models/Expense');
const Income = require('../models/Income');

/* ============== TZ helpers ============== */
function toLocal(dUtc, offsetMin) { return new Date(dUtc.getTime() + offsetMin * 60_000); }
function toUTC(dLocal, offsetMin) { return new Date(dLocal.getTime() - offsetMin * 60_000); }
function startOfLocalDay(dUtc, offsetMin) {
  const L = toLocal(dUtc, offsetMin);
  const s = new Date(Date.UTC(L.getUTCFullYear(), L.getUTCMonth(), L.getUTCDate(), 0,0,0,0));
  return toUTC(s, offsetMin);
}
function endOfLocalDay(dUtc, offsetMin) {
  const L = toLocal(dUtc, offsetMin);
  const e = new Date(Date.UTC(L.getUTCFullYear(), L.getUTCMonth(), L.getUTCDate(), 23,59,59,999));
  return toUTC(e, offsetMin);
}

/* ============== date math ============== */
function daysInMonth(y, m) { return new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); }

function nextMonthly(fromLocal, dom) {
  const y = fromLocal.getUTCFullYear();
  const m = fromLocal.getUTCMonth();
  const nm = m + 1;
  const ny = y + Math.floor(nm / 12);
  const realM = nm % 12;
  const d = Math.min(dom, daysInMonth(ny, realM));
  return new Date(Date.UTC(ny, realM, d, 0, 0, 0, 0));
}

function nextWeekly(fromLocal) {
  const nx = new Date(fromLocal);
  nx.setUTCDate(nx.getUTCDate() + 7);
  nx.setUTCHours(0,0,0,0);
  return nx;
}

function nextYearly(fromLocal) {
  const y = fromLocal.getUTCFullYear() + 1;
  const m = fromLocal.getUTCMonth();
  let d = fromLocal.getUTCDate();
  // clamp Feb 29 → Feb 28 on non-leap years
  if (m === 1 && d === 29 && daysInMonth(y, m) === 28) d = 28;
  return new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
}

/* Step forward exactly one period from a given local midnight */
function nextAfter(rule, localMid) {
  const rep = String(rule.repeat || 'monthly').toLowerCase();
  if (rep === 'weekly') return nextWeekly(localMid);
  if (rep === 'yearly') return nextYearly(localMid);
  const dom = rule.dayOfMonth || localMid.getUTCDate();
  return nextMonthly(localMid, dom);
}

/* ============== core generator ============== */
async function ensureTransaction(rule, whenLocalMidnight) {
  const offset = rule.tzOffsetMinutes ?? 420;

  // Convert to UTC (this is what we save as the transaction's date)
  const dateUTC = toUTC(whenLocalMidnight, offset);

  const base = {
    userId: rule.userId,
    category: rule.category,
    source: rule.source || '',
    amount: Number(rule.amount),
    date: dateUTC, // normalized UTC midnight for that local day
    notes: (rule.notes ? `${rule.notes} ` : '') + '[Recurring]',
  };

  const Model = rule.type === 'income' ? Income : Expense;

  // Idempotency: look for an exact same record (same date + key fields).
  const exists = await Model.findOne({
    userId: rule.userId,
    category: rule.category,
    source: rule.source || '',
    amount: Number(rule.amount),
    date: dateUTC,
  }).lean();

  if (!exists) {
    await Model.create(base);
  }
}

/* iterate occurrences from "fromLocal" to "untilLocal" inclusive, by rule.repeat */
function* iterateOccurrences(rule, fromLocal, untilLocal) {
  const rep = String(rule.repeat || 'monthly').toLowerCase();
  let cursor = new Date(fromLocal);

  if (rep === 'weekly') {
    while (cursor <= untilLocal) {
      yield new Date(cursor);
      cursor = nextWeekly(cursor);
    }
    return;
  }

  if (rep === 'yearly') {
    while (cursor <= untilLocal) {
      yield new Date(cursor);
      cursor = nextYearly(cursor);
    }
    return;
  }

  // monthly (default)
  const dom = rule.dayOfMonth || fromLocal.getUTCDate();

  // If fromLocal isn't on the desired DOM, snap it to the DOM (clamped)
  if (fromLocal.getUTCDate() !== dom) {
    const y = fromLocal.getUTCFullYear();
    const m = fromLocal.getUTCMonth();
    const d = Math.min(dom, daysInMonth(y, m));
    cursor = new Date(Date.UTC(y, m, d, 0,0,0,0));
  }

  while (cursor <= untilLocal) {
    yield new Date(cursor);
    cursor = nextMonthly(cursor, dom);
  }
}

async function runForRule(rule, nowUtc) {
  if (!rule.isActive) return;

  const offset = rule.tzOffsetMinutes ?? 420;

  // “today” in local tz (00:00 local)
  const todayLocal = toLocal(nowUtc, offset);
  const todayLocalMid = new Date(Date.UTC(
    todayLocal.getUTCFullYear(), todayLocal.getUTCMonth(), todayLocal.getUTCDate(), 0,0,0,0
  ));

  const startLocal = toLocal(rule.startDate, offset);
  const startLocalMid = new Date(Date.UTC(
    startLocal.getUTCFullYear(), startLocal.getUTCMonth(), startLocal.getUTCDate(), 0,0,0,0
  ));

  // local end boundary (inclusive)
  const endLocalMid = rule.endDate
    ? endOfLocalDay(toUTC(toLocal(rule.endDate, offset), 0), 0) // use end-of-day local then convert
    : null;

  // Resume point:
  // - if lastGeneratedAt exists, move to the NEXT occurrence AFTER that local day
  // - else start from the rule's startLocalMid
  let startFromLocal = startLocalMid;
  if (rule.lastGeneratedAt) {
    const lastLocal = toLocal(rule.lastGeneratedAt, offset);
    const lastLocalMid = new Date(Date.UTC(
      lastLocal.getUTCFullYear(), lastLocal.getUTCMonth(), lastLocal.getUTCDate(), 0,0,0,0
    ));
    startFromLocal = nextAfter(rule, lastLocalMid);
  }

  // Generate up to today (or endDate if earlier)
  const untilLocal = endLocalMid ? (endLocalMid < todayLocalMid ? endLocalMid : todayLocalMid) : todayLocalMid;

  // nothing to do
  if (startFromLocal > untilLocal) return;

  for (const occLocalMid of iterateOccurrences(rule, startFromLocal, untilLocal)) {
    await ensureTransaction(rule, occLocalMid);
    // update lastGeneratedAt to this exact occurrence (in UTC)
    rule.lastGeneratedAt = toUTC(occLocalMid, offset);
  }

  rule.lastRunAt = nowUtc;
  await rule.save();
}

/* ============== public API ============== */
async function runRecurrenceOnce(onlyUserId = null) {
  const nowUtc = new Date();
  const q = { isActive: true };
  if (onlyUserId) q.userId = onlyUserId;

  // need full docs so we can mutate & save
  const rules = await RecurringRule.find(q).lean(false);

  for (const rule of rules) {
    try {
      await runForRule(rule, nowUtc);
    } catch (e) {
      console.error('recurrenceEngine rule error', rule._id, e);
    }
  }
}

function startRecurrenceCron() {
  // Run now, then hourly. Works fine on Render/Heroku (best-effort after dyno wake).
  runRecurrenceOnce().catch(() => {});
  setInterval(() => runRecurrenceOnce().catch(() => {}), 60 * 60 * 1000);
}

module.exports = {
  startRecurrenceCron,
  runRecurrenceOnce,
  // For backwards compatibility if your server imports startRecurrenceEngine():
  startRecurrenceEngine: startRecurrenceCron,
};
