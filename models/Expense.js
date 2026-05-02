const mongoose = require('mongoose');

// Convert any input into a Date at UTC midnight (YYYY-MM-DDT00:00:00.000Z)
function normalizeToUTCDate(v) {
  if (!v) return v;

  // Already a Date? force to UTC midnight
  if (v instanceof Date) {
    return new Date(Date.UTC(
      v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate(), 0, 0, 0, 0
    ));
  }

  // String "YYYY-MM-DD" from your forms
  if (typeof v === 'string') {
    const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const [_, y, mo, d] = m;
      return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), 0, 0, 0, 0));
    }
    // Any other parseable string
    const parsed = new Date(v);
    if (!isNaN(parsed)) {
      return new Date(Date.UTC(
        parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate(), 0, 0, 0, 0
      ));
    }
  }

  // Leave other values as-is
  return v;
}

const ExpenseSchema = new mongoose.Schema(
  {
    userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    source:       { type: String, trim: true },                 // optional for expenses
    categoryId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
    categoryName: { type: String, default: 'Uncategorized' },   // snapshot text
    category:     { type: String, default: 'Uncategorized' },   // legacy alias
    amount:       { type: Number, required: true },
    date:         { type: Date, required: true, set: normalizeToUTCDate }, // ✅ normalize
    icon:         { type: String, default: '' },
  },
  { timestamps: true }
);

// Fast queries: by user & date
ExpenseSchema.index({ userId: 1, date: 1 });

module.exports = mongoose.model('Expense', ExpenseSchema);
