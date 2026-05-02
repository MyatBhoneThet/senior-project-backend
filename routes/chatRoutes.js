// backend/routes/chatRoutes.js - FULLY FIXED VERSION
const express = require('express');
const router = express.Router();

const jwt = require('jsonwebtoken');
const chrono = require('chrono-node');
const mongoose = require('mongoose');

const Expense = require('../models/Expense');
const Income  = require('../models/Income');

/* ================== CONFIG: Bangkok default (+07:00) ================== */
const TZ_OFFSET_MINUTES = parseInt(process.env.TZ_OFFSET_MINUTES || '420', 10); // 7*60

/* ================== AUTH (optional, never 401) ================== */
function getUserId(req) {
  try {
    const h = req.headers?.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return null;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded?.id || decoded?._id || null;
  } catch {
    return null;
  }
}

/* ================== TIMEZONE HELPERS ================== */
function toLocal(dUtc, offsetMin) { return new Date(dUtc.getTime() + offsetMin * 60_000); }
function toUTC(dLocal, offsetMin) { return new Date(dLocal.getTime() - offsetMin * 60_000); }

function dayRangeZoned(dUtc, offsetMin) {
  const local = toLocal(dUtc, offsetMin);
  const startLocal = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 0,0,0,0));
  const endLocal   = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 23,59,59,999));
  return { start: toUTC(startLocal, offsetMin), end: toUTC(endLocal, offsetMin),
           label: `${local.getUTCFullYear()}-${String(local.getUTCMonth()+1).padStart(2,'0')}-${String(local.getUTCDate()).padStart(2,'0')}`,
           granularity: 'day' };
}

function dayRangeZonedFromYMD(y, m, d, offsetMin) {
  const startLocal = new Date(Date.UTC(y, m, d, 0,0,0,0));
  const endLocal   = new Date(Date.UTC(y, m, d, 23,59,59,999));
  return { start: toUTC(startLocal, offsetMin), end: toUTC(endLocal, offsetMin),
           label: `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`, granularity: 'day' };
}

function monthRangeZonedFromYM(y, m, offsetMin) {
  const startLocal = new Date(Date.UTC(y, m, 1, 0,0,0,0));
  const endLocal   = new Date(Date.UTC(y, m+1, 0, 23,59,59,999));
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return { start: toUTC(startLocal, offsetMin), end: toUTC(endLocal, offsetMin),
           label: `${monthNames[m]} ${y}`, granularity: 'month' };
}

function weekRangeZoned(dUtc, offsetMin) {
  const local = toLocal(dUtc, offsetMin);
  const base = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 0,0,0,0));
  const dow = base.getUTCDay(); // 0..6
  const diffToMon = (dow + 6) % 7;
  base.setUTCDate(base.getUTCDate() - diffToMon);
  const startLocal = base;
  const endLocal   = new Date(Date.UTC(startLocal.getUTCFullYear(), startLocal.getUTCMonth(), startLocal.getUTCDate()+6, 23,59,59,999));
  return { start: toUTC(startLocal, offsetMin), end: toUTC(endLocal, offsetMin),
           label: 'this week', granularity: 'week' };
}

function monthRangeZoned(dUtc, offsetMin) {
  const local = toLocal(dUtc, offsetMin);
  return monthRangeZonedFromYM(local.getUTCFullYear(), local.getUTCMonth(), offsetMin);
}

/* ================== HELPER: Normalize month name ================== */
function normalizeMonthName(monthStr) {
  const normalized = monthStr.toLowerCase().trim();
  if (normalized.length === 3) return normalized;
  if (normalized.length > 3) return normalized.slice(0, 3);
  return normalized;
}

/* ================== TEXT → DATE RANGE (PERFECTLY FIXED) ================== */
function parseRange(text, offsetMin) {
  const s = String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[?!.,:;]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  const nowUtc = new Date();
  const nowLocal = toLocal(nowUtc, offsetMin);
  const currentYear = nowLocal.getUTCFullYear();
  const currentMonth = nowLocal.getUTCMonth();

  console.log('\n🔍 parseRange:', { text, normalized: s, currentYear, currentMonth: currentMonth + 1 });

  const monthMap = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
    apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
    aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9,
    nov: 10, november: 10, dec: 11, december: 11
  };

  const monthNames = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';

  // 1. Explicit time references
  if (/\btoday\b/.test(s))        return dayRangeZoned(nowUtc, offsetMin);
  if (/\byesterday\b/.test(s))   { const x = new Date(nowUtc); x.setUTCDate(x.getUTCDate() - 1); return dayRangeZoned(x, offsetMin); }
  if (/\bthis\s+week\b/.test(s))  return weekRangeZoned(nowUtc, offsetMin);
  if (/\blast\s+week\b/.test(s)) { const x = new Date(nowUtc); x.setUTCDate(x.getUTCDate() - 7); return weekRangeZoned(x, offsetMin); }
  if (/\bthis\s+month\b/.test(s)) return monthRangeZoned(nowUtc, offsetMin);
  if (/\blast\s+month\b/.test(s)) { const x = new Date(nowUtc); x.setUTCMonth(x.getUTCMonth() - 1); return monthRangeZoned(x, offsetMin); }

  // 2. 🔥 SPECIFIC DAY PATTERNS (highest priority - THESE MUST MATCH FIRST)
  const dayMonthPattern = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${monthNames})(?:\\s+(\\d{4}))?\\b`, 'i');
  const monthDayPattern = new RegExp(`\\b(${monthNames})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+(\\d{4}))?\\b`, 'i');
  
  const dmMatch = s.match(dayMonthPattern);
  if (dmMatch) {
    const day = parseInt(dmMatch[1], 10);
    const monthName = normalizeMonthName(dmMatch[2]);
    const month = monthMap[monthName];
    const year = dmMatch[3] ? parseInt(dmMatch[3], 10) : currentYear;
    console.log(`✅ DAY MATCH: ${day} ${monthName} ${year}`);
    return dayRangeZonedFromYMD(year, month, day, offsetMin);
  }

  const mdMatch = s.match(monthDayPattern);
  if (mdMatch) {
    const monthName = normalizeMonthName(mdMatch[1]);
    const day = parseInt(mdMatch[2], 10);
    const month = monthMap[monthName];
    const year = mdMatch[3] ? parseInt(mdMatch[3], 10) : currentYear;
    console.log(`✅ DAY MATCH: ${monthName} ${day} ${year}`);
    return dayRangeZonedFromYMD(year, month, day, offsetMin);
  }

  // 3. 🔥 MONTH-ONLY PATTERNS (Month Year / Year Month / Just Month)
  const monthYearPattern = new RegExp(`\\b(${monthNames})\\s+(\\d{4})\\b`, 'i');
  const yearMonthPattern = new RegExp(`\\b(\\d{4})\\s+(${monthNames})\\b`, 'i');
  
  const monthYearMatch = s.match(monthYearPattern);
  if (monthYearMatch) {
    const monthName = normalizeMonthName(monthYearMatch[1]);
    const month = monthMap[monthName];
    const year = parseInt(monthYearMatch[2], 10);
    console.log(`✅ MONTH MATCH: ${monthName} ${year}`);
    return monthRangeZonedFromYM(year, month, offsetMin);
  }

  const yearMonthMatch = s.match(yearMonthPattern);
  if (yearMonthMatch) {
    const year = parseInt(yearMonthMatch[1], 10);
    const monthName = normalizeMonthName(yearMonthMatch[2]);
    const month = monthMap[monthName];
    console.log(`✅ MONTH MATCH: ${year} ${monthName}`);
    return monthRangeZonedFromYM(year, month, offsetMin);
  }

  // 4. Just month name (current/recent year logic)
  const justMonthPattern = new RegExp(`\\b(in\\s+)?(${monthNames})\\b(?!\\s+\\d{1,2})`, 'i');
  const justMonthMatch = s.match(justMonthPattern);
  if (justMonthMatch) {
    const monthName = normalizeMonthName(justMonthMatch[2]);
    const month = monthMap[monthName];
    let year = currentYear;
    if (month > currentMonth) year = currentYear - 1;
    console.log(`✅ MONTH MATCH: ${monthName} ${year}`);
    return monthRangeZonedFromYM(year, month, offsetMin);
  }

  // 5. Year references
  if (/\bthis\s+year\b/.test(s)) {
    return { start: toUTC(new Date(Date.UTC(currentYear, 0, 1, 0,0,0,0)), offsetMin),
             end: toUTC(new Date(Date.UTC(currentYear, 11, 31, 23,59,59,999)), offsetMin),
             label: `${currentYear}`, granularity: 'year' };
  }
  if (/\blast\s+year\b/.test(s)) {
    const y = currentYear - 1;
    return { start: toUTC(new Date(Date.UTC(y, 0, 1, 0,0,0,0)), offsetMin),
             end: toUTC(new Date(Date.UTC(y, 11, 31, 23,59,59,999)), offsetMin),
             label: `${y}`, granularity: 'year' };
  }

  // 6. Last six months
  if (/\blast\s+six?\s+months?\b/.test(s)) {
    const endLocal = toLocal(nowUtc, offsetMin);
    const startLocal = new Date(endLocal);
    startLocal.setUTCMonth(startLocal.getUTCMonth() - 6);
    return { start: toUTC(startLocal, offsetMin), end: toUTC(endLocal, offsetMin),
             label: 'last 6 months', granularity: 'range' };
  }

  // 7. Fallback: chrono + default last 30 days
  const parsed = chrono.parse(s, nowUtc, { forwardDate: false });
  if (parsed?.length && parsed[0].start.isCertain('day')) {
    const parsedDate = parsed[0].start.date();
    return dayRangeZonedFromYMD(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate(), offsetMin);
  }

  const end = dayRangeZoned(nowUtc, offsetMin).end;
  const startLocal = toLocal(end, offsetMin);
  startLocal.setUTCDate(startLocal.getUTCDate() - 29);
  startLocal.setUTCHours(0,0,0,0);
  return { start: toUTC(startLocal, offsetMin), end, label: 'last 30 days', granularity: 'range' };
}

function detectIntent(text) {
  const s = String(text || '').toLowerCase();
  const wantsExpense = /\b(spend|spent|expense|expenses|paid|pay|cost|costs|waste|wasted|spam|spammed)\b/.test(s);
  const wantsIncome  = /\b(get|got|earn|earned|income|received|receive)\b/.test(s);
  if (/\blist|show|display\b/.test(s)) return 'list';
  if (wantsExpense && !wantsIncome) return 'expense';
  if (wantsIncome  && !wantsExpense) return 'income';
  return 'both';
}

/* ================== ROBUST SUM (unchanged) ================== */
function cleanAmountExpr(path) {
  return {
    $toDouble: {
      $replaceAll: {
        input: {
          $replaceAll: {
            input: {
              $replaceAll: {
                input: { $toString: path },
                find: ',',
                replacement: ''
              }
            },
            find: 'THB ',
            replacement: ''
          }
        },
        find: '฿',
        replacement: ''
      }
    }
  };
}

function buildWhenExpr() {
  const firstNonNull =
    { $ifNull: [
      '$date',
      { $ifNull: [ '$transactionDate', { $ifNull: [ '$transDate', { $ifNull: [ '$txnDate', { $ifNull: [ '$entryDate', { $ifNull: [ '$expenseDate', { $ifNull: [ '$incomeDate', { $ifNull: [ '$onDate', { $ifNull: [ '$at', { $ifNull: ['$createdAt', '$updatedAt'] } ] } ] } ] } ] } ] } ] } ] } ] }
    ] };

  return {
    $switch: {
      branches: [
        { case: { $eq: [{ $type: firstNonNull }, 'date'] }, then: firstNonNull },
        {
          case: {
            $and: [
              { $eq: [{ $type: firstNonNull }, 'string'] },
              { $or: [ { $gte: [{ $indexOfCP: [firstNonNull, '-'] }, 0] }, { $gte: [{ $indexOfCP: [firstNonNull, 'T'] }, 0] } ] }
            ]
          },
          then: { $toDate: firstNonNull }
        },
        {
          case: {
            $and: [
              { $eq: [{ $type: firstNonNull }, 'string'] },
              { $regexMatch: { input: firstNonNull, regex: /^(0?[1-9]|[12][0-9]|3[01])\/(0?[1-9]|1[0-2])\/\d{4}$/ } }
            ]
          },
          then: { $dateFromString: { dateString: firstNonNull, format: '%d/%m/%Y' } }
        },
        {
          case: {
            $and: [
              { $eq: [{ $type: firstNonNull }, 'string'] },
              { $regexMatch: { input: firstNonNull, regex: /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i } }
            ]
          },
          then: {
            $dateFromString: {
              dateString: {
                $replaceAll: {
                  input: {
                    $replaceAll: {
                      input: {
                        $replaceAll: {
                          input: { $replaceAll: { input: firstNonNull, find: 'st ', replacement: ' ' } },
                          find: 'nd ', replacement: ' '
                        }
                      },
                      find: 'rd ', replacement: ' '
                    }
                  },
                  find: 'th ', replacement: ' '
                }
              },
              format: '%d %b %Y'
            }
          }
        }
      ],
      default: { $toDate: firstNonNull }
    }
  };
}

async function sumUltra(model, userId, start, end) {
  const uid = String(userId);
  console.log(`🔍 Querying ${model.modelName}:`, {
    userId: uid,
    range: `${start.toISOString().slice(0,16)} → ${end.toISOString().slice(0,16)}`
  });

  const [doc] = await model.aggregate([
    {
      $match: {
        $expr: {
          $or: [
            { $eq: ['$userId', new mongoose.Types.ObjectId(uid)] },
            { $eq: [{ $toString: '$userId' }, uid] },
            { $eq: ['$userId', uid] },
            { $eq: ['$user', new mongoose.Types.ObjectId(uid)] },
            { $eq: [{ $toString: '$user' }, uid] },
            { $eq: ['$user', uid] },
          ]
        }
      }
    },
    { $addFields: { when: buildWhenExpr() } },
    { $match: { when: { $gte: start, $lte: end } } },
    {
      $addFields: {
        amtRaw: {
          $ifNull: ['$amount',
            { $ifNull: ['$price',
              { $ifNull: ['$total', '$value'] }
            ]}
          ]
        }
      }
    },
    {
      $addFields: {
        amt: {
          $switch: {
            branches: [
              { case: { $in: [{ $type: '$amtRaw' }, ['double','int','long','decimal']] }, then: '$amtRaw' },
              { case: { $eq: [{ $type: '$amtRaw' }, 'string'] }, then: cleanAmountExpr('$amtRaw') },
            ],
            default: 0
          }
        }
      }
    },
    { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$amt' } } },
  ]);

  const result = { count: doc?.count || 0, total: doc?.total || 0 };
  console.log(`📊 ${model.modelName} result:`, result);
  return result.total;
}

/* ================== ROUTE ================== */
router.post('/send', async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId || !mongoose.isValidObjectId(String(userId))) {
      return res.json({
        reply: {
          role: 'assistant',
          content: 'Please log in to use chat with your own data.',
          intent: 'info',
          range: null,
          totals: null,
        },
      });
    }

    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const lastUser = [...messages].reverse().find(m => m?.role === 'user');
    const text = lastUser?.content || String(req.body?.text || '');

    console.log('\n💬 User query:', text);

    const intent = detectIntent(text);
    const range  = parseRange(text, TZ_OFFSET_MINUTES);

    console.log('🎯 Intent:', intent, '| Range:', range.label);
    console.log('📅 Date range:', {
      start: range.start.toISOString(),
      end: range.end.toISOString(),
      granularity: range.granarity
    });

    const incomeTHB  = await sumUltra(Income,  userId, range.start, range.end);
    const expenseTHB = await sumUltra(Expense, userId, range.start, range.end);
    const netTHB     = incomeTHB - expenseTHB;

    console.log('💰 Results:', { incomeTHB, expenseTHB, netTHB });

    let content;
    if (intent === 'expense') {
      content = `You spent THB ${expenseTHB.toLocaleString()} (${range.label}).`;
    } else if (intent === 'income') {
      content = `You received THB ${incomeTHB.toLocaleString()} (${range.label}).`;
    } else {
      content = [
        `Insights (${range.label})`,
        `• Income:  THB ${incomeTHB.toLocaleString()}`,
        `• Expense: THB ${expenseTHB.toLocaleString()}`,
        `• Net:     THB ${netTHB.toLocaleString()}`,
      ].join('\n');
    }

    return res.json({
      reply: {
        role: 'assistant',
        content,
        intent,
        range: { from: range.start, to: range.end, label: range.label, granularity: range.granularity },
        totals: { incomeTHB, expenseTHB, netTHB },
      },
    });
  } catch (err) {
    console.error('chat/send error:', err);
    return res.status(200).json({
      reply: { role: 'assistant', content: 'Sorry, something went wrong.', intent: 'error' },
    });
  }
});

module.exports = router;
