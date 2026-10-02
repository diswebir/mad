'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeState } = require('../server');
const {
  DEFAULT_SCHOOL_DAYS,
  DEFAULT_SCHOOL_PERIODS,
  canonicalWeekday,
  parseClock,
  validateSchoolSchedule
} = require('../src/lib/timetable');

test('زمان‌بندی پیش‌فرض روزهای آموزشی و زنگ‌های دو نوبت را به‌شکل معتبر فراهم می‌کند', () => {
  const result = validateSchoolSchedule({});
  assert.equal(result.error, undefined);
  assert.deepEqual(result.value.schoolDays, DEFAULT_SCHOOL_DAYS);
  assert.equal(result.value.schoolPeriods.length, 12);
  assert.equal(DEFAULT_SCHOOL_PERIODS.filter((period) => period.shift === 'صبح').length, 6);
  assert.equal(DEFAULT_SCHOOL_PERIODS.filter((period) => period.shift === 'عصر').length, 6);
  assert.equal(canonicalWeekday('سه شنبه'), 'سه‌شنبه');
  assert.deepEqual(parseClock('۸:۰۵'), { minutes: 485, value: '08:05' });
});

test('مهاجرت هنگام راه‌اندازی، تنظیمات پیش‌فرض و شناسهٔ زنگ‌های برنامه‌های قبلی را بازسازی می‌کند', () => {
  const legacy = normalizeState({
    settings: { academicYear: '۱۴۰۵–۱۴۰۶' },
    records: {
      classes: [{ id: 'legacy-class', name: 'کلاس قدیمی', grade: 'پایه هشتم' }],
      subjects: [{ id: 'legacy-math', name: 'ریاضی', grade: 'پایه هشتم' }],
      timetable: [{ id: 'old-1', day: 'سه شنبه', startTime: '۰۸:۰۰', endTime: '۰۸:۴۵', subject: 'ریاضی', classId: 'legacy-class' }]
    }
  });
  assert.deepEqual(legacy.settings.schoolDays, DEFAULT_SCHOOL_DAYS);
  assert.equal(legacy.records.timetable[0].day, 'سه‌شنبه');
  assert.equal(legacy.records.timetable[0].periodId, 'morning-1');
  assert.equal(legacy.records.timetable[0].periodName, 'زنگ ۱');
  assert.equal(legacy.records.timetable[0].academicYear, '۱۴۰۵–۱۴۰۶');
  assert.equal(legacy.records.timetable[0].subjectId, 'legacy-math', 'برنامهٔ قدیمی باید به شناسهٔ درس معتبر وصل شود');
});

test('تنظیم روز و زنگ تکراری، ساعت نامعتبر و هم‌پوشانی در یک نوبت را رد می‌کند', () => {
  assert.match(validateSchoolSchedule({ schoolDays: ['شنبه', 'شنبه'] }).error, /تکراری/);
  assert.match(validateSchoolSchedule({ schoolDays: ['روز نامعتبر'], schoolPeriods: DEFAULT_SCHOOL_PERIODS }).error, /نامعتبر/);
  assert.match(validateSchoolSchedule({ schoolPeriods: [
    { id: 'p1', name: 'اول', shift: 'صبح', startTime: '08:00', endTime: '09:00' },
    { id: 'p2', name: 'دوم', shift: 'صبح', startTime: '08:45', endTime: '09:30' }
  ] }).error, /هم‌پوشانی/);
  assert.match(validateSchoolSchedule({ schoolPeriods: [
    { id: 'same', name: 'اول', shift: 'صبح', startTime: '08:00', endTime: '08:45' },
    { id: 'same', name: 'دوم', shift: 'صبح', startTime: '09:00', endTime: '09:45' }
  ] }).error, /یکتا/);
});
