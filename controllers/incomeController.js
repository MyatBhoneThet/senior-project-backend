const Income = require('../models/Income');
const Category = require('../models/Category');
const xlsx = require('xlsx');

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
      source: source.trim(),
      amount: Number(amount),
      date: new Date(date),
      categoryId: categoryId || undefined,
      categoryName,
      category: categoryName, // legacy alias
    });

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

// GET /api/v1/income/downloadexcel
exports.downloadIncomeExcel = async (req, res) => {
  const userId = req.user.id || req.user._id;
  try {
    const income = await Income.find({ userId }).sort({ date: -1 });

    const data = income.map((item) => ({
      Source: item.source,
      Category: item.categoryName || item.category || 'Uncategorized',
      Amount: item.amount,
      Date: item.date ? new Date(item.date).toISOString().slice(0, 10) : '',
    }));

    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(data);
    xlsx.utils.book_append_sheet(wb, ws, 'Income');

    const filename = 'income_details.xlsx';
    xlsx.writeFile(wb, filename);
    return res.download(filename);
  } catch (error) {
    console.error('downloadIncomeExcel error:', error);
    return res.status(500).json({ message: 'Server Error' });
  }
};
