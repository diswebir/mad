'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { createInitialState } = require('../src/data/seed');
const { openJsonStore } = require('../src/models/store');
const { handleApi } = require('../src/controllers/apiController');

async function makeApi(directory) {
  const state = await createInitialState(true);
  state.settings.installed = true;
  const store = await openJsonStore(path.join(directory, 'state.json'), state);
  const ctx = { store, demoMode: false, sessions: new Map(), loginAttempts: new Map(), saveConfig: async () => undefined };
  const server = http.createServer((req, res) => handleApi(req, res, new URL(req.url, `http://${req.headers.host}`), ctx));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (cookie, route, { method = 'GET', body } = {}) => {
    const response = await fetch(`${base}${route}`, {
      method,
      headers: { ...(cookie ? { cookie } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
    let data = {};
    try { data = await response.json(); } catch { /* empty body */ }
    return { response, data };
  };
  const login = async (username, password) => {
    const result = await request('', '/api/auth/login', { method: 'POST', body: { username, password } });
    assert.equal(result.response.status, 200);
    return result.response.headers.get('set-cookie').split(';')[0];
  };
  return {
    store, request, login,
    close: async () => { await new Promise((resolve) => server.close(resolve)); await store.close(); }
  };
}

test('برنامهٔ هفتگی از تنظیم ساعات مرکزی، دبیر/درس مستقل، سال تحصیلی و فیلترهای نقش‌محور پشتیبانی می‌کند', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mad-timetable-api-'));
  const api = await makeApi(directory);
  try {
    const admin = await api.login('admin', 'admin123');
    const teacher = await api.login('ahmadi', 'teacher123');
    const student = await api.login('sara', 'student123');
    const parent = await api.login('maryam', 'parent123');

    const settings = await api.request(admin, '/api/settings');
    assert.equal(settings.response.status, 200);
    assert.equal(settings.data.settings.schoolPeriods.length, 12);
    assert.deepEqual(settings.data.settings.schoolDays.slice(0, 2), ['شنبه', 'یکشنبه']);

    const invalidSchedule = await api.request(admin, '/api/settings', { method: 'PATCH', body: {
      schoolDays: ['شنبه', 'شنبه'], schoolPeriods: settings.data.settings.schoolPeriods
    } });
    assert.equal(invalidSchedule.response.status, 400, 'روز تکراری باید پیش از ذخیره رد شود');

    const newPeriods = settings.data.settings.schoolPeriods.map((period) => period.id === 'morning-3'
      ? { ...period, startTime: '10:15', endTime: '11:00' }
      : period);
    const savedSchedule = await api.request(admin, '/api/settings', { method: 'PATCH', body: {
      schoolDays: settings.data.settings.schoolDays, schoolPeriods: newPeriods
    } });
    assert.equal(savedSchedule.response.status, 200, savedSchedule.data.error || 'تنظیم برنامه باید ذخیره شود');
    const migratedEntry = (await api.store.read()).records.timetable.find((row) => row.id === 'tt-01');
    assert.equal(migratedEntry.startTime, '10:15', 'تغییر ساعت زنگ مرکزی باید به همهٔ برنامه‌های متصل منتقل شود');
    assert.equal(migratedEntry.endTime, '11:00');

    const newLesson = await api.request(admin, '/api/records/timetable', { method: 'POST', body: {
      academicYear: '۱۴۰۵–۱۴۰۶', day: 'شنبه', periodId: 'morning-4', subjectId: 'sub-04',
      classId: 'cls-802', teacherId: 'tch-04', room: '۱۴', startTime: '11:00', endTime: '11:45'
    } });
    assert.equal(newLesson.response.status, 201, newLesson.data.error || 'جلسهٔ تازهٔ کلاس باید ساخته شود');
    assert.equal(newLesson.data.data.subject, 'زبان انگلیسی');
    assert.equal(newLesson.data.data.teacherId, 'tch-04', 'دبیر این زنگ باید مستقل از دبیر زنگ‌های دیگر ذخیره شود');
    assert.equal(newLesson.data.data.periodName, 'زنگ ۴');
    assert.equal(newLesson.data.data.academicYear, '۱۴۰۵–۱۴۰۶');

    const classCollision = await api.request(admin, '/api/records/timetable', { method: 'POST', body: {
      academicYear: '۱۴۰۵–۱۴۰۶', day: 'شنبه', periodId: 'morning-4', subjectId: 'sub-01',
      classId: 'cls-802', teacherId: 'tch-01', room: '۱۵'
    } });
    assert.equal(classCollision.response.status, 409, 'دو درس برای یک کلاس در یک بازه نباید تداخل داشته باشند');

    const nextYearLesson = await api.request(admin, '/api/records/timetable', { method: 'POST', body: {
      academicYear: '۱۴۰۶–۱۴۰۷', day: 'شنبه', periodId: 'morning-4', subjectId: 'sub-01',
      classId: 'cls-802', teacherId: 'tch-01', room: '۱۴'
    } });
    assert.equal(nextYearLesson.response.status, 201, 'تداخل برنامهٔ سال تحصیلی دیگر نباید برنامهٔ سال جدید را مسدود کند');

    const latinYearLesson = await api.request(admin, '/api/records/timetable', { method: 'POST', body: {
      academicYear: '1405-1406', day: 'پنج‌شنبه', periodId: 'morning-5', subjectId: 'sub-01',
      classId: 'cls-801', teacherId: 'tch-01', room: '۱۲'
    } });
    assert.equal(latinYearLesson.response.status, 201, latinYearLesson.data.error || 'سال لاتین هم باید پذیرفته شود');
    const equivalentYearCollision = await api.request(admin, '/api/records/timetable', { method: 'POST', body: {
      academicYear: '۱۴۰۵–۱۴۰۶', day: 'پنج‌شنبه', periodId: 'morning-5', subjectId: 'sub-02',
      classId: 'cls-801', teacherId: 'tch-02', room: '۱۶'
    } });
    assert.equal(equivalentYearCollision.response.status, 409, 'اعداد فارسی/لاتین و خط تیرهٔ سال نباید راه دور زدن تداخل را باز کنند');
    const aliasYearFilter = await api.request(admin, '/api/records/timetable?classId=cls-801&day=پنجشنبه&academicYear=۱۴۰۵–۱۴۰۶');
    assert.ok(aliasYearFilter.data.data.some((row) => row.id === latinYearLesson.data.data.id), 'فیلتر سال باید قالب‌های معادل را یکسان بداند');
    const yearOptions = await api.request(admin, '/api/records/timetable');
    assert.deepEqual(yearOptions.data.academicYears, ['۱۴۰۶–۱۴۰۷', '۱۴۰۵–۱۴۰۶'], 'فهرست سال‌ها نباید قالب‌های معادل فارسی/لاتین را تکراری نشان دهد');

    const filtered = await api.request(admin, '/api/records/timetable?classId=cls-802&day=شنبه&academicYear=۱۴۰۵–۱۴۰۶');
    assert.equal(filtered.response.status, 200);
    assert.equal(filtered.data.data.length, 3, 'فیلتر کلاس/روز/سال باید دقیق اعمال شود');
    const teacherFiltered = await api.request(admin, '/api/records/timetable?teacherId=tch-04&day=شنبه&academicYear=۱۴۰۵–۱۴۰۶');
    assert.equal(teacherFiltered.data.data.length, 2, 'فیلتر دبیر باید جلسات متعدد همان دبیر را برگرداند');
    assert.ok(teacherFiltered.data.teacherOptions.some((item) => item.id === 'tch-04' && item.name));
    assert.ok(teacherFiltered.data.data.every((row) => row.teacherName), 'نام دبیر به‌صورت محدود و بدون افشای پروندهٔ کامل برای نمایش تقویم برگردد');
    assert.equal((await api.request(admin, '/api/records/timetable?day=روز-نامعتبر')).response.status, 400);

    const studentSchedule = await api.request(student, '/api/records/timetable?academicYear=۱۴۰۵–۱۴۰۶');
    assert.equal(studentSchedule.response.status, 200);
    assert.ok(studentSchedule.data.data.length > 0);
    assert.ok(studentSchedule.data.data.every((row) => row.classId === 'cls-802'), 'دانش‌آموز فقط برنامهٔ کلاس خود را ببیند');
    const parentSchedule = await api.request(parent, '/api/records/timetable?academicYear=۱۴۰۵–۱۴۰۶');
    assert.equal(parentSchedule.response.status, 200);
    assert.ok(parentSchedule.data.data.every((row) => row.classId === 'cls-802'), 'ولی فقط برنامهٔ کلاس فرزند خود را ببیند');
    const teacherSchedule = await api.request(teacher, '/api/records/timetable?teacherId=tch-04&academicYear=۱۴۰۵–۱۴۰۶');
    assert.equal(teacherSchedule.response.status, 200);
    assert.ok(teacherSchedule.data.data.every((row) => row.teacherId === 'tch-04'), 'فیلتر دبیر باید در نقش معلم نیز قابل اعمال باشد');
  } finally {
    await api.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
