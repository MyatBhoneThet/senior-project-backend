// backend/services/expenseService.js
const mongoose = require("mongoose");
function tryRequire(p){ try{ return require(p);} catch{ return null; } }

const Expense     = mongoose.models.Expense     || tryRequire("../models/Expense");
const Income      = mongoose.models.Income      || tryRequire("../models/Income"); 
const Transaction = mongoose.models.Transaction || tryRequire("../models/Transaction") || tryRequire("../models/Transactions");

// ---------- helpers ----------
const startOfDay = (d)=> new Date(d.getFullYear(), d.getMonth(), d.getDate());
const MS_DAY = 86400000;
function daysAgo(n){ return new Date(Date.now() - n * MS_DAY); }

function formatTHB(n){ return `THB ${Number(n||0).toLocaleString()}`; }
function formatDate(d){ const x=new Date(d); return isNaN(x)? String(d): x.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}); }
function formatItemsList(title,total,items){
  const head = `${title}\nTotal: ${formatTHB(total)}\n`;
  const lines = items.slice(0,50).map(it=>`• ${formatDate(it.date)} — ${it.category||"General"} — ${formatTHB(it.amount)}${it.note?` — ${it.note}`:""}`);
  const more = items.length>50?`\n…and ${items.length-50} more.`:"";
  return [head,...lines,more].join("\n");
}
function formatDualSummary({ title, lastLabel, last, lastCount, allTotal, allCount }) {
  return [
    title,
    `${lastLabel}: ${formatTHB(last)} (${lastCount} item${lastCount===1?'':'s'})`,
    `All time: ${formatTHB(allTotal)} (${allCount} item${allCount===1?'':'s'})`,
  ].join("\n");
}
function userFilter(uid){ return uid ? { $or:[ {userId:uid},{user:uid},{userID:uid},{owner:uid},{createdBy:uid},{uid:uid} ] } : {}; }
function escRegex(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }

function mapExpenseDoc(d){
  const date = d.date || d.createdAt;
  const category = d.category || (d.category && d.category.name) || "Expense";
  const amount = Number(d.amount ?? d.price ?? d.value ?? d.total ?? 0);
  const note = d.note || d.description || "";
  return { date, category, amount, note };
}
function mapIncomeDoc(d){
  const date = d.date || d.createdAt;
  const category = d.source || d.category || (d.category && d.category.name) || "Income"; // <-- source
  const amount = Number(d.amount ?? d.value ?? d.total ?? 0);
  const note = d.note || d.description || "";
  return { date, category, amount, note };
}
async function jsRangeFilter(Model,q,since,until){
  const rows = await Model.find(q).sort({date:-1,createdAt:-1}).lean();
  return rows.filter(r=>{ const dt=new Date(r.date||r.createdAt); if(isNaN(dt)) return false; if(since && dt<since) return false; if(until && dt>until) return false; return true; });
}

// ---------- base lists ----------
async function getExpenses({ userId, since=null, until=null }) {
  const qU = userFilter(userId);
  if (Expense){
    const q = { ...(Object.keys(qU).length ? qU : {}) };
    let docs = await Expense.find(q).sort({date:-1,createdAt:-1}).lean();
    if (since || until) docs = await jsRangeFilter(Expense,q,since,until);
    const items = docs.map(mapExpenseDoc);
    const total = items.reduce((s,d)=>s+d.amount,0);
    return { total, items };
  }
  if (Transaction){
    const q = { ...(Object.keys(qU).length ? qU : {}), $or:[{type:/expense/i},{kind:/expense/i}] };
    let docs = await Transaction.find(q).sort({date:-1,createdAt:-1}).lean();
    if (since || until) docs = await jsRangeFilter(Transaction,q,since,until);
    const items = docs.map(mapExpenseDoc);
    const total = items.reduce((s,d)=>s+d.amount,0);
    return { total, items };
  }
  return { total:0, items:[], warning:"No Expense/Transaction model found." };
}

async function getIncome({ userId, since=null, until=null }) {
  const qU = userFilter(userId);
  if (Income){
    const q = { ...(Object.keys(qU).length ? qU : {}) };
    let docs = await Income.find(q).sort({date:-1,createdAt:-1}).lean();
    if (since || until) docs = await jsRangeFilter(Income,q,since,until);
    const items = docs.map(mapIncomeDoc);
    const total = items.reduce((s,d)=>s+d.amount,0);
    return { total, items };
  }
  if (Transaction){
    const q = { ...(Object.keys(qU).length ? qU : {}), $or:[{type:/income/i},{kind:/income/i}] };
    let docs = await Transaction.find(q).sort({date:-1,createdAt:-1}).lean();
    if (since || until) docs = await jsRangeFilter(Transaction,q,since,until);
    const items = docs.map(mapIncomeDoc);
    const total = items.reduce((s,d)=>s+d.amount,0);
    return { total, items };
  }
  return { total:0, items:[], warning:"No Income/Transaction model found." };
}

// ---------- category lists ----------
async function getSpendByCategory({ userId, category, since=null, until=null }) {
  const rx = new RegExp(escRegex(category), 'i');
  const qU = userFilter(userId);

  if (Expense){
    const q = { ...(Object.keys(qU).length ? qU : {}), $or:[
      { category: rx }, { categoryName: rx }, { "category.name": rx },
      { note: rx }, { description: rx }
    ]};
    let docs = await Expense.find(q).sort({date:-1,createdAt:-1}).lean();
    if (since || until) docs = await jsRangeFilter(Expense,q,since,until);
    const items = docs.map(mapExpenseDoc);
    const total = items.reduce((s,d)=>s+d.amount,0);
    return { total, items };
  }

  if (Transaction){
    const base = { ...(Object.keys(qU).length ? qU : {}), $or:[{type:/expense/i},{kind:/expense/i}] };
    const q = { ...base, $and:[{ $or: [
      { category: rx }, { categoryName: rx }, { "category.name": rx }, { note: rx }, { description: rx }
    ]}] };
    let docs = await Transaction.find(q).sort({date:-1,createdAt:-1}).lean();
    if (since || until) docs = await jsRangeFilter(Transaction,q,since,until);
    const items = docs.map(mapExpenseDoc);
    const total = items.reduce((s,d)=>s+d.amount,0);
    return { total, items };
  }

  return { total:0, items:[], warning:"No Expense/Transaction model found." };
}

async function getIncomeByCategory({ userId, category, since=null, until=null }) {
  const rx = new RegExp(escRegex(category), 'i');
  const qU = userFilter(userId);

  if (Income){
    const q = { ...(Object.keys(qU).length ? qU : {}), $or:[
      { source: rx }, { category: rx }, { categoryName: rx }, { "category.name": rx },
      { note: rx }, { description: rx }
    ]};
    let docs = await Income.find(q).sort({date:-1,createdAt:-1}).lean();
    if (since || until) docs = await jsRangeFilter(Income,q,since,until);
    const items = docs.map(mapIncomeDoc);
    const total = items.reduce((s,d)=>s+d.amount,0);
    return { total, items };
  }

  if (Transaction){
    const base = { ...(Object.keys(qU).length ? qU : {}), $or:[{type:/income/i},{kind:/income/i}] };
    const q = { ...base, $and:[{ $or:[
      { source: rx }, { category: rx }, { categoryName: rx }, { "category.name": rx }, { note: rx }, { description: rx }
    ]}]};
    let docs = await Transaction.find(q).sort({date:-1,createdAt:-1}).lean();
    if (since || until) docs = await jsRangeFilter(Transaction,q,since,until);
    const items = docs.map(mapIncomeDoc);
    const total = items.reduce((s,d)=>s+d.amount,0);
    return { total, items };
  }

  return { total:0, items:[], warning:"No Income/Transaction model found." };
}

// ---------- dual (last30 + all-time) ----------
async function getExpenseCategoryTotals30AndAll(userId, category) {
  const since30 = startOfDay(daysAgo(30));
  const last = await getSpendByCategory({ userId, category, since: since30, until: new Date() });
  const all  = await getSpendByCategory({ userId, category });
  return {
    lastTotal: last.total, lastCount: last.items.length, lastItems: last.items,
    allTotal:  all.total,  allCount:  all.items.length,  allItems:  all.items,
  };
}
async function getIncomeCategoryTotals30AndAll(userId, category) {
  const since30 = startOfDay(daysAgo(30));
  const last = await getIncomeByCategory({ userId, category, since: since30, until: new Date() });
  const all  = await getIncomeByCategory({ userId, category });
  return {
    lastTotal: last.total, lastCount: last.items.length, lastItems: last.items,
    allTotal:  all.total,  allCount:  all.items.length,  allItems:  all.items,
  };
}

// ---------- other convenience ----------
async function getLast30DaysExpenses(userId){ const since=startOfDay(new Date(Date.now()-30*MS_DAY)); return getExpenses({userId,since}); }
async function getLast30DaysIncome(userId){  const since=startOfDay(new Date(Date.now()-30*MS_DAY)); return getIncome({userId,since}); }
async function getAllExpenses(userId){ return getExpenses({userId}); }
async function getAllIncome(userId){   return getIncome({userId}); }
async function getMTDTotal(userId,type){
  const now=new Date(); const since=new Date(now.getFullYear(),now.getMonth(),1);
  return /expense/i.test(type) ? (await getExpenses({userId,since})).total
                               : (await getIncome({userId,since})).total;
}

module.exports = {
  getLast30DaysExpenses, getLast30DaysIncome,
  getAllExpenses, getAllIncome,
  getMTDTotal, getSpendByCategory, getIncomeByCategory,
  getExpenseCategoryTotals30AndAll, getIncomeCategoryTotals30AndAll,
  formatItemsList, formatTHB, formatDualSummary,
};
