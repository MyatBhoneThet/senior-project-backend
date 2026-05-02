// backend/controllers/chatController.js
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const chrono = require('chrono-node');
const Income = require('../models/Income');
const Expense = require('../models/Expense');

const expenseIntents = [
  'expense', 'expenses', 'spend', 'spending', 'expenditure', 
  'allocation', 'cost', 'outlay', 'disbursement', 'payment', 'charge', 'waste'
];

const incomeIntents = [
  'income', 'revenue', 'earnings', 'salary', 'wages', 'pay', 
  'profit', 'proceeds', 'receipts', 'return', 'dividends', 
  'compensation', 'allowance', 'revenue stream', 'take-home', 
  'remuneration', 'income flow', 'monetary inflow', 'fund'
];

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
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
  return { start, end, label: start.toISOString().slice(0, 10), granularity: 'day' };
}

function monthRange(d) {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  return { start, end, label: start.toISOString().slice(0, 7), granularity: 'month' };
}

function weekRange(d) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
  const dow = x.getUTCDay();
  const diffToMon = (dow + 6) % 7;
  x.setUTCDate(x.getUTCDate() - diffToMon);
  const start = x;
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 6, 23, 59, 59, 999));
  return { start, end, label: 'this week', granularity: 'week' };
}

function parseRange(text) {
  const s = String(text || '').toLowerCase().trim();

  if (/\btoday\b/.test(s)) return dayRange(new Date());
  if (/\byesterday\b/.test(s)) { 
    const d = new Date(); 
    d.setUTCDate(d.getUTCDate() - 1); 
    return dayRange(d); 
  }
  if (/\bthis\s+week\b/.test(s)) return weekRange(new Date());
  if (/\blast\s+week\b/.test(s)) { 
    const d = new Date(); 
    d.setUTCDate(d.getUTCDate() - 7); 
    return weekRange(d); 
  }
  if (/\bthis\s+month\b/.test(s)) return monthRange(new Date());
  if (/\blast\s+month\b/.test(s)) { 
    const d = new Date(); 
    d.setUTCMonth(d.getUTCMonth() - 1); 
    return monthRange(d); 
  }

  const explicit = chrono.parseDate(s);
  if (explicit) return dayRange(new Date(explicit));

  const end = new Date();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 29);
  start.setUTCHours(0, 0, 0, 0);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end, label: 'last 30 days', granularity: 'range' };
}

function detectIntent(text) {
  const s = String(text || '').toLowerCase();
  const wantsExpense = expenseIntents.some(intent => s.includes(intent));
  const wantsIncome = incomeIntents.some(intent => s.includes(intent));
  const listKeywords = /\blist|show|display\b/.test(s);

  if (listKeywords) return 'list';
  if (wantsExpense && !wantsIncome) return 'expense';
  if (wantsIncome && !wantsExpense) return 'income';
  return 'both';
}

/* ---------- FIXED sum function with debugging ---------- */
async function sum(model, userId, start, end) {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    console.log('❌ Invalid userId:', userId);
    return 0;
  }

  console.log('🔍 Querying', model.modelName, 'for user', userId, {
    range: `${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`
  });

  try {
    const match = {
      userId: new mongoose.Types.ObjectId(userId),
      date: { $gte: start, $lte: end }
    };

    const [doc] = await model.aggregate([
      { $match: match },
      { 
        $group: { 
          _id: null, 
          count: { $sum: 1 },
          total: { $sum: '$amount' }
        }
      }
    ]);

    const result = { count: doc?.count || 0, total: doc?.total || 0 };
    console.log('📊', model.modelName, 'result:', result);
    return result.total;
  } catch (err) {
    console.error('💥 Aggregation error:', model.modelName, err);
    return 0;
  }
}

/* ---------- main controller ---------- */
exports.send = async (req, res) => {
  try {
    const userId = getUserIdFromHeader(req);
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const lastUser = [...messages].reverse().find(m => m?.role === 'user');
    const text = lastUser?.content || String(req.body?.text || '');

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

    console.log('💬 User query:', text.slice(0, 50) + '...');
    
    const intent = detectIntent(text);
    const range = parseRange(text);
    console.log('🎯 Intent:', intent, '| Range:', range.label);

    const [incomeTHB, expenseTHB] = await Promise.all([
      sum(Income, userId, range.start, range.end),
      sum(Expense, userId, range.start, range.end)
    ]);
    
    const netTHB = incomeTHB - expenseTHB;

    let content;
    if (expenseIntents.includes(intent)) {
      content = `You spent **THB ${expenseTHB.toLocaleString()}** (${range.label}).`;
    } else if (incomeIntents.includes(intent)) {
      content = `You earned **THB ${incomeTHB.toLocaleString()}** (${range.label}).`;
    } else {
      content = `**Totals (${range.label})**\n\n` +
        `• **Income:**  THB ${incomeTHB.toLocaleString()}\n` +
        `• **Expenses:** THB ${expenseTHB.toLocaleString()}\n` +
        `• **Net:**     ${netTHB >= 0 ? '💰' : '📉'} THB ${netTHB.toLocaleString()}`;
    }

    return res.json({
      reply: {
        role: 'assistant',
        content,
        intent,
        range: {
          from: range.start.toISOString(),
          to: range.end.toISOString(),
          label: range.label,
          granularity: range.granularity,
        },
        totals: { incomeTHB, expenseTHB, netTHB },
      },
    });

  } catch (err) {
    console.error('💥 chatController.send error:', err);
    return res.status(200).json({
      reply: { 
        role: 'assistant', 
        content: 'Sorry, something went wrong. Check server logs for details.', 
        intent: 'error' 
      },
    });
  }
};
