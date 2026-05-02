const Income = require('../models/Income');
const Expense = require('../models/Expense');
const Transaction = require('../models/Transaction');
const { buildUserQuery } = require('./userQuery');

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function withinRange(doc, since = null, until = null) {
  const date = toDate(doc.date || doc.createdAt);
  if (!date) return false;
  if (since && date < since) return false;
  if (until && date > until) return false;
  return true;
}

function sortNewestFirst(a, b) {
  return toDate(b.date || b.createdAt) - toDate(a.date || a.createdAt);
}

function mapIncomeDoc(doc, sourceModel = 'Income') {
  return {
    ...doc,
    _sourceModel: sourceModel,
    type: 'income',
    source: doc.source || doc.categoryName || doc.category || '',
    categoryName: doc.categoryName || doc.category || 'Uncategorized',
    category: doc.category || doc.categoryName || 'Uncategorized',
    date: doc.date || doc.createdAt,
  };
}

function mapExpenseDoc(doc, sourceModel = 'Expense') {
  return {
    ...doc,
    _sourceModel: sourceModel,
    type: 'expense',
    source: doc.source || '',
    categoryName: doc.categoryName || doc.category || 'Uncategorized',
    category: doc.category || doc.categoryName || 'Uncategorized',
    date: doc.date || doc.createdAt,
  };
}

async function loadIncomeHistory(userId, { since = null, until = null } = {}) {
  const userQuery = buildUserQuery(userId);
  const [incomeDocs, transactionDocs] = await Promise.all([
    Income ? Income.find(userQuery).sort({ date: -1, createdAt: -1 }).lean() : [],
    Transaction
      ? Transaction.find({ ...userQuery, $or: [{ type: /income/i }, { kind: /income/i }] })
          .sort({ date: -1, createdAt: -1 })
          .lean()
      : [],
  ]);

  return [...incomeDocs.map((doc) => mapIncomeDoc(doc, 'Income')), ...transactionDocs.map((doc) => mapIncomeDoc(doc, 'Transaction'))]
    .filter((doc) => withinRange(doc, since, until))
    .sort(sortNewestFirst);
}

async function loadExpenseHistory(userId, { since = null, until = null } = {}) {
  const userQuery = buildUserQuery(userId);
  const [expenseDocs, transactionDocs] = await Promise.all([
    Expense ? Expense.find(userQuery).sort({ date: -1, createdAt: -1 }).lean() : [],
    Transaction
      ? Transaction.find({ ...userQuery, $or: [{ type: /expense/i }, { kind: /expense/i }] })
          .sort({ date: -1, createdAt: -1 })
          .lean()
      : [],
  ]);

  return [...expenseDocs.map((doc) => mapExpenseDoc(doc, 'Expense')), ...transactionDocs.map((doc) => mapExpenseDoc(doc, 'Transaction'))]
    .filter((doc) => withinRange(doc, since, until))
    .sort(sortNewestFirst);
}

async function sumIncomeHistory(userId, range = {}) {
  const rows = await loadIncomeHistory(userId, range);
  return rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
}

async function sumExpenseHistory(userId, range = {}) {
  const rows = await loadExpenseHistory(userId, range);
  return rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
}

function groupExpensesByCategory(rows) {
  const groups = new Map();

  for (const row of rows) {
    const key = row.categoryName || row.category || 'Uncategorized';
    groups.set(key, (groups.get(key) || 0) + Number(row.amount || 0));
  }

  const total = Array.from(groups.values()).reduce((sum, value) => sum + value, 0);
  return Array.from(groups.entries())
    .map(([name, amount]) => ({
      name,
      total: amount,
      value: total > 0 ? Math.round((amount / total) * 100) : 0,
    }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.total - a.total);
}

module.exports = {
  loadIncomeHistory,
  loadExpenseHistory,
  sumIncomeHistory,
  sumExpenseHistory,
  groupExpensesByCategory,
};
