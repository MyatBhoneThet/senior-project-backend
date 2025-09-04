const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const mongoose = require('mongoose');

const Expense = require('../models/Expense');
const Income  = require('../models/Income');

// ────────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────────
const MS_DAY = 24 * 60 * 60 * 1000;
const now = () => new Date();
const since30 = () => new Date(Date.now() - 30 * MS_DAY); // inclusive window start

function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function pickLastUserMessage(messages = []) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && (m.role === 'user' || m.role === 'User')) return String(m.content || '').trim();
  }
  return '';
}

function normalize(s = '') { return String(s || '').toLowerCase(); }

// Basic NLU for categories/sources (extend as you need)
const EXPENSE_SYNONYMS = {
  rent: ['rent', 'house rent', 'apartment', 'condo rent', 'room rent'],
  food: ['food', 'meal', 'meals', 'dining', 'restaurant'],
  transport: ['transport', 'transportation', 'taxi', 'grab', 'bus', 'train'],
  utilities: ['utilities', 'electric', 'electricity', 'water bill', 'internet', 'wifi'],
};
const INCOME_SYNONYMS = {
  salary: ['salary', 'paycheck', 'wage', 'monthly salary'],
  business: ['business', 'sales', 'shop', 'store'],
  freelance: ['freelance', 'contract', 'gig'],
};

function matchKeyFromSynonyms(text, dict) {
  const q = normalize(text);
  for (const key of Object.keys(dict)) {
    for (const alt of dict[key]) {
      if (q.includes(alt)) return key; // first hit wins
    }
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────────────────
// Queries
// ────────────────────────────────────────────────────────────────────────────────
async function sumExpenseByCategoryLast30(userId, catKey) {
  // If categry key known → exact match on stored category name using regex ^...$
  const since = since30();
  const filter = { userId: new mongoose.Types.ObjectId(String(userId)), date: { $gte: since, $lte: now() } };

  if (catKey) {
    // try exact key and also a loose text contains fallback
    const rx = new RegExp('^' + escapeRegExp(catKey) + '$', 'i');
    const loose = new RegExp(escapeRegExp(catKey), 'i');
    const byExact = await Expense.aggregate([
      { $match: { ...filter, category: { $regex: rx } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const exactTotal = byExact[0]?.total || 0;
    if (exactTotal > 0) return exactTotal;

    const byLoose = await Expense.aggregate([
      { $match: { ...filter, category: { $regex: loose } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    return byLoose[0]?.total || 0;
  }

  // no category = all expenses last 30 days
  const res = await Expense.aggregate([
    { $match: filter },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return res[0]?.total || 0;
}

async function sumIncomeBySourceLast30(userId, srcKey) {
  const since = since30();
  const filter = { userId: new mongoose.Types.ObjectId(String(userId)), date: { $gte: since, $lte: now() } };

  if (srcKey) {
    const rx = new RegExp('^' + escapeRegExp(srcKey) + '$', 'i');
    const loose = new RegExp(escapeRegExp(srcKey), 'i');
    const byExact = await Income.aggregate([
      { $match: { ...filter, source: { $regex: rx } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const exactTotal = byExact[0]?.total || 0;
    if (exactTotal > 0) return exactTotal;

    const byLoose = await Income.aggregate([
      { $match: { ...filter, source: { $regex: loose } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    return byLoose[0]?.total || 0;
  }

  // no source = all income last 30 days
  const res = await Income.aggregate([
    { $match: filter },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return res[0]?.total || 0;
}

async function listExpenses(userId, { last30 = true } = {}) {
  const base = { userId: new mongoose.Types.ObjectId(String(userId)) };
  const filter = last30 ? { ...base, date: { $gte: since30(), $lte: now() } } : base;
  return Expense.find(filter).sort({ date: -1, createdAt: -1 }).limit(200).lean();
}

async function listIncome(userId, { last30 = true } = {}) {
  const base = { userId: new mongoose.Types.ObjectId(String(userId)) };
  const filter = last30 ? { ...base, date: { $gte: since30(), $lte: now() } } : base;
  return Income.find(filter).sort({ date: -1, createdAt: -1 }).limit(200).lean();
}

function fmtTHB(n) { return 'THB ' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }); }
function fmtDate(d) { const x = new Date(d); return isNaN(x) ? '' : x.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }

function renderList(title, rows, kind) {
  const lines = rows.map(r => `• ${fmtDate(r.date)} — ${kind === 'expense' ? (r.category || '-') : (r.source || '-')}: ${fmtTHB(r.amount)}`);
  if (!lines.length) return `${title}\n(no records in last 30 days)`;
  return `${title}\n${lines.join('\n')}`;
}

// ────────────────────────────────────────────────────────────────────────────────
// Route: /api/v1/chat/send
// ────────────────────────────────────────────────────────────────────────────────
router.post('/send', protect, async (req, res) => {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const { messages } = req.body || {};
    const text = pickLastUserMessage(messages);
    const q = normalize(text);

    // ── CASE 1: “How much did I spend on <category>?” → last 30 days ONLY
    if (/\b(how\s+much|how\s+many|total)\b.*\b(spend|spent|expense|expenses)\b/.test(q)) {
      const catKey = matchKeyFromSynonyms(q, EXPENSE_SYNONYMS) || (q.match(/on\s+([a-zA-Z ]+)/)?.[1]?.trim().toLowerCase()) || null;
      const total = await sumExpenseByCategoryLast30(userId, catKey);
      const label = catKey ? catKey : 'expenses';
      const reply = `You spent **${fmtTHB(total)}** on **${label}** in the **last 30 days**.`;
      return res.json({ reply: { role: 'assistant', content: reply }, handledBy: 'rules' });
    }

    // ── CASE 2: “How much did I get from <source>?” → last 30 days ONLY
    if (/\b(how\s+much|how\s+many|total)\b.*\b(get|got|receive|received|income|incomes|earn|earned)\b/.test(q)) {
      const srcKey = matchKeyFromSynonyms(q, INCOME_SYNONYMS) || (q.match(/from\s+([a-zA-Z ]+)/)?.[1]?.trim().toLowerCase()) || null;
      const total = await sumIncomeBySourceLast30(userId, srcKey);
      const label = srcKey ? srcKey : 'income';
      const reply = `You got **${fmtTHB(total)}** from **${label}** in the **last 30 days**.`;
      return res.json({ reply: { role: 'assistant', content: reply }, handledBy: 'rules' });
    }

    // ── CASE 3: Autoplay triggers
    if (/^\s*(show\s+)?(all\s+)?expenses\s*$/.test(q)) {
      const rows = await listExpenses(userId, { last30: true }); // design choice: last30 for chat
      const content = renderList('Last 30 days — Expenses', rows, 'expense');
      return res.json({ reply: { role: 'assistant', content }, handledBy: 'rules' });
    }

    if (/^\s*(show\s+)?(all\s+)?incomes?\s*$/.test(q)) {
      const rows = await listIncome(userId, { last30: true });
      const content = renderList('Last 30 days — Incomes', rows, 'income');
      return res.json({ reply: { role: 'assistant', content }, handledBy: 'rules' });
    }

    if (/^\s*(show\s+)?insights?\s*$/.test(q)) {
      const [exp30, inc30] = await Promise.all([
        sumExpenseByCategoryLast30(userId, null),
        sumIncomeBySourceLast30(userId, null),
      ]);
      const balance = (inc30 || 0) - (exp30 || 0);
      const content = `**Insights (Last 30 Days)**\n• Total Incomes: ${fmtTHB(inc30)}\n• Total Expenses: ${fmtTHB(exp30)}\n• Balance: **${fmtTHB(balance)}**`;
      return res.json({ reply: { role: 'assistant', content }, handledBy: 'rules' });
    }

    // Fallback: short helpful message (no LLM)
    const help = `I can answer quick finance questions for the **last 30 days**.\nExamples:\n• "How much did I spend on rent?"\n• "How much did I get from salary?"\n• Type: **expenses**, **incomes**, or **insights**.`;
    return res.json({ reply: { role: 'assistant', content: help }, handledBy: 'rules' });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ message: 'Chat failed', detail: err?.message || 'Unknown error' });
  }
});

module.exports = router;