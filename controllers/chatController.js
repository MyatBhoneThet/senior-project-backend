// backend/controllers/chatController.js
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const chrono = require('chrono-node');
const Income = require('../models/Income');
const Expense = require('../models/Expense');

/* ---------- auth helper: NO 401s, just "graceful" unauth ---------- */
function getUserIdFromHeader(req) {
  try {
    const h = req.headers?.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return null;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded?.id || decoded?._id || null;
  } catch {
    return null;
  }
}

/* ---------- date helpers ---------- */
function dayRange(d) {
  // Use UTC boundaries to be consistent with typical Mongo storage
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
  const end   = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
  return { start, end, label: start.toISOString().slice(0, 10), granularity: 'day' };
}
function monthRange(d) {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
  const end   = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  return { start, end, label: start.toISOString().slice(0, 7), granularity: 'month' };
}
function weekRange(d) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
  const dow = x.getUTCDay(); // 0..6
  const diffToMon = (dow + 6) % 7;
  x.setUTCDate(x.getUTCDate() - diffToMon);
  const start = x;
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 6, 23, 59, 59, 999));
  return { start, end, label: 'this week', granularity: 'week' };
}
function parseRange(text) {
  const s = String(text || '').toLowerCase().trim();

  if (/\btoday\b/.test(s))       return dayRange(new Date());
  if (/\byesterday\b/.test(s)) { const d = new Date(); d.setUTCDate(d.getUTCDate() - 1); return dayRange(d); }
  if (/\bthis\s+week\b/.test(s)) return weekRange(new Date());
  if (/\blast\s+week\b/.test(s)) { const d = new Date(); d.setUTCDate(d.getUTCDate() - 7); return weekRange(d); }
  if (/\bthis\s+month\b/.test(s)) return monthRange(new Date());
  if (/\blast\s+month\b/.test(s)) { const d = new Date(); d.setUTCMonth(d.getUTCMonth() - 1); return monthRange(d); }

  // Natural language date (e.g., "1 Oct 2025", "16th June 2025")
  const explicit = chrono.parseDate(s);
  if (explicit) return dayRange(new Date(explicit));

  // default last 30 days
  const end = new Date();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 29);
  start.setUTCHours(0, 0, 0, 0);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end, label: 'last 30 days', granularity: 'range' };
}
function detectIntent(text) {
  const s = String(text || '').toLowerCase();
  const wantsExpense = /\b(spend|spent|expense|paid|pay|cost)\b/.test(s);
  const wantsIncome  = /\b(get|got|earn|earned|income|received|receive)\b/.test(s);
  if (/\blist|show|display\b/.test(s)) return 'list';
  if (wantsExpense && !wantsIncome) return 'expense';
  if (wantsIncome && !wantsExpense) return 'income';
  return 'both';
}
async function sum(model, userId, start, end) {
  const [doc] = await model.aggregate([
    { $match: {
        userId: new mongoose.Types.ObjectId(String(userId)),
        date: { $gte: start, $lte: end },
      } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return doc?.total || 0;
}

/* ---------- controller ---------- */
exports.send = async (req, res) => {
  try {
    // allow anonymous (no 401) so your frontend never hard-redirects
    const userId = getUserIdFromHeader(req);

    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const lastUser = [...messages].reverse().find(m => m?.role === 'user');
    const text = lastUser?.content || String(req.body?.text || '');

    // if user not logged in
    if (!userId) {
      return res.json({
        reply: {
          role: 'assistant',
          content: 'Please log in to use chat with your own data.',
          intent: 'info',
          range: null,
          totals: null,
        },
      });
    }

    const intent = detectIntent(text);
    const range = parseRange(text);

    const incomeTHB  = await sum(Income,  userId, range.start, range.end);
    const expenseTHB = await sum(Expense, userId, range.start, range.end);
    const netTHB     = incomeTHB - expenseTHB;

    let content;
    if (intent === 'expense') {
      content = `You spent THB ${expenseTHB.toLocaleString()} (${range.label}).`;
    } else if (intent === 'income') {
      content = `You received THB ${incomeTHB.toLocaleString()} (${range.label}).`;
    } else {
      content = [
        `Totals (${range.label})`,
        `• Income:  THB ${incomeTHB.toLocaleString()}`,
        `• Expenses: THB ${expenseTHB.toLocaleString()}`,
        `• Net:     THB ${netTHB.toLocaleString()}`,
      ].join('\n');
    }

    return res.json({
      reply: {
        role: 'assistant',
        content,
        intent,
        range: {
          from: range.start,
          to: range.end,
          label: range.label,
          granularity: range.granularity,
        },
        totals: { incomeTHB, expenseTHB, netTHB },
      },
    });
  } catch (err) {
    console.error('chatController.send error:', err);
    return res.status(200).json({
      reply: { role: 'assistant', content: 'Sorry, something went wrong.', intent: 'error' },
    });
  }
};
