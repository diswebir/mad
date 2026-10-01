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
const { BackupManager } = require('../src/lib/backupManager');
const { schoolDateISO, isISODate } = require('../src/lib/dates');

async function makeApiContext(directory) {
  const state = await createInitialState(true);
  state.settings.installed = true;
  const store = await openJsonStore(path.join(directory, 'state.json'), state);
  const ctx = { store, demoMode: false, sessions: new Map(), loginAttempts: new Map(), saveConfig: async () => undefined };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    handleApi(req, res, url, ctx).catch((error) => {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    });
  });
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
    try { data = await response.json(); } catch { /* empty response */ }
    return { response, data };
  };
  const login = async (username, password) => {
    const result = await request('', '/api/auth/login', { method: 'POST', body: { username, password } });
    assert.equal(result.response.status, 200);
    return result.response.headers.get('set-cookie').split(';')[0];
  };
  return {
    ctx, store, server, request, login,
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      await store.close();
    }
  };
}

test('برنامهٔ هفتگی تداخل زمانی را می‌بندد و ورود معلم به حضور سریع فقط کلاس‌های خودش را می‌بیند', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mad-workflows-'));
  const api = await makeApiContext(directory);
  try {
    const admin = await api.login('admin', 'admin123');
    const teacher = await api.login('ahmadi', 'teacher123');
    const student = await api.login('sara', 'student123');

    const collision = await api.request(admin, '/api/records/timetable', { method: 'POST', body: {
      day: 'شنبه', subject: 'زنگ متداخل', classId: 'cls-801', teacherId: 'tch-01', startTime: '۰۸:۳۰', endTime: '۰۹:۱۵', room: '۱۲'
    } });
    assert.equal(collision.response.status, 409, 'تداخل کلاس/معلم/اتاق باید از سمت سرور رد شود');
    const malformedTime = await api.request(admin, '/api/records/timetable', { method: 'POST', body: {
      day: 'شنبه', subject: 'ساعت نامعتبر', classId: 'cls-801', startTime: '۲۵:۰۰', endTime: '۲۶:۰۰'
    } });
    assert.equal(malformedTime.response.status, 400);

    const roster = await api.request(teacher, '/api/attendance/class/cls-801?date=2026-10-20');
    assert.equal(roster.response.status, 200);
    assert.deepEqual(roster.data.data.map((row) => row.id).sort(), ['std-1002', 'std-1005']);
    const forbiddenClass = await api.request(teacher, '/api/attendance/class/cls-902?date=2026-10-20');
    assert.equal(forbiddenClass.response.status, 403);
    const forbiddenStudentRoster = await api.request(student, '/api/attendance/class/cls-802?date=2026-10-20');
    assert.equal(forbiddenStudentRoster.response.status, 403);

    const bulk = await api.request(teacher, '/api/attendance/class/cls-801', { method: 'POST', body: { date: '2026-10-20', absentIds: ['std-1002'] } });
    assert.equal(bulk.response.status, 200, bulk.data.error || 'ثبت گروهی باید موفق باشد');
    assert.equal(bulk.data.data.total, 2);
    assert.equal(bulk.data.data.absent, 1);
    const afterFirstSave = await api.request(teacher, '/api/attendance/class/cls-801?date=2026-10-20');
    assert.equal(afterFirstSave.data.data.find((row) => row.id === 'std-1002').status, 'غایب');
    assert.equal(afterFirstSave.data.data.find((row) => row.id === 'std-1005').status, 'حاضر');
    const reset = await api.request(teacher, '/api/attendance/class/cls-801', { method: 'POST', body: { date: '2026-10-20', absentIds: [] } });
    assert.equal(reset.response.status, 200);
    const afterReset = await api.request(teacher, '/api/attendance/class/cls-801?date=2026-10-20');
    assert.equal(afterReset.data.data.find((row) => row.id === 'std-1002').status, 'حاضر', 'خاموش کردن سوییچر غیبت باید غیبت ثبت‌شده را به حاضر برگرداند');
    assert.equal((await api.store.read()).records.attendance.filter((row) => row.date === '2026-10-20').length, 2, 'ذخیرهٔ دوباره نباید رکورد تکراری بسازد');

    const singleRecordByOtherClass = await api.request(teacher, '/api/records/attendance', { method: 'POST', body: {
      studentId: 'std-1004', date: '2026-10-21', status: 'غایب'
    } });
    assert.equal(singleRecordByOtherClass.response.status, 403, 'مسیر ثبت تکی نیز باید کلاس دانش‌آموز را برای معلم محدود کند');

    const restricted = await api.request(admin, '/api/roles/teacher', { method: 'PATCH', body: {
      moduleIds: ['dashboard', 'students', 'classes'], readResources: ['students', 'classes'], writeResources: []
    } });
    assert.equal(restricted.response.status, 200, restricted.data.error || 'تنظیم سطح دسترسی باید ذخیره شود');
    const teacherBootstrap = await api.request(teacher, '/api/bootstrap');
    assert.ok(!teacherBootstrap.data.modules.some((module) => module.id === 'attendance'));
    const restrictedAttendance = await api.request(teacher, '/api/records/attendance');
    assert.equal(restrictedAttendance.response.status, 403, 'محدودیت نقش باید در خود API نیز اعمال شود');
    const invalidGrant = await api.request(admin, '/api/roles/teacher', { method: 'PATCH', body: {
      moduleIds: ['dashboard', 'finance'], readResources: ['finance'], writeResources: ['finance']
    } });
    assert.equal(invalidGrant.response.status, 400, 'نباید بتوان مجوز خارج از سطح پایهٔ امن نقش اعطا کرد');
  } finally {
    await api.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('پشتیبان JSON محدوددسترسی ساخته، قابل‌بازیابی و پیش از بازیابی نسخهٔ ایمنی می‌سازد', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mad-backup-'));
  const state = await createInitialState(true);
  state.settings.installed = true;
  const store = await openJsonStore(path.join(directory, 'state.json'), state);
  const manager = new BackupManager({ directory: path.join(directory, 'private-backups'), getStore: () => store, keep: 14 });
  try {
    const created = await manager.create('test');
    const stat = await fs.stat(path.join(directory, 'private-backups', created.filename));
    assert.equal(stat.mode & 0o777, 0o600, 'فایل پشتیبان باید مجوز خواندن/نوشتن مالک را داشته باشد');
    const envelope = await manager.read(created.filename);
    const originalName = envelope.state.records.students[0].name;
    await store.transact((draft) => { draft.records.students[0].name = 'تغییر آزمایشی'; });
    const safety = await manager.restore(envelope);
    assert.match(safety.filename, /^madresehyar-backup-/);
    assert.equal((await store.read()).records.students[0].name, originalName);
    assert.ok((await manager.list()).length >= 2, 'نسخهٔ اصلی و نسخهٔ ایمنی باید فهرست شوند');
    await assert.rejects(manager.restore({ format: 'wrong-format', formatVersion: 1, state: {} }), { statusCode: 400 });
    const roleEscalation = JSON.parse(JSON.stringify(envelope));
    roleEscalation.state.roles.push({ id: 'admin', name: 'نقش جعلی', isCustom: true, scope: 'school', moduleIds: ['dashboard'], readResources: [], writeResources: [] });
    await assert.rejects(manager.restore(roleEscalation), { statusCode: 400 }, 'بازیابی نباید اجازه دهد نقش سفارشی جای نقش مدیر را بگیرد');
  } finally {
    await store.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('تاریخ روز بر اساس منطقهٔ زمانی مدرسه محاسبه و تاریخ ISO نامعتبر رد می‌شود', () => {
  const instant = new Date('2026-10-01T21:00:00.000Z');
  assert.equal(schoolDateISO('UTC', instant), '2026-10-01');
  assert.equal(schoolDateISO('Asia/Tehran', instant), '2026-10-02');
  assert.equal(isISODate('2024-02-29'), true);
  assert.equal(isISODate('2025-02-29'), false);
});

test('نقش سفارشی می‌تواند با محدودهٔ کلاس به کاربر واگذار شود و دسترسی داده را در API محدود می‌کند', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mad-custom-role-'));
  const api = await makeApiContext(directory);
  try {
    const admin = await api.login('admin', 'admin123');
    const createdRole = await api.request(admin, '/api/roles', { method: 'POST', body: {
      name: 'معاون آزمایشی', description: 'پشتیبانی کلاس', scope: 'classes',
      moduleIds: ['dashboard', 'students', 'classes', 'attendance'],
      readResources: ['students', 'classes', 'attendance'], writeResources: ['attendance', 'classes']
    } });
    assert.equal(createdRole.response.status, 201, createdRole.data.error || 'ساخت نقش سفارشی باید موفق باشد');
    const roleId = createdRole.data.data.id;
    assert.match(roleId, /^custom-[a-f0-9]+$/);

    const account = await api.request(admin, '/api/records/users', { method: 'POST', body: {
      name: 'معاون کلاس ۸۰۱', username: 'deputy801', role: roleId, status: 'فعال', password: 'deputy-pass-123', classIds: ['cls-801']
    } });
    assert.equal(account.response.status, 201, account.data.error || 'ساخت حساب با نقش سفارشی باید موفق باشد');
    const deputy = await api.login('deputy801', 'deputy-pass-123');
    const bootstrap = await api.request(deputy, '/api/bootstrap');
    assert.equal(bootstrap.response.status, 200);
    assert.equal(bootstrap.data.user.roleName, 'معاون آزمایشی');
    assert.ok(bootstrap.data.modules.some((item) => item.id === 'attendance'));
    assert.ok(!bootstrap.data.modules.some((item) => item.id === 'finance'), 'ماژول واگذارنشده نباید در پنل/منو ظاهر شود');

    const visibleStudents = await api.request(deputy, '/api/records/students');
    assert.equal(visibleStudents.response.status, 200);
    assert.deepEqual(visibleStudents.data.data.map((row) => row.id).sort(), ['std-1002', 'std-1005']);
    const forbiddenClass = await api.request(deputy, '/api/attendance/class/cls-902?date=2026-10-22');
    assert.equal(forbiddenClass.response.status, 403);
    const attendance = await api.request(deputy, '/api/attendance/class/cls-801', { method: 'POST', body: { date: '2026-10-22', absentIds: ['std-1002'] } });
    assert.equal(attendance.response.status, 200, attendance.data.error || 'نقش دارای مجوز باید در کلاس واگذارشده حضور ثبت کند');
    const crossClassEdit = await api.request(deputy, '/api/records/classes/cls-902', { method: 'PATCH', body: { room: 'اتاق غیرمجاز' } });
    assert.equal(crossClassEdit.response.status, 404, 'ویرایش مستقیم شناسه نباید محدودهٔ کلاس نقش سفارشی را دور بزند');

    const noClass = await api.request(admin, '/api/records/users', { method: 'POST', body: {
      name: 'حساب بدون کلاس', username: 'deputy-no-class', role: roleId, status: 'فعال', password: 'deputy-pass-123', classIds: []
    } });
    assert.equal(noClass.response.status, 400, 'حساب با محدودهٔ کلاسی باید کلاس معتبر داشته باشد');
    const deleteInUse = await api.request(admin, `/api/roles/${roleId}`, { method: 'DELETE' });
    assert.equal(deleteInUse.response.status, 409, 'نقشی که به حساب‌ها واگذار شده حذف نمی‌شود');

    const revisedRole = await api.request(admin, `/api/roles/${roleId}`, { method: 'PATCH', body: {
      name: 'معاون محدود', description: 'مشاهده بدون ثبت', scope: 'classes',
      moduleIds: ['dashboard', 'students', 'classes', 'attendance'],
      readResources: ['students', 'classes', 'attendance'], writeResources: []
    } });
    assert.equal(revisedRole.response.status, 200);
    const readOnly = await api.request(deputy, '/api/attendance/class/cls-801', { method: 'POST', body: { date: '2026-10-22', absentIds: [] } });
    assert.equal(readOnly.response.status, 403, 'کاهش مجوز نقش باید فوراً در عملیات نوشتن اعمال شود');
  } finally {
    await api.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});


test('برنامهٔ نمونه پس از ممیزی با تداخل کلاس، دبیر یا اتاق شروع نمی‌شود', async () => {
  const state = await createInitialState(true);
  const digitMap = { '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9', '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };
  const minutes = (clock) => {
    const [hours, mins] = String(clock).replace(/[۰-۹٠-٩]/g, (digit) => digitMap[digit]).split(':').map(Number);
    return hours * 60 + mins;
  };
  const weekday = (value) => String(value).normalize('NFKC').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[\s\u200c\u200f]/g, '');
  const rows = state.records.timetable;
  const collisions = [];
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const left = rows[i];
      const right = rows[j];
      if (weekday(left.day) !== weekday(right.day)) continue;
      if (Math.max(minutes(left.startTime), minutes(right.startTime)) >= Math.min(minutes(left.endTime), minutes(right.endTime))) continue;
      if (left.classId === right.classId || left.teacherId === right.teacherId || left.room && left.room === right.room) collisions.push([left.id, right.id]);
    }
  }
  assert.deepEqual(collisions, []);
});

test('منطقهٔ زمانی مدرسه در تنظیمات API و نمودار هفتگی اعمال و تاریخ نامعتبر رد می‌شود', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mad-timezone-api-'));
  const api = await makeApiContext(directory);
  try {
    const admin = await api.login('admin', 'admin123');
    const invalidZone = await api.request(admin, '/api/settings', { method: 'PATCH', body: { timezone: 'Mars/Olympus' } });
    assert.equal(invalidZone.response.status, 400);
    const savedZone = await api.request(admin, '/api/settings', { method: 'PATCH', body: { timezone: 'UTC' } });
    assert.equal(savedZone.response.status, 200, savedZone.data.error || 'منطقهٔ زمانی معتبر باید ذخیره شود');
    const today = schoolDateISO('UTC');
    await api.store.transact((draft) => {
      draft.records.attendance = (draft.records.attendance || []).filter((entry) => entry.date !== today);
      draft.records.attendance.push(
        { id: 'timezone-present', studentId: 'std-1001', studentName: 'سارا محمدی', classId: 'cls-802', date: today, status: 'حاضر' },
        { id: 'timezone-absent', studentId: 'std-1002', studentName: 'آرش رضایی', classId: 'cls-801', date: today, status: 'غایب' }
      );
    });
    const bootstrap = await api.request(admin, '/api/bootstrap');
    const week = bootstrap.data.dashboard.weeklyAttendance;
    assert.equal(week.length, 7);
    assert.equal(week[6].date, today, 'نقطهٔ انتهایی نمودار باید روز مدرسه در timezone تنظیم‌شده باشد');
    assert.equal(week[6].count, 1, 'غایب نباید در شمار حضور هفتگی شمرده شود');
    const invalidRange = await api.request(admin, '/api/records/attendance?from=2026-02-30');
    assert.equal(invalidRange.response.status, 400);
  } finally {
    await api.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
