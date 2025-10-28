const Expense = require('../models/Expense');
const Category = require('../models/Category');
const xlsx = require('xlsx');

// Normalize "date" from "YYYY-MM-DD" or ISO into a Date at UTC midnight
function toUtcMidnight(v) {
  if (!v) return v;
  if (v instanceof Date) {
    // force to UTC midnight (strip time if it has one)
    return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate(), 0, 0, 0, 0));
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/); // "YYYY-MM-DD" from your forms
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 0, 0, 0, 0));
  const parsed = new Date(s);
  if (!isNaN(parsed)) {
    return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate(), 0, 0, 0, 0));
  }
  return undefined;
}

// POST /api/v1/expense/add
exports.addExpense = async (req, res) => {
  const userId = req.user.id || req.user._id;

  try {
    const { source, categoryId, category, icon, amount, date } = req.body;

    // basic validation
    if (!amount || !date) {
      return res.status(400).json({ message: 'Amount and Date are required' });
    }

    // resolve category name snapshot
    let categoryName = 'Uncategorized';
    if (categoryId) {
      const cat = await Category.findOne({
        _id: categoryId,
        userId,
        type: 'expense',
      });
      if (!cat) return res.status(400).json({ message: 'Invalid expense category' });
      categoryName = cat.name;
    } else if (category && String(category).trim()) {
      // legacy: frontend may send only a name
      categoryName = String(category).trim();
    }

    const newExpense = await Expense.create({
      userId,
      source: source || '',
      icon: icon || '',
      amount: Number(amount),
      date: toUtcMidnight(date),                 // ✅ normalize
      categoryId: categoryId || undefined,
      categoryName,
      category: categoryName, // keep legacy field in sync
    });

    return res.status(201).json(newExpense);
  } catch (error) {
    console.error('addExpense error:', error);
    return res.status(500).json({ message: 'Server Error' });
  }
};

// GET /api/v1/expense/get
exports.getAllExpense = async (req, res) => {
  const userId = req.user.id || req.user._id;
  try {
    const expense = await Expense.find({ userId }).sort({ date: -1 });
    return res.json(expense);
  } catch (error) {
    console.error('getAllExpense error:', error);
    return res.status(500).json({ message: 'Server Error' });
  }
};

// DELETE /api/v1/expense/:id
exports.deleteExpense = async (req, res) => {
  try {
    await Expense.findByIdAndDelete(req.params.id);
    return res.json({ message: 'Expense deleted successfully' });
  } catch (error) {
    console.error('deleteExpense error:', error);
    return res.status(500).json({ message: 'Server Error' });
  }
};

// NEW: DELETE /api/v1/expense/bulk-delete
// Query params: ?period=all|last-month|last-6-months|last-year
exports.bulkDeleteExpense = async (req, res) => {
  const userId = req.user.id || req.user._id;
  const { period } = req.query;

  try {
    let dateFilter = {};
    const now = new Date();

    switch (period) {
      case 'last-month': {
        const firstDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
        const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999));
        dateFilter = { date: { $gte: firstDay, $lte: lastDay } };
        break;
      }
      case 'last-6-months': {
        const firstDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, 1));
        const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999));
        dateFilter = { date: { $gte: firstDay, $lte: lastDay } };
        break;
      }
      case 'last-year': {
        const firstDay = new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1));
        const lastDay = new Date(Date.UTC(now.getUTCFullYear() - 1, 11, 31, 23, 59, 59, 999));
        dateFilter = { date: { $gte: firstDay, $lte: lastDay } };
        break;
      }
      case 'all':
        dateFilter = {};
        break;
      default:
        return res.status(400).json({ message: 'Invalid period. Use: all, last-month, last-6-months, or last-year' });
    }

    const result = await Expense.deleteMany({ userId, ...dateFilter });

    return res.json({ 
      message: `${result.deletedCount} expense(s) deleted successfully`,
      deletedCount: result.deletedCount 
    });
  } catch (error) {
    console.error('bulkDeleteExpense error:', error);
    return res.status(500).json({ message: 'Server Error' });
  }
};

// GET /api/v1/expense/downloadexcel
exports.downloadExpenseExcel = async (req, res) => {
  const userId = req.user.id || req.user._id;
  try {
    const expense = await Expense.find({ userId }).sort({ date: -1 });

    const data = expense.map((item) => ({
      Source: item.source || '',
      Category: item.categoryName || item.category || 'Uncategorized',
      Amount: item.amount,
      Date: item.date ? new Date(item.date).toISOString().slice(0, 10) : '',
    }));

    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(data);
    xlsx.utils.book_append_sheet(wb, ws, 'Expenses');

    const buffer = xlsx.write(wb, { bookType: 'xlsx', type: 'buffer' });
    res.setHeader('Content-Disposition', 'attachment; filename="expense_details.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.status(200).send(buffer);
  } catch (error) {
    console.error('downloadExpenseExcel error:', error);
    return res.status(500).json({ message: 'Server Error' });
  }
};

// PUT /api/v1/expense/:id
exports.updateExpense = async (req, res) => {
  const userId = req.user.id || req.user._id;
  const { id } = req.params;

  try {
    const { source, amount, date, icon, categoryId, category } = req.body;

    const update = {};
    if (typeof source !== 'undefined') update.source = String(source).trim();
    if (typeof amount !== 'undefined') update.amount = Number(amount);
    if (typeof date !== 'undefined') update.date = toUtcMidnight(date); // ✅ normalize on update
    if (typeof icon !== 'undefined') update.icon = icon;

    if (categoryId) {
      const cat = await Category.findOne({ _id: categoryId, userId, type: 'expense' }).lean();
      if (cat) {
        update.categoryId = cat._id;
        update.categoryName = cat.name;
        update.category = cat.name;
      }
    } else if (typeof category !== 'undefined') {
      update.categoryId = undefined;
      update.categoryName = category;
      update.category = category;
    }

    const updated = await Expense.findOneAndUpdate(
      { _id: id, userId },
      { $set: update },
      { new: true, runValidators: true }
    );

    if (!updated) return res.status(404).json({ message: 'Expense not found' });
    res.json({ message: 'Expense updated', expense: updated });
  } catch (err) {
    console.error('updateExpense', err);
    res.status(500).json({ message: 'Failed to update expense' });
  }
};
