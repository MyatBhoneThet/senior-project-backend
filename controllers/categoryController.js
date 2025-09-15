const Category = require('../models/Category');

exports.listByType = async (req, res) => {
  try {
    const { type } = req.query; // 'expense' | 'income'
    if (!['expense','income'].includes(type)) {
      return res.status(400).json({ message: 'type must be expense or income' });
    }
    const rows = await Category.find({ userId: req.user._id, type }).sort({ name: 1 });
    res.json(rows);
  } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.create = async (req, res) => {
  try {
    const { type, name, icon, color, keywords } = req.body;
    if (!['expense','income'].includes(type)) {
      return res.status(400).json({ message: 'type must be expense or income' });
    }
    const row = await Category.create({
      userId: req.user._id,
      type, name: name.trim(),
      icon: icon || '', color: color || '#8b5cf6',
      keywords: keywords || [],
    });
    res.status(201).json(row);
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ message: 'Category already exists' });
    res.status(500).json({ message: e.message });
  }
};
