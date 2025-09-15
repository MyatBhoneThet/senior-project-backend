const mongoose = require('mongoose');

const ExpenseSchema = new mongoose.Schema({
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  source:        { type: String, trim: true },  // e.g., KFC / Starbucks
  categoryId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  categoryName:  { type: String, default: 'Uncategorized' }, // snapshot text
  category:      { type: String, default: 'Uncategorized' }, // legacy alias
  amount:        { type: Number, required: true },
  date:          { type: Date, default: Date.now },
  icon:          { type: String, default: '' },
}, { timestamps: true });
// Same idea: one compound index, no per-field index duplication
ExpenseSchema.index({ userId: 1, date: 1 });

module.exports = mongoose.model('Expense', ExpenseSchema);
