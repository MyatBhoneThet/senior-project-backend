const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { protect } = require('../middleware/authMiddleware');

const Expense = require('../models/Expense');
const Income  = require('../models/Income');

const MS_DAY = 24 * 60 * 60 * 1000;
const now = () => new Date();
const sinceDays = (n) => new Date(Date.now() - n * MS_DAY);

function pickLastUserMessage(messages = []) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && (String(m.role || '').toLowerCase() === 'user')) return String(m.content || '').trim();
  }
  return '';
}

const norm = (s = '') => String(s).replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().toLowerCase();
const fmtTHB = (n) => `THB ${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

function parseRangeFromText(q) {
  const s = q.toLowerCase();
  if (/\blast\s*2\s*months?\b/.test(s) || /\b60\s*days?\b/.test(s)) return { from: sinceDays(60), to: now(), label: 'last 2 months' };
  if (/\blast\s*90\s*days?\b/.test(s) || /\b3\s*months?\b/.test(s))  return { from: sinceDays(90), to: now(), label: 'last 90 days' };
  return { from: sinceDays(30), to: now(), label: 'last 30 days' };
}

function buildMatch({ userId, from, to, key }) {
  const rxExact = new RegExp(`^${key}$`, 'i');
  const rxLoose = new RegExp(key.replace(/\s+/g, '.*'), 'i');
  const base = {
    userId: new mongoose.Types.ObjectId(String(userId)),
    date: { $gte: from, $lte: to },
  };
  return {
    exact: { ...base, $or: [
      { categoryName: { $regex: rxExact } },
      { category:     { $regex: rxExact } },
      { source:       { $regex: rxExact } },
    ]},
    loose: { ...base, $or: [
      { categoryName: { $regex: rxLoose } },
      { category:     { $regex: rxLoose } },
      { source:       { $regex: rxLoose } },
    ]},
    all: base,
  };
}

async function sum(Model, match) {
  const [row] = await Model.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return row?.total || 0;
}

router.post('/send', protect, async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const q = pickLastUserMessage(req.body?.messages || []).trim() || '';
    const { from, to, label } = parseRangeFromText(q);

    const isExpense = /\b(spend|spent|expenses?)\b/i.test(q);
    const isIncome  = /\b(get|got|earn|earned|income|incomes?)\b/i.test(q);
    const wantsInsights = /\binsights?\b/i.test(q);

    const key = (() => {
      const m = q.match(/\b(on|from)\s+([\p{L}\p{N}\s_-]{1,40})/iu);
      if (!m) return '';
      return norm(m[2]).replace(/\b(category|categories|name)\b/gi, '').trim();
    })();

    if (wantsInsights || (!isExpense && !isIncome)) {
      const [exp, inc] = await Promise.all([
        sum(Expense, { userId: new mongoose.Types.ObjectId(String(userId)), date: { $gte: from, $lte: to } }),
        sum(Income,  { userId: new mongoose.Types.ObjectId(String(userId)), date: { $gte: from, $lte: to } }),
      ]);
      const balance = (inc || 0) - (exp || 0);
      const content = `**Insights (${label})**\n• Total Incomes: ${fmtTHB(inc)}\n• Total Expenses: ${fmtTHB(exp)}\n• Balance: **${fmtTHB(balance)}**`;
      return res.json({ reply: { role: 'assistant', content }, handledBy: 'insights' });
    }

    if (isExpense) {
      if (!key) {
        const total = await sum(Expense, { userId: new mongoose.Types.ObjectId(String(userId)), date: { $gte: from, $lte: to } });
        return res.json({ reply: { role: 'assistant', content: `Last 30 days • Expenses = ${fmtTHB(total)}` }, handledBy: 'expense-all' });
      }
      const { exact, loose } = buildMatch({ userId, from, to, key });
      const total = (await sum(Expense, exact)) || (await sum(Expense, loose));
      return res.json({ reply: { role: 'assistant', content: `You spent **${fmtTHB(total)}** on **${key}** in the **${label}**.` }, handledBy: 'expense-category' });
    }

    if (isIncome) {
      if (!key) {
        const total = await sum(Income, { userId: new mongoose.Types.ObjectId(String(userId)), date: { $gte: from, $lte: to } });
        return res.json({ reply: { role: 'assistant', content: `Last 30 days • Incomes = ${fmtTHB(total)}` }, handledBy: 'income-all' });
      }
      const { exact, loose } = buildMatch({ userId, from, to, key });
      const total = (await sum(Income, exact)) || (await sum(Income, loose));
      return res.json({ reply: { role: 'assistant', content: `You got **${fmtTHB(total)}** from **${key}** in the **${label}**.` }, handledBy: 'income-category' });
    }

    const help = "Try:\n• Expenses\n• Incomes\n• Show insights\n• How much did I spend on food?\n• How much did I get from salary?";
    return res.json({ reply: { role: 'assistant', content: help }, handledBy: 'help' });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ message: 'Chat failed', detail: err?.message || 'Unknown error' });
  }
});

module.exports = router;
