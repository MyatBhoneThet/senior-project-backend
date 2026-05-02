const Expense = require('../models/Expense');
const Income  = require('../models/Income');

/** Accepts:
 *   range: '30d' | '60d' | '90d' | '2m' | '3m' | 'all'
 *   OR explicit startDate/endDate (YYYY-MM-DD)
 */
function parseRange(range = '30d', startDate, endDate) {
  if (startDate && endDate) {
    return { from: new Date(startDate), to: new Date(endDate) };
  }
  if (!range || range === 'all') return {};
  const m = String(range).trim().toLowerCase().match(/^(\d+)(d|m)$/);
  if (!m) return {};
  const qty = parseInt(m[1], 10);
  const unit = m[2];
  const to = new Date();
  const from = new Date();
  if (unit === 'd') from.setDate(from.getDate() - qty);
  if (unit === 'm') from.setMonth(from.getMonth() - qty);
  return { from, to };
}

function norm(s) {
  return String(s ?? '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .toLowerCase();
}

async function sumAndItems(Model, match) {
  const [agg] = await Model.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
  ]);
  const items = await Model.find(match)
    .sort({ date: -1 })
    .select('source amount date categoryName category');
  return { total: agg?.total || 0, count: agg?.count || 0, items };
}

exports.categorySummary = async (req, res) => {
  try {
    const { type, range = '30d', startDate, endDate } = req.query;
    let { category = '', matchBy = 'auto' } = req.query;

    if (!['expense', 'income'].includes(type)) {
      return res.status(400).json({ message: 'type must be expense or income' });
    }

    // Clean the incoming phrase
    const cleaned = String(category || '')
      .replace(/\b(the|a|an|my|your|category|categories|category\s+name|name)\b/gi, '')
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .trim();
    const target = norm(cleaned);

    const Model = type === 'expense' ? Expense : Income;
    const baseMatch = { userId: req.user._id || req.user.id };

    // Date range
    const r = parseRange(range, startDate, endDate);
    if (r.from && r.to) baseMatch.date = { $gte: r.from, $lte: r.to };

    // If no category provided, return total for all
    if (!target) {
      const all = await sumAndItems(Model, baseMatch);
      return res.json({ type, category: 'All', range, matchedBy: 'all', ...all });
    }

    // Escape regex specials
    const esc = cleaned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Build regex attempts
    const rxExact = new RegExp(`^${esc}$`, 'i');
    const rxContains = new RegExp(esc.replace(/\s+/g, '.*'), 'i');

    let attempts = [
      ['categoryName', rxExact],
      ['category',     rxExact],
      ['categoryName', rxContains],
      ['category',     rxContains],
    ];

    if (matchBy === 'source') {
      attempts = [['source', rxExact], ['source', rxContains], ...attempts];
    } else if (matchBy === 'auto') {
      attempts.push(['source', rxExact], ['source', rxContains]);
    }

    // Try DB-side matching first (fast)
    for (const [field, rx] of attempts) {
      const match = { ...baseMatch, [field]: rx };
      const { total, count, items } = await sumAndItems(Model, match);
      if (count > 0) {
        return res.json({
          type,
          category: cleaned,
          range,
          matchedBy: field,
          total,
          count,
          items,
        });
      }
    }

    // Fallback: JS filter for extra robustness
    const allRows = await Model.find(baseMatch)
      .sort({ date: -1 })
      .select('source amount date categoryName category');
    const picked = allRows.filter((it) => {
      const a = norm(it.categoryName);
      const b = norm(it.category);
      const c = norm(it.source);
      return (
        a === target || b === target || c === target ||
        a.includes(target) || b.includes(target) || c.includes(target)
      );
    });

    if (picked.length > 0) {
      const total = picked.reduce((s, it) => s + Number(it.amount || 0), 0);
      return res.json({
        type,
        category: cleaned,
        range,
        matchedBy: 'fallback',
        total,
        count: picked.length,
        items: picked,
      });
    }

    // Build suggestions from whatever exists in range
    const suggestionSet = new Map();
    for (const it of allRows) {
      const name =
        (it.categoryName && String(it.categoryName).trim()) ||
        (it.category && String(it.category).trim());
      if (name) {
        const key = norm(name);
        if (!suggestionSet.has(key)) suggestionSet.set(key, name);
      }
    }
    const suggestions = Array.from(suggestionSet.values()).slice(0, 12);

    return res.json({
      type,
      category: cleaned,
      range,
      matchedBy: 'none',
      total: 0,
      count: 0,
      items: [],
      suggestions,
    });
  } catch (e) {
    console.error('categorySummary error:', e);
    res.status(500).json({ message: e.message });
  }
};
