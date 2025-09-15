const Expense = require('../models/Expense');
const Category = require('../models/Category');
const xlsx = require('xlsx');

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
      date: new Date(date),
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

// GET /api/v1/expense/downloadexpense
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

    const filename = 'expense_details.xlsx';
    xlsx.writeFile(wb, filename);
    return res.download(filename);
  } catch (error) {
    console.error('downloadExpenseExcel error:', error);
    return res.status(500).json({ message: 'Server Error' });
  }
};
