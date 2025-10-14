// All helpers work in UTC so your records stay consistent.
function toUTCDateOnly(d) {
  const x = (d instanceof Date) ? d : new Date(d);
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()));
}
function daysInMonthUTC(y, m /* 0-11 */) {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}
function addDaysUTC(d, n) {
  const x = toUTCDateOnly(d);
  const t = x.getTime() + n * 86400000;
  return toUTCDateOnly(new Date(t));
}
function addWeeksUTC(d, n) {
  return addDaysUTC(d, 7 * n);
}
function addMonthsClampedUTC(d, n, anchorDay /* 1-31 */) {
  const x = toUTCDateOnly(d);
  const y = x.getUTCFullYear();
  const m = x.getUTCMonth();
  const targetM = m + n;
  const targetY = y + Math.floor(targetM / 12);
  const modM = ((targetM % 12) + 12) % 12;
  const dim = daysInMonthUTC(targetY, modM);
  const day = Math.min(anchorDay || x.getUTCDate(), dim);
  return new Date(Date.UTC(targetY, modM, day));
}
function addYearsClampedUTC(d, n, anchorMonth /*0-11*/, anchorDay /*1-31*/) {
  const x = toUTCDateOnly(d);
  const y = x.getUTCFullYear() + n;
  const m = (anchorMonth == null) ? x.getUTCMonth() : anchorMonth;
  const dim = daysInMonthUTC(y, m);
  const day = Math.min(anchorDay || x.getUTCDate(), dim);
  return new Date(Date.UTC(y, m, day));
}
module.exports = {
  toUTCDateOnly,
  addDaysUTC,
  addWeeksUTC,
  addMonthsClampedUTC,
  addYearsClampedUTC,
  daysInMonthUTC,
};
