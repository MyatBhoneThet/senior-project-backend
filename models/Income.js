const mongoose = require('mongoose');

function normalizeToUTCDate(v) {
  if (!v) return v;

  if (v instanceof Date) {
    return new Date(Date.UTC(
      v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate(), 0, 0, 0, 0
    ));
  }

  if (typeof v === 'string') {
    const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const [_, y, mo, d] = m;
      return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), 0, 0, 0, 0));
    }
    const parsed = new Date(v);
    if (!isNaN(parsed)) {
      return new Date(Date.UTC(
        parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate(), 0, 0, 0, 0
      ));
    }
  }

  return v;
}

const IncomeSchema = new mongoose.Schema(
  {
    userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    source:       { type: String, required: true, trim: true }, // incomes require a source
    categoryId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
    categoryName: { type: String, default: 'Uncategorized' },
    category:     { type: String, default: 'Uncategorized' },
    amount:       { type: Number, required: true },
    date:         { type: Date, required: true, set: normalizeToUTCDate }, // ✅ normalize
    icon:         { type: String, default: '' },
  },
  { timestamps: true }
);

IncomeSchema.index({ userId: 1, date: 1 });

module.exports = mongoose.model('Income', IncomeSchema);
