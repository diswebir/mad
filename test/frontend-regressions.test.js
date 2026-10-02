'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const installHtml = fs.readFileSync(path.join(__dirname, '../public/install.html'), 'utf8');

test('انتخاب چندگانه به‌جای select بریده‌شده، چک‌باکس جست‌وجوپذیر و مناسب لمس دارد', () => {
  assert.doesNotMatch(app, /برای انتخاب چند مورد، کلید Ctrl را نگه دارید/);
  assert.doesNotMatch(app, /<select[^>]*multiple/i);
  assert.match(app, /data-multi-select-search/);
  assert.match(app, /data-selected-count/);
  assert.match(app, /data-multi-value/);
  assert.match(app, /data-multi-select-error/);
  assert.match(styles, /\.multi-select-options\s*\{[^}]*max-height:/s);
  assert.match(styles, /\.multi-select-option input\s*\{[^}]*appearance: auto/);
});

test('فرم‌ها برای برچسب‌های واقعی و نقش چندانتخابی، نام‌گذاری و اعتبارسنجی دارند', () => {
  assert.match(app, /id="\$\{id\}" name="\$\{esc\(field\.name\)\}"/);
  assert.match(app, /aria-labelledby="\$\{labelId\}"/);
  assert.match(app, /control\.dataset\.required === 'true'/);
  assert.match(app, /initializeMultiSelects\(recordForm\)/);
  assert.match(app, /بارگذاری گزینه‌های «\$\{names\}» ناموفق بود/);
});

test('ثبت سریع حضور چهار وضعیت مستقل دارد و خلاصهٔ هر وضعیت جداگانه به‌روزرسانی می‌شود', () => {
  assert.match(app, /data-attendance-status=/);
  assert.match(app, /status: state\.attendanceStatuses\.get\(student\.id\)/);
  assert.match(app, /attendance-late-count/);
  assert.match(app, /attendance-leave-count/);
  assert.match(app, /statuses: \(roster\.data \|\| \[\]\)\.map/);
  assert.match(styles, /\.attendance-status-select/);
});

test('مدیریت و فیلتر برنامهٔ هفتگی روز، زنگ، دبیر، کلاس و سال را از تنظیمات مرکزی می‌گیرد', () => {
  assert.match(app, /renderTimetableSettings\(settings\)/);
  assert.match(app, /id="timetable-settings-form"/);
  assert.match(app, /data-school-day/);
  assert.match(app, /data-period-start/);
  assert.match(app, /data-period-end/);
  assert.match(app, /id="timetable-filter-class"/);
  assert.match(app, /id="timetable-filter-teacher"/);
  assert.match(app, /id="timetable-filter-day"/);
  assert.match(app, /id="timetable-filter-year"/);
  assert.match(app, /payload\.periodName = period\.name/);
  assert.match(styles, /\.school-period-row\s*\{/);
  assert.match(styles, /\.timetable-filters\s*\{/);
});

test('دیالوگ‌ها برای صفحه‌خوان و صفحه‌کلید ایمن هستند و CSV محافظت می‌شود', () => {
  assert.match(app, /card\.setAttribute\('role', 'dialog'\)/);
  assert.match(app, /card\.setAttribute\('aria-modal', 'true'\)/);
  assert.match(app, /event\.key === 'Tab' && !modalLayer\.hidden/);
  assert.match(app, /returnFocus\.focus\(\{ preventScroll: true \}\)/);
  assert.match(app, /\^\[\\t\\r\\n \]\*\[=\+\\-@\]/);
  assert.match(app, /setTimeout\(\(\) => URL\.revokeObjectURL\(objectUrl\), 1000\)/);
});

test('رابط برای سیاست CSP به handler درون‌خطی وابسته نیست', () => {
  assert.doesNotMatch(app, /on(?:click|change|submit|load|error)\s*=\s*["']/i);
});

test('شماره نسخهٔ ورود و ویزارد با نسخهٔ جاری هماهنگ و فایل‌های فرانت‌اند cache-bust می‌شوند', () => {
  assert.match(indexHtml, /نسخه ۱\.۳\.۰/);
  assert.match(installHtml, /نسخه ۱\.۳\.۰/);
  assert.doesNotMatch(indexHtml + installHtml, /۱\.۲\.۰/);
  assert.match(indexHtml, /styles\.css\?v=20261002-9/);
  assert.match(indexHtml, /app\.js\?v=20261002-9/);
  assert.match(installHtml, /install\.js\?v=20261002-9/);
});

test('داده‌های وابسته و نتایج جست‌وجو هنگام خطا بی‌صدا گم نمی‌شوند', () => {
  assert.match(app, /async function ensureDisplaySourceData\(resource\)/);
  assert.match(app, /failedCount === resources\.length/);
  assert.match(app, /partialWarning/);
  assert.match(app, /result\.statuses \|\| data\.map/);
  assert.match(app, /loadRecords\(resource, true, 1, \{ q: id \}\)/);
  assert.match(app, /sessionGeneration !== state\.sessionGeneration/);
  assert.match(app, /if \(cacheable && sessionGeneration === state\.sessionGeneration\)/);
  assert.match(app, /const attendanceRateCount = Number\(counts\.present \|\| 0\) \+ Number\(counts\.late \|\| 0\) \+ Number\(counts\.absent \|\| 0\)/);
  assert.match(app, /score \/ maximum \* 20/);
  assert.match(app, /failedOptionalSources/);
  assert.match(app, /data-load-warning/);
  assert.match(styles, /\.search-partial-warning,.calendar-load-warning,.data-load-warning/);
});
