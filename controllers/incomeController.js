const Income = require('../models/Income');
const Category = require('../models/Category');
const xlsx = require('xlsx');
const { autoAllocate } = require('../services/goalAutoAllocator'); // ADDED

// Normalize "date" into a Date at UTC midnight
function toUtcMidnight(v) {
  if (!v) return v;
  if (v instanceof Date) {
    return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate(), 0, 0, 0, 0));
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 0, 0, 0, 0));
  const parsed = new Date(s);
  if (!isNaN(parsed)) {
    return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate(), 0, 0, 0, 0));
  }
  return undefined;
}

// POST /api/v1/income/add
exports.addIncome = async (req, res) => {
  const userId = req.user.id || req.user._id;

  try {
    const { icon, source, amount, date, categoryId, category } = req.body;

    if (!source || !amount || !date) {
      return res.status(400).json({ message: 'Source, Amount and Date are required' });
    }

    // resolve category name snapshot for INCOME
    let categoryName = 'Uncategorized';
    if (categoryId) {
      const cat = await Category.findOne({
        _id: categoryId,
        userId,
        type: 'income',
      });
      if (!cat) return res.status(400).json({ message: 'Invalid income category' });
      categoryName = cat.name;
    } else if (category && String(category).trim()) {
      categoryName = String(category).trim();
    }

    const newIncome = await Income.create({
      userId,
      icon: icon || '',
      source: String(source).trim(),
      amount: Number(amount),
      date: toUtcMidnight(date),                 // ✅ normalize
      categoryId: categoryId || undefined,
      categoryName,
      category: categoryName, // legacy alias
    });

    // ADDED: auto-allocate to enabled goals right after income is created
    try {
      await autoAllocate({
        userId,
        incomeAmount: Number(newIncome.amount),
        memo: `Auto-allocate on income #${newIncome._id}`,
      });
    } catch (allocErr) {
      // Don't fail the request if allocation fails — just log it.
      console.warn('autoAllocate failed:', allocErr?.message || allocErr);
    }
    // END ADDED

    return res.status(201).json(newIncome);
  } catch (error) {
    console.error('addIncome error:', error);
    return res.status(500).json({ message: 'Server Error' });
  }
};

// GET /api/v1/income/get
exports.getAllIncome = async (req, res) => {
  const userId = req.user.id || req.user._id;
  try {
    const incomes = await Income.find({ userId }).sort({ date: -1 });
    return res.json(incomes);
  } catch (error) {
    console.error('getAllIncome error:', error);
    return res.status(500).json({ message: 'Server Error' });
  }
};

// DELETE /api/v1/income/:id
exports.deleteIncome = async (req, res) => {
  try {
    await Income.findByIdAndDelete(req.params.id);
    return res.json({ message: 'Income deleted successfully' });
  } catch (error) {
    console.error('deleteIncome error:', error);
    return res.status(500).json({ message: 'Server Error' });
  }
};

// NEW: DELETE /api/v1/income/bulk-delete
// Query params: ?period=all|last-month|last-6-months|last-year
exports.bulkDeleteIncome = async (req, res) => {
  const userId = req.user.id || req.user._id;
  const { period } = req.query;

  try {
    let dateFilter = {};
    const now = new Date();

    switch (period) {
      case 'last-month': {
        const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        dateFilter = { date: { $gte: oneMonthAgo, $lte: now } };
        break;
      }
      case 'last-6-months': {
        const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
        dateFilter = { date: { $gte: sixMonthsAgo, $lte: now } };
        break;
      }
      case 'last-year': {
        const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        dateFilter = { date: { $gte: oneYearAgo, $lte: now } };
        break;
      }
      case 'all':
        dateFilter = {};
        break;
      default:
        return res.status(400).json({ message: 'Invalid period. Use: all, last-month, last-6-months, or last-year' });
    }

    const result = await Income.deleteMany({ userId, ...dateFilter });
    
    return res.json({ 
      message: `${result.deletedCount} income(s) deleted successfully`,
      deletedCount: result.deletedCount 
    });
  } catch (error) {
    console.error('bulkDeleteIncome error:', error);
    return res.status(500).json({ message: 'Server Error' });
  }
};

// GET /api/v1/income/downloadexcel
exports.downloadIncomeExcel = async (req, res) => {
  const userId = req.user.id || req.user._id;
  try {
    const income = await Income.find({ userId }).sort({ date: -1 });

    const data = income.map((item) => ({
      Source: item.source || '',
      Category: item.categoryName || item.category || 'Uncategorized',
      Amount: item.amount,
      Date: item.date ? new Date(item.date).toISOString().slice(0, 10) : '',
    }));

    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(data);
    xlsx.utils.book_append_sheet(wb, ws, 'Income');

    const buffer = xlsx.write(wb, { bookType: 'xlsx', type: 'buffer' });
    res.setHeader('Content-Disposition', 'attachment; filename="income_details.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.status(200).send(buffer);
  } catch (error) {
    console.error('downloadIncomeExcel error:', error);
    return res.status(500).json({ message: 'Server Error' });
  }
};

// PUT /api/v1/income/:id
exports.updateIncome = async (req, res) => {
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
      const cat = await Category.findOne({ _id: categoryId, userId, type: 'income' }).lean();
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

    const updated = await Income.findOneAndUpdate(
      { _id: id, userId },
      { $set: update },
      { new: true, runValidators: true }
    );

    if (!updated) return res.status(404).json({ message: 'Income not found' });
    res.json({ message: 'Income updated', income: updated });
  } catch (err) {
    console.error('updateIncome', err);
    res.status(500).json({ message: 'Failed to update income' });
  }
};
