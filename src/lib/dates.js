'use strict';

function schoolDateISO(timeZone = 'Asia/Tehran', date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA-u-ca-gregory-nu-latn', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function isISODate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function latinDigits(value) {
  return String(value ?? '').replace(/[۰-۹٠-٩]/g, (digit) => {
    const code = digit.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

const PERSIAN_DATE_FORMATTER = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
  year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC'
});

function persianMonthStart(year, month) {
  const searchStart = Date.UTC(year + 621, 2, 1, 12);
  for (let offset = 0; offset <= 370; offset += 1) {
    const timestamp = searchStart + offset * 24 * 60 * 60 * 1000;
    const parts = Object.fromEntries(PERSIAN_DATE_FORMATTER.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]));
    if (Number(parts.year) === year && Number(parts.month) === month && Number(parts.day) === 1) return timestamp;
  }
  return null;
}

function isPersianDate(value) {
  if (typeof value !== 'string') return false;
  const match = latinDigits(value).trim().replace(/-/g, '/').match(/^(\d{3,4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  if (year < 1000 || year >= 1700 || month < 1 || month > 12 || day < 1) return false;
  const start = persianMonthStart(year, month);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const next = persianMonthStart(nextYear, nextMonth);
  if (!start || !next) return false;
  const monthLength = Math.round((next - start) / (24 * 60 * 60 * 1000));
  return day <= monthLength;
}

function isCalendarDate(value) {
  return typeof value === 'string' && (isISODate(value) || isPersianDate(value));
}

function calendarDateISO(value) {
  if (typeof value !== 'string') return '';
  if (isISODate(value)) return value;
  if (!isPersianDate(value)) return '';
  const match = latinDigits(value).trim().replace(/-/g, '/').match(/^(\d{3,4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!match) return '';
  const [year, month, day] = match.slice(1).map(Number);
  const start = persianMonthStart(year, month);
  if (!start) return '';
  const date = new Date(start + (day - 1) * 24 * 60 * 60 * 1000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

module.exports = { schoolDateISO, isISODate, isPersianDate, isCalendarDate, calendarDateISO, latinDigits };
