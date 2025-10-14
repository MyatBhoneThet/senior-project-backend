// node scripts/normalizeDates.js
/* Normalizes string dates in Expense & Income to real Date objects */

const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Load environment variables from common locations
// Priority: explicit shell var > ./config.env > ./.env (in backend)
const envPathsTried = [];
function loadDotenv() {
  const candidates = [
    path.resolve(__dirname, '../config.env'),
    path.resolve(__dirname, '../.env'),
  ];
  for (const p of candidates) {
    try {
      const r = dotenv.config({ path: p });
      envPathsTried.push(`${p} (${r?.error ? 'not found' : 'loaded'})`);
    } catch (e) {
      envPathsTried.push(`${p} (error loading)`);
    }
  }
}
loadDotenv();

// Grab the connection string from multiple possible keys
const MONGO =
  process.env.MONGO_URI ||
  process.env.DATABASE_URI ||
  process.env.DB_URI ||
  process.env.ATLAS_URI ||
  '';

if (!MONGO) {
  console.error('❌ No Mongo connection string found.\n');
  console.error('Looked for env keys: MONGO_URI, DATABASE_URI, DB_URI, ATLAS_URI');
  console.error('Tried dotenv files:\n- ' + envPathsTried.join('\n- '));
  console.error('\nFix one of these:');
  console.error('  1) Put MONGO_URI in backend/.env or backend/config.env');
  console.error('  2) Or pass it inline:');
  console.error('     MONGO_URI="mongodb+srv://user:pass@cluster/db?retryWrites=true&w=majority" node scripts/normalizeDates.js');
  process.exit(1);
}

// Models
const Expense = require('../models/Expense');
const Income  = require('../models/Income');

function stripOrdinals(s = '') {
  return s.replace(/\b(\d+)(st|nd|rd|th)\b/gi, '$1');
}

function tryParseToDate(value) {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value)) return value;

  if (typeof value === 'string') {
    const t = stripOrdinals(value.trim());

    // Try native Date first
    const native = new Date(t);
    if (!isNaN(native)) return native;

    // Try YYYY-MM-DD as UTC midnight
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
      return new Date(`${t}T00:00:00.000Z`);
    }

    // Try "2 Oct 2025" or "2 October 2025" by mapping month names
    const monthShort = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    const m = t.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
    if (m) {
      const day = Number(m[1]);
      const monStr = m[2].toLowerCase().slice(0,3);
      const year = Number(m[3]);
      const mon = monthShort.indexOf(monStr);
      if (mon >= 0) return new Date(Date.UTC(year, mon, day, 0, 0, 0, 0));
    }
  }
  return null;
}

async function normalizeModelDates(Model, modelName) {
  const cursor = Model.find({}).cursor();
  let changed = 0, scanned = 0;

  for await (const doc of cursor) {
    scanned++;
    const d = doc.date;

    if (!(d instanceof Date) || isNaN(d)) {
      const parsed = tryParseToDate(d);
      if (parsed) {
        doc.date = parsed;
        await doc.save();
        changed++;
      }
    }
  }

  console.log(`✔ ${modelName}: scanned ${scanned}, normalized ${changed}`);
}

(async () => {
  try {
    console.log('Connecting to Mongo…');
    await mongoose.connect(MONGO, {
      // You can add options if needed
    });
    console.log('Connected.');

    await normalizeModelDates(Expense, 'Expense');
    await normalizeModelDates(Income, 'Income');

    await mongoose.disconnect();
    console.log('Done. ✅');
    process.exit(0);
  } catch (err) {
    console.error('❌ Normalize failed:', err?.message || err);
    process.exit(1);
  }
})();
