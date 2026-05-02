// backend/utils/intent.js
const chrono = require('chrono-node');

function parseTimeRange(text) {
  const q = (text || "").toLowerCase();
  const now = new Date();
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  const daysAgo = (n) => startOfDay(new Date(Date.now() - n * 86400000));

  // Quick patterns first
  if (/(last|past)\s*7\s*days?/.test(q))  return { since: daysAgo(7),  until: now, label: "last 7 days" };
  if (/(last|past)\s*30\s*days?/.test(q)) return { since: daysAgo(30), until: now, label: "last 30 days" };
  if (/this\s*month/.test(q))             return { since: startOfThisMonth, until: now, label: "this month" };
  if (/last\s*month/.test(q))             return { since: startOfLastMonth, until: endOfLastMonth, label: "last month" };
  if (/all\s*time|overall|ever/.test(q))  return { since: null, until: null, label: "all time" };

  // Check for specific month names (e.g., "October 2024", "expenses in June", "show me September")
  const monthPattern = /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/i;
  const hasMonthKeyword = monthPattern.test(q);
  
  // Check if they're asking for a specific day (e.g., "October 15th")
  const hasDayIndicator = /\b(\d{1,2}(st|nd|rd|th)|on\s+the\s+\d{1,2})\b/.test(q);
  
  if (hasMonthKeyword) {
    const parsed = chrono.parse(q, now, { forwardDate: false });
    
    if (parsed && parsed.length > 0) {
      const parsedDate = parsed[0].start.date();
      
      // If they mentioned a month but NOT a specific day, give them the whole month
      if (!hasDayIndicator) {
        const monthStart = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), 1);
        const monthEnd = new Date(parsedDate.getFullYear(), parsedDate.getMonth() + 1, 0, 23, 59, 59, 999);
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const label = `${monthNames[parsedDate.getMonth()]} ${parsedDate.getFullYear()}`;
        
        return { since: monthStart, until: monthEnd, label };
      } else {
        // They want a specific day
        const dayStart = startOfDay(parsedDate);
        const dayEnd = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate(), 23, 59, 59, 999);
        const label = parsedDate.toISOString().slice(0, 10);
        
        return { since: dayStart, until: dayEnd, label };
      }
    }
  }

  // Try parsing other date formats with chrono as fallback
  const parsed = chrono.parseDate(q);
  if (parsed) {
    const parsedDate = new Date(parsed);
    const dayStart = startOfDay(parsedDate);
    const dayEnd = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate(), 23, 59, 59, 999);
    const label = parsedDate.toISOString().slice(0, 10);
    return { since: dayStart, until: dayEnd, label };
  }

  // Default: last 30 days
  return { since: daysAgo(30), until: now, label: "last 30 days" };
}

function cleanCategoryText(s) {
  if (!s) return s;
  let c = String(s).toLowerCase();
  const cut = c.match(/^(.+?)\s+(?:this|last|past)\s+(?:month|week|year|\d+\s*days?)\b/);
  if (cut) c = cut[1];
  c = c
    .replace(/\b(this|last|past)\b/g, "")
    .replace(/\b(month|week|year|day|days|today|yesterday|tonight|ytd|mtd|overall|all\s*time)\b/g, "")
    .replace(/\b(\d+)\s*days?\b/g, "")
    .replace(/[.,!?]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return c;
}

// EXPENSE category (on/for/in…)
function parseExpenseCategory(text) {
  const q = (text || "").toLowerCase().trim();
  const m = q.match(/\b(?:on|for|in)\s+([a-z0-9 _\-&]{2,})/i) ||
            q.match(/spend(?:ing)?\s+(?:on\s+)?([a-z0-9 _\-&]{2,})/i);
  if (!m) return null;
  return cleanCategoryText(m[1]);
}

// INCOME category ("from salary…", "income salary", "earn freelance")
function parseIncomeCategory(text) {
  const q = (text || "").toLowerCase().trim();
  const m = q.match(/\bfrom\s+([a-z0-9 _\-&]{2,})/i);
  if (m) return cleanCategoryText(m[1]);
  const m2 = q.match(/\b(?:income|earn|earned|got|get|receive|received)\s+([a-z0-9 _\-&]{2,})/i);
  if (m2) return cleanCategoryText(m2[1]);
  return null;
}

function parseIntent(text) {
  const q = (text || "").toLowerCase().trim();

  // Quick commands (keep these if you use them)
  if (/^last30daysexpense(s)?(\s*list)?$/.test(q)) return { name: "EXPENSES_LAST_30_DAYS_LIST" };
  if (/^last30daysincome(s)?(\s*list)?$/.test(q))  return { name: "INCOME_LAST_30_DAYS_LIST" };
  if (/^all\s*expenses(\s*list)?$/.test(q))        return { name: "EXPENSES_ALL_LIST" };
  if (/^all\s*income(s)?(\s*list)?$/.test(q))      return { name: "INCOME_ALL_LIST" };
  if (/mtd/.test(q) && /expense|spend/.test(q))    return { name: "EXPENSES_MTD_TOTAL" };
  if (/mtd/.test(q) && /income|earn/.test(q))      return { name: "INCOME_MTD_TOTAL" };

  // Category questions → we'll ALWAYS reply with last30 + all-time
  if (/how much.*spend|spend.*how much|total.*spend|spending.*amount/.test(q) || /spend on|spending on|expenses? for/.test(q)) {
    const cat = parseExpenseCategory(q);
    if (cat) return { name: "SPEND_BY_CATEGORY", params: { category: cat } };
  }
  if (/how much.*(earn|income|get|got|receive|received)/.test(q) || /\bincome from\b|\bfrom\b/.test(q)) {
    const cat = parseIncomeCategory(q);
    if (cat) return { name: "INCOME_BY_CATEGORY", params: { category: cat } };
  }

  // Natural-language lists
  if (/(last|past)\s*30\s*days?.*(expense|spend|spent)/.test(q)) return { name: "EXPENSES_LAST_30_DAYS_LIST" };
  if (/(last|past)\s*30\s*days?.*(income|earn)/.test(q))        return { name: "INCOME_LAST_30_DAYS_LIST" };

  // Summaries (optional)
  if (/^(expense|expenses)\s+summary$/.test(q) ||
      /(expense|spend).*(both|summary|all\s*time)/.test(q) ||
      /(expense|spend).*(last\s*30|30\s*days).*(all|all\s*time)/.test(q)) {
    return { name: "EXPENSES_30_AND_ALL" };
  }
  if (/^(income)\s+summary$/.test(q) ||
      /(income|earn|get|got|salary).*(both|summary|all\s*time)/.test(q) ||
      /(income).*(last\s*30|30\s*days).*(all|all\s*time)/.test(q)) {
    return { name: "INCOME_30_AND_ALL" };
  }

  return { name: "NONE" };
}

module.exports = {
  parseIntent,
  parseTimeRange,
  cleanCategoryText,
  parseExpenseCategory,
  parseIncomeCategory,
};
