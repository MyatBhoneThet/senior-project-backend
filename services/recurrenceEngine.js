const cron = require('node-cron');
const RecurringRule = require('../models/RecurringRule');
const Transaction  = require('../models/Transaction'); // ok if unused; wrapped in try/catch
const Income       = require('../models/Income');
const Expense      = require('../models/Expense');

// --- helpers ---------------------------------------------------------------
function lastDayOfMonth(y, mIdx) { return new Date(y, mIdx + 1, 0).getDate(); }
function clampDay(y, mIdx, d) { return Math.min(Math.max(d || 1, 1), lastDayOfMonth(y, mIdx)); }
function periodKey(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }

// store date-only (avoid tz shifts)
function toDateOnly(d) {
  const dt = new Date(d);
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

/**
 * First-month rule:
 *  - In the month of startDate, use startDate.getDate() (=> start=today => create TODAY)
 *  - Later months: use rule.dayOfMonth if provided, else startDate.getDate()
 */
function monthlyDay(rule, cursorYM) {
  const start = toDateOnly(rule.startDate);
  const sameYM = cursorYM.getFullYear() === start.getFullYear() && cursorYM.getMonth() === start.getMonth();
  const fallback = rule.dayOfMonth || start.getDate() || 1;
  return sameYM ? start.getDate() : fallback;
}

/**
 * Generate all due occurrences up to "now" (inclusive).
 * If debug=true, return per-rule reasons (CREATED / DUPLICATE / BEFORE_START / IN_FUTURE / AFTER_END).
 */
async function runGeneration(userId = null, debug = false) {
  const q = { isActive: true };
  if (userId) q.userId = userId;

  const rules = await RecurringRule.find(q).sort({ _id: 1 }).lean();
  const now = toDateOnly(new Date());

  let createdTx = 0, createdIncome = 0, createdExpense = 0;
  const details = [];

  for (const rule of rules) {
    const start = toDateOnly(rule.startDate);
    const end   = rule.endDate ? toDateOnly(rule.endDate) : null;

    let cursorYM = new Date(start.getFullYear(), start.getMonth(), 1);
    if (rule.lastRunAt) {
      const last = new Date(rule.lastRunAt);
      cursorYM = new Date(last.getFullYear(), last.getMonth() + 1, 1);
    }

    const hardStop = end && end < now ? end : now;
    const ruleLog = { ruleId: String(rule._id), type: rule.type, category: rule.category, source: rule.source || '', checks: [] };

    while (cursorYM <= hardStop) {
      const day = clampDay(cursorYM.getFullYear(), cursorYM.getMonth(), monthlyDay(rule, cursorYM));
      const occur = toDateOnly(new Date(cursorYM.getFullYear(), cursorYM.getMonth(), day));

      const entry = {
        month: `${cursorYM.getFullYear()}-${String(cursorYM.getMonth()+1).padStart(2,'0')}`,
        occurrenceISO: occur.toISOString(),
        action: null,
        reason: null
      };

      if (occur < start) { entry.action = 'SKIPPED'; entry.reason = 'BEFORE_START'; ruleLog.checks.push(entry); cursorYM = new Date(cursorYM.getFullYear(), cursorYM.getMonth()+1, 1); continue; }
      if (end && occur > end) { entry.action = 'STOP'; entry.reason = 'AFTER_END'; ruleLog.checks.push(entry); break; }
      if (occur > now) { entry.action = 'STOP'; entry.reason = 'IN_FUTURE'; ruleLog.checks.push(entry); break; }

      const base = {
        userId: rule.userId,
        type: rule.type,
        category: rule.category,
        source: rule.source || '',
        amount: rule.amount,
        date: occur,
        notes: rule.notes || '',
        isRecurring: true,
        recurringRuleId: rule._id,
        periodKey: periodKey(occur),
      };

      // Optional transaction (idempotent if you created the unique index)
      try { await Transaction.create(base); createdTx++; }
      catch (e) { if (!(e && e.code === 11000)) {/* ignore dup or missing model */} }

      // Write to the collections your UI reads:
      if (rule.type === 'income') {
        const exists = await Income.findOne({ userId: rule.userId, amount: rule.amount, date: occur, categoryName: rule.category }).lean();
        if (!exists) {
          await Income.create({
            userId: rule.userId,
            source: rule.source || 'Recurring',
            amount: rule.amount,
            date: occur,
            // write BOTH names to match whatever your UI/endpoint reads
            categoryName: rule.category,
            category: rule.category,
            icon: '',
          });
          createdIncome++; entry.action = 'CREATED_INCOME';
        } else { entry.action = 'SKIPPED'; entry.reason = 'DUPLICATE_INCOME'; }
      } else {
        const exists = await Expense.findOne({ userId: rule.userId, amount: rule.amount, date: occur, categoryName: rule.category }).lean();
        if (!exists) {
          await Expense.create({
            userId: rule.userId,
            source: rule.source || 'Recurring',
            amount: rule.amount,
            date: occur,
            categoryName: rule.category,
            category: rule.category,
            icon: '',
          });
          createdExpense++; entry.action = 'CREATED_EXPENSE';
        } else { entry.action = 'SKIPPED'; entry.reason = 'DUPLICATE_EXPENSE'; }
      }

      ruleLog.checks.push(entry);
      cursorYM = new Date(cursorYM.getFullYear(), cursorYM.getMonth()+1, 1);
    }

    try { await RecurringRule.updateOne({ _id: rule._id }, { $set: { lastRunAt: new Date() } }); }
    catch (e) { console.error('[recurrence] update lastRunAt failed', e); }

    if (debug) details.push(ruleLog);
  }

  const summary = { createdTx, createdIncome, createdExpense };
  return debug ? { ...summary, rulesCount: rules.length, details } : summary;
}

function startRecurrenceCron() {
  try {
    // 00:15 server local time; no timezone string (avoids "Invalid time zone")
    cron.schedule('15 0 * * *', async () => {
      try { console.log('[recurrence] nightly:', await runGeneration(null, false)); }
      catch (e) { console.error('[recurrence] nightly error', e); }
    });
    console.log('[recurrence] cron scheduled 15 0 * * * (server local time)');
  } catch (e) {
    console.error('[recurrence] cron schedule failed', e);
  }
}

module.exports = { runGeneration, startRecurrenceCron };
