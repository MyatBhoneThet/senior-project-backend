const mongoose = require('mongoose');

const IncomeSchema = new mongoose.Schema({
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  source:        { type: String, required: true, trim: true }, // e.g., Salary / Freelance
  categoryId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  categoryName:  { type: String, default: 'Uncategorized' },
  category:      { type: String, default: 'Uncategorized' },
  amount:        { type: Number, required: true },
  date:          { type: Date, default: Date.now },
  icon:          { type: String, default: '' },
}, { timestamps: true });

// Single source of truth for performance: one compound index used by your queries
IncomeSchema.index({ userId: 1, date: 1 });

module.exports = mongoose.model('Income', IncomeSchema);
