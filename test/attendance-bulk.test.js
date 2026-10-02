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

async function setup(directory) {
  const state = await createInitialState(true);
  state.settings.installed = true;
  const store = await openJsonStore(path.join(directory, 'state.json'), state);
  const ctx = { store, demoMode: false, sessions: new Map(), loginAttempts: new Map(), saveConfig: async () => undefined };
  const server = http.createServer((req, res) => handleApi(req, res, new URL(req.url, `http://${req.headers.host}`), ctx));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (cookie, route, body, method = body ? 'POST' : 'GET') => {
    const response = await fetch(`${base}${route}`, { method, headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    let data = {};
    try { data = await response.json(); } catch { /* empty body */ }
    return { response, data };
  };
  const loginResponse = await request('', '/api/auth/login', { username: 'ahmadi', password: 'teacher123' });
  assert.equal(loginResponse.response.status, 200);
  return { store, request, cookie: loginResponse.response.headers.get('set-cookie').split(';')[0], close: async () => { await new Promise((resolve) => server.close(resolve)); await store.close(); } };
}

test('ثبت گروهی وضعیت حاضر، غایب، تأخیر و مرخصی را مستقل می‌شمارد و اعتبارسنجی را اتمی نگه می‌دارد', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mad-attendance-bulk-'));
  const api = await setup(directory);
  try {
    const date = '2026-10-22';
    const complete = await api.request(api.cookie, '/api/attendance/class/cls-801', { date, statuses: [
      { studentId: 'std-1002', status: 'با تأخیر' },
      { studentId: 'std-1005', status: 'مرخصی' }
    ] });
    assert.equal(complete.response.status, 200, complete.data.error || 'ثبت وضعیت‌های گروهی باید موفق باشد');
    assert.deepEqual({ present: complete.data.data.present, late: complete.data.data.late, absent: complete.data.data.absent, leave: complete.data.data.leave }, { present: 0, late: 1, absent: 0, leave: 1 });
    const saved = (await api.store.read()).records.attendance.filter((entry) => entry.date === date);
    assert.deepEqual(saved.map((entry) => entry.status).sort(), ['با تأخیر', 'مرخصی']);
    assert.match(saved.find((entry) => entry.status === 'با تأخیر').time, /^\d{2}:\d{2}$/);
    assert.equal(saved.find((entry) => entry.status === 'مرخصی').time, '');

    const roster = await api.request(api.cookie, `/api/attendance/class/cls-801?date=${date}`);
    assert.deepEqual({ present: roster.data.summary.present, late: roster.data.summary.late, absent: roster.data.summary.absent, leave: roster.data.summary.leave, recorded: roster.data.summary.recorded }, { present: 0, late: 1, absent: 0, leave: 1, recorded: 2 });

    const missing = await api.request(api.cookie, '/api/attendance/class/cls-801', { date, statuses: [{ studentId: 'std-1002', status: 'غایب' }] });
    assert.equal(missing.response.status, 400, 'ارسال ناقص وضعیت‌ها نباید بقیهٔ دانش‌آموزان را بی‌صدا حاضر کند');
    const wrongStatus = await api.request(api.cookie, '/api/attendance/class/cls-801', { date, statuses: [
      { studentId: 'std-1002', status: 'نامعتبر' }, { studentId: 'std-1005', status: 'حاضر' }
    ] });
    assert.equal(wrongStatus.response.status, 400);
    const outsideClass = await api.request(api.cookie, '/api/attendance/class/cls-801', { date, statuses: [
      { studentId: 'std-1002', status: 'حاضر' }, { studentId: 'std-1004', status: 'غایب' }
    ] });
    assert.equal(outsideClass.response.status, 400);
    assert.deepEqual((await api.store.read()).records.attendance.filter((entry) => entry.date === date).map((entry) => entry.status).sort(), ['با تأخیر', 'مرخصی'], 'درخواست نامعتبر نباید وضعیت قبلی را تغییر دهد');

    const reset = await api.request(api.cookie, '/api/attendance/class/cls-801', { date, statuses: [
      { studentId: 'std-1002', status: 'حاضر' }, { studentId: 'std-1005', status: 'حاضر' }
    ] });
    assert.equal(reset.response.status, 200);
    assert.deepEqual(reset.data.data, { present: 2, late: 0, absent: 0, leave: 0, total: 2, recorded: 2, date, classId: 'cls-801' });
    assert.equal((await api.store.read()).records.attendance.filter((entry) => entry.date === date).length, 2, 'ثبت دوباره رکورد تکراری ایجاد نکند');

    const single = await api.request(api.cookie, '/api/records/attendance', { studentId: 'std-1002', date: '2026-10-23', status: 'حاضر', time: '۰۸:۱۲' });
    assert.equal(single.response.status, 201);
    assert.equal(single.data.data.time, '08:12', 'ساعت فارسی باید نرمال شود');
    const absent = await api.request(api.cookie, `/api/records/attendance/${single.data.data.id}`, { status: 'غایب' }, 'PATCH');
    assert.equal(absent.response.status, 200);
    assert.equal(absent.data.data.time, '', 'غیبت نباید ساعت ورود قبلی را نگه دارد');
    const invalidClock = await api.request(api.cookie, `/api/records/attendance/${single.data.data.id}`, { time: '۲۵:۰۰' }, 'PATCH');
    assert.equal(invalidClock.response.status, 400, 'ساعت نامعتبر باید در API رد شود');
    const late = await api.request(api.cookie, `/api/records/attendance/${single.data.data.id}`, { status: 'با تأخیر' }, 'PATCH');
    assert.equal(late.response.status, 200);
    assert.match(late.data.data.time, /^[0-9]{2}:[0-9]{2}$/, 'تأخیر بدون ساعت دستی باید ساعت ثبت‌شده داشته باشد');
    await api.store.transact((state) => {
      state.records.students.find((student) => student.id === 'std-1002').classId = 'cls-802';
    });
    const historicalEdit = await api.request(api.cookie, `/api/records/attendance/${single.data.data.id}`, { note: 'ثبت تاریخی پس از جابه‌جایی کلاس' }, 'PATCH');
    assert.equal(historicalEdit.response.status, 200, historicalEdit.data.error || 'ویرایش حضور تاریخی پس از انتقال کلاس باید ممکن باشد');
    assert.equal(historicalEdit.data.data.classId, 'cls-801', 'کلاس زمان ثبت حضور تاریخی باید حفظ شود');
  } finally {
    await api.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
