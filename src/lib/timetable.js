'use strict';

const { latinDigits } = require('./dates');

const WEEKDAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];
const DEFAULT_SCHOOL_DAYS = WEEKDAYS.slice(0, 6);
const DEFAULT_SCHOOL_PERIODS = [
  { id: 'morning-1', name: 'زنگ ۱', shift: 'صبح', startTime: '08:00', endTime: '08:45' },
  { id: 'morning-2', name: 'زنگ ۲', shift: 'صبح', startTime: '09:00', endTime: '09:45' },
  { id: 'morning-3', name: 'زنگ ۳', shift: 'صبح', startTime: '10:00', endTime: '10:45' },
  { id: 'morning-4', name: 'زنگ ۴', shift: 'صبح', startTime: '11:00', endTime: '11:45' },
  { id: 'morning-5', name: 'زنگ ۵', shift: 'صبح', startTime: '12:00', endTime: '12:45' },
  { id: 'morning-6', name: 'زنگ ۶', shift: 'صبح', startTime: '13:00', endTime: '13:45' },
  { id: 'afternoon-1', name: 'زنگ ۱', shift: 'عصر', startTime: '13:30', endTime: '14:15' },
  { id: 'afternoon-2', name: 'زنگ ۲', shift: 'عصر', startTime: '14:30', endTime: '15:15' },
  { id: 'afternoon-3', name: 'زنگ ۳', shift: 'عصر', startTime: '15:30', endTime: '16:15' },
  { id: 'afternoon-4', name: 'زنگ ۴', shift: 'عصر', startTime: '16:30', endTime: '17:15' },
  { id: 'afternoon-5', name: 'زنگ ۵', shift: 'عصر', startTime: '17:30', endTime: '18:15' },
  { id: 'afternoon-6', name: 'زنگ ۶', shift: 'عصر', startTime: '18:30', endTime: '19:15' }
];
const SHIFT_VALUES = new Set(['صبح', 'عصر', 'همه']);

function normalizeWeekday(value) {
  return String(value || '').normalize('NFKC').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[\s\u200c\u200f]/g, '');
}

function canonicalWeekday(value) {
  const normalized = normalizeWeekday(value);
  return WEEKDAYS.find((day) => normalizeWeekday(day) === normalized) || '';
}

function parseClock(value) {
  const match = latinDigits(value).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { minutes: hour * 60 + minute, value: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` };
}

function shiftKey(value) {
  const normalized = String(value || '').normalize('NFKC').replace(/[\u200c\u200f\s]/g, '').toLocaleLowerCase('fa');
  if (normalized === 'صبح' || normalized === 'morning') return 'صبح';
  if (normalized === 'عصر' || normalized === 'afternoon' || normalized === 'evening') return 'عصر';
  if (!normalized || normalized === 'همه' || normalized === 'all') return 'همه';
  return '';
}

function validateSchoolSchedule(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'تنظیمات زنگ‌های مدرسه معتبر نیست.' };
  const rawDays = input.schoolDays ?? DEFAULT_SCHOOL_DAYS;
  const rawPeriods = input.schoolPeriods ?? DEFAULT_SCHOOL_PERIODS;
  if (!Array.isArray(rawDays) || rawDays.length < 1 || rawDays.length > WEEKDAYS.length) return { error: 'حداقل یک روز آموزشی و حداکثر هفت روز انتخاب کنید.' };
  const schoolDays = rawDays.map(canonicalWeekday);
  if (schoolDays.some((day) => !day) || new Set(schoolDays).size !== schoolDays.length) return { error: 'روزهای آموزشی نامعتبر یا تکراری هستند.' };
  if (!Array.isArray(rawPeriods) || rawPeriods.length < 1 || rawPeriods.length > 16) return { error: 'تعداد زنگ‌ها باید بین ۱ تا ۱۶ باشد.' };

  const ids = new Set();
  const normalizedPeriods = [];
  for (let index = 0; index < rawPeriods.length; index += 1) {
    const item = rawPeriods[index];
    if (!item || typeof item !== 'object' || Array.isArray(item)) return { error: `اطلاعات زنگ ${index + 1} معتبر نیست.` };
    const id = String(item.id || `period-${index + 1}`).trim();
    const name = String(item.name || '').normalize('NFKC').trim().slice(0, 32);
    const shift = shiftKey(item.shift);
    const start = parseClock(item.startTime);
    const end = parseClock(item.endTime);
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(id) || ids.has(id)) return { error: 'شناسهٔ زنگ‌ها باید معتبر و یکتا باشد.' };
    if (!name) return { error: `نام زنگ ${index + 1} را وارد کنید.` };
    if (!shift) return { error: `نوبت زنگ «${name}» باید صبح، عصر یا همهٔ نوبت‌ها باشد.` };
    if (!start || !end || end.minutes <= start.minutes) return { error: `ساعت شروع و پایان «${name}» معتبر نیست؛ پایان باید بعد از شروع باشد.` };
    ids.add(id);
    normalizedPeriods.push({ id, name, shift, startTime: start.value, endTime: end.value, order: index + 1 });
  }

  for (let leftIndex = 0; leftIndex < normalizedPeriods.length; leftIndex += 1) {
    const left = normalizedPeriods[leftIndex];
    const leftStart = parseClock(left.startTime).minutes;
    const leftEnd = parseClock(left.endTime).minutes;
    for (const right of normalizedPeriods.slice(leftIndex + 1)) {
      if (left.shift !== 'همه' && right.shift !== 'همه' && left.shift !== right.shift) continue;
      const rightStart = parseClock(right.startTime).minutes;
      const rightEnd = parseClock(right.endTime).minutes;
      if (leftStart < rightEnd && rightStart < leftEnd) {
        return { error: `ساعت زنگ‌های «${left.name}» و «${right.name}» در نوبت مشترک هم‌پوشانی دارد.` };
      }
    }
  }

  return { value: { schoolDays, schoolPeriods: normalizedPeriods } };
}

function getSchoolSchedule(settings = {}) {
  const checked = validateSchoolSchedule({ schoolDays: settings.schoolDays, schoolPeriods: settings.schoolPeriods });
  if (checked.value) return checked.value;
  const fallback = validateSchoolSchedule({ schoolDays: DEFAULT_SCHOOL_DAYS, schoolPeriods: DEFAULT_SCHOOL_PERIODS });
  return fallback.value;
}

module.exports = {
  WEEKDAYS,
  DEFAULT_SCHOOL_DAYS,
  DEFAULT_SCHOOL_PERIODS,
  normalizeWeekday,
  canonicalWeekday,
  parseClock,
  shiftKey,
  validateSchoolSchedule,
  getSchoolSchedule
};
