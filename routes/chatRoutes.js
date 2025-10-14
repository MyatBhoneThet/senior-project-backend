// backend/routes/chatRoutes.js
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
  const startLocal = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1, 0,0,0,0));
  const endLocal   = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth()+1, 0, 23,59,59,999));
  return { start: toUTC(startLocal, offsetMin), end: toUTC(endLocal, offsetMin),
           label: `${local.getUTCFullYear()}-${String(local.getUTCMonth()+1).padStart(2,'0')}`,
           granularity: 'month' };
}

/* ================== TEXT → DATE RANGE ================== */
function parseRange(text, offsetMin) {
  const s = String(text || '').toLowerCase().trim();
  const nowUtc = new Date();

  if (/\btoday\b/.test(s))        return dayRangeZoned(nowUtc, offsetMin);
  if (/\byesterday\b/.test(s))   { const x = new Date(nowUtc); x.setUTCDate(x.getUTCDate() - 1); return dayRangeZoned(x, offsetMin); }
  if (/\bthis\s+week\b/.test(s))  return weekRangeZoned(nowUtc, offsetMin);
  if (/\blast\s+week\b/.test(s)) { const x = new Date(nowUtc); x.setUTCDate(x.getUTCDate() - 7); return weekRangeZoned(x, offsetMin); }
  if (/\bthis\s+month\b/.test(s)) return monthRangeZoned(nowUtc, offsetMin);
  if (/\blast\s+month\b/.test(s)) { const x = new Date(nowUtc); x.setUTCMonth(x.getUTCMonth() - 1); return monthRangeZoned(x, offsetMin); }

  const explicit = chrono.parseDate(s);
  if (explicit) return dayRangeZonedFromYMD(explicit.getFullYear(), explicit.getMonth(), explicit.getDate(), offsetMin);

  // default last 30 local days
  const end = dayRangeZoned(nowUtc, offsetMin).end;
  const startLocal = toLocal(end, offsetMin);
  startLocal.setUTCDate(startLocal.getUTCDate() - 29);
  startLocal.setUTCHours(0,0,0,0);
  return { start: toUTC(startLocal, offsetMin), end, label: 'last 30 days', granularity: 'range' };
}

function detectIntent(text) {
  const s = String(text || '').toLowerCase();
  const wantsExpense = /\b(spend|spent|expense|paid|pay|cost)\b/.test(s);
  const wantsIncome  = /\b(get|got|earn|earned|income|received|receive)\b/.test(s);
  if (/\blist|show|display\b/.test(s)) return 'list';
  if (wantsExpense && !wantsIncome) return 'expense';
  if (wantsIncome  && !wantsExpense) return 'income';
  return 'both';
}

/* ================== ROBUST SUM ==================
   - matches user by: userId OR user (ObjectId or string)
   - date from: date → transactionDate → transDate/txnDate → entryDate → expenseDate → incomeDate → onDate → at → createdAt → updatedAt
   - amount from: amount → price → total → value (handles "1,500.00" strings)
================================================== */
function cleanAmountExpr(path) {
  // Remove commas and "THB " if present, then cast to double
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
  // First non-null among many possible fields
  const firstNonNull =
    { $ifNull: [
      '$date',
      { $ifNull: [
        '$transactionDate',
        { $ifNull: [
          '$transDate',
          { $ifNull: [
            '$txnDate',
            { $ifNull: [
              '$entryDate',
              { $ifNull: [
                '$expenseDate',
                { $ifNull: [
                  '$incomeDate',
                  { $ifNull: [
                    '$onDate',
                    { $ifNull: [
                      '$at',
                      { $ifNull: ['$createdAt', '$updatedAt'] }
                    ] }
                  ] }
                ] }
              ] }
            ] }
          ] }
        ] }
      ] }
    ] };

  // If date already a Date → use it
  return {
    $switch: {
      branches: [
        { case: { $eq: [{ $type: firstNonNull }, 'date'] }, then: firstNonNull },

        // ISO-like (has '-' or 'T')
        {
          case: {
            $and: [
              { $eq: [{ $type: firstNonNull }, 'string'] },
              {
                $or: [
                  { $gte: [{ $indexOfCP: [firstNonNull, '-'] }, 0] },
                  { $gte: [{ $indexOfCP: [firstNonNull, 'T'] }, 0] },
                ]
              }
            ]
          },
          then: { $toDate: firstNonNull }
        },

        // dd/MM/YYYY
        {
          case: {
            $and: [
              { $eq: [{ $type: firstNonNull }, 'string'] },
              { $regexMatch: { input: firstNonNull, regex: /^(0?[1-9]|[12][0-9]|3[01])\/(0?[1-9]|1[0-2])\/\d{4}$/ } }
            ]
          },
          then: { $dateFromString: { dateString: firstNonNull, format: '%d/%m/%Y' } }
        },

        // "1 Oct 2025" (after removing ordinal suffix like "1st")
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
                          input: {
                            $replaceAll: { input: firstNonNull, find: 'st ', replacement: ' ' }
                          },
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
        },
      ],
      default: { $toDate: firstNonNull } // last attempt
    }
  };
}

async function sumUltra(model, userId, start, end) {
  const uid = String(userId);

  const [doc] = await model.aggregate([
    // match by either userId or user, in objectId or string form
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

    // Pick/parse date
    { $addFields: { when: buildWhenExpr() } },
    { $match: { when: { $gte: start, $lte: end } } },

    // Pick/parse amount
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

    { $group: { _id: null, total: { $sum: '$amt' } } },
  ]);

  return doc?.total || 0;
}

/* ================== ROUTE ================== */
// POST /api/v1/chat/send   (never returns 401)
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

    const intent = detectIntent(text);
    const range  = parseRange(text, TZ_OFFSET_MINUTES);

    const incomeTHB  = await sumUltra(Income,  userId, range.start, range.end);
    const expenseTHB = await sumUltra(Expense, userId, range.start, range.end);
    const netTHB     = incomeTHB - expenseTHB;

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
