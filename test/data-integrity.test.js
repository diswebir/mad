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
    const response = await fetch(`${base}${route}`, {
      method,
      headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    let data = {};
    try { data = await response.json(); } catch { /* empty response */ }
    return { response, data };
  };
  const loginUser = async (username, password) => {
    const result = await request('', '/api/auth/login', { username, password });
    return { response: result.response, data: result.data, cookie: result.response.headers.get('set-cookie')?.split(';')[0] || '' };
  };
  const login = await loginUser('admin', 'admin123');
  assert.equal(login.response.status, 200);
  return {
    store,
    request,
    login: loginUser,
    cookie: login.cookie,
    close: async () => { await new Promise((resolve) => server.close(resolve)); await store.close(); }
  };
}

async function withApi(run) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mad-integrity-'));
  const api = await setup(directory);
  try { await run(api); }
  finally {
    await api.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
}

test('حذف دانش‌آموز پیوندهای ولی را پاک می‌کند و حساب ولیِ دارای فرزند دیگر را نگه می‌دارد', async () => withApi(async (api) => {
  const initialClassCount = (await api.store.read()).records.classes.find((classroom) => classroom.id === 'cls-802').studentCount;
  await api.store.transact((state) => {
    state.records.parents.find((parent) => parent.id === 'par-01').studentIds = ['std-1001', 'std-1002'];
  });
  const deleted = await api.request(api.cookie, '/api/records/students/std-1001', undefined, 'DELETE');
  assert.equal(deleted.response.status, 200, deleted.data.error || 'حذف دانش‌آموز باید انجام شود');

  const state = await api.store.read();
  assert.deepEqual(state.records.parents.find((parent) => parent.id === 'par-01').studentIds, ['std-1002']);
  const parentAccount = state.users.find((user) => user.parentId === 'par-01');
  assert.equal(parentAccount.status, 'فعال', 'حساب ولی دارای فرزند دیگر نباید غیرفعال شود');
  assert.equal(parentAccount.studentId, 'std-1002', 'پیوند پیش‌فرض ولی باید به فرزند باقی‌مانده منتقل شود');
  const studentAccount = state.users.find((user) => user.studentId === undefined && user.username === 'sara');
  assert.equal(studentAccount.status, 'غیرفعال', 'حساب دانش‌آموز حذف‌شده باید غیرفعال شود');
  assert.equal(state.records.classes.find((classroom) => classroom.id === 'cls-802').studentCount, initialClassCount - 1);
}));

test('ورودی‌های عددی شمارشی و نوبت کلاس در API به‌صورت معنایی اعتبارسنجی می‌شوند', async () => withApi(async (api) => {
  const decimalCapacity = await api.request(api.cookie, '/api/records/classes', { name: 'کلاس کسری', grade: 'پایه هشتم', capacity: 2.5 });
  assert.equal(decimalCapacity.response.status, 400, 'ظرفیت کلاس باید عدد صحیح باشد');
  const persianCapacity = await api.request(api.cookie, '/api/records/classes', { name: 'کلاس ظرفیت فارسی', grade: 'پایه هشتم', capacity: '۳۵' });
  assert.equal(persianCapacity.response.status, 201, 'رقم‌های فارسی باید در ورودی عددی پذیرفته شوند');
  assert.equal(persianCapacity.data.data.capacity, 35);
  const zeroMaximum = await api.request(api.cookie, '/api/records/grades', {
    studentId: 'std-1001', subject: 'ریاضی', exam: 'آزمون صفر', score: 0, maxScore: 0
  });
  assert.equal(zeroMaximum.response.status, 400, 'حداکثر نمره باید بزرگ‌تر از صفر باشد');
  const defaultMaximum = await api.request(api.cookie, '/api/records/grades', {
    studentId: 'std-1001', subject: 'ریاضی', exam: 'آزمون با سقف پیش‌فرض', score: 17
  });
  assert.equal(defaultMaximum.response.status, 201, defaultMaximum.data.error || 'حداکثر نمرهٔ پیش‌فرض باید قابل استفاده باشد');
  assert.equal(defaultMaximum.data.data.maxScore, 20);
  const invalidShift = await api.request(api.cookie, '/api/records/classes', { name: 'کلاس نوبت نامعتبر', grade: 'پایه هشتم', shift: 'شب' });
  assert.equal(invalidShift.response.status, 400, 'نوبت ناشناخته نباید ذخیره شود');
  const manualCount = await api.request(api.cookie, '/api/records/classes', { name: 'کلاس با شمارش دستی', grade: 'پایه هشتم', capacity: 20, studentCount: 19 });
  assert.equal(manualCount.response.status, 400, 'تعداد دانش‌آموز باید از پرونده‌های مرتبط محاسبه شود، نه از ورودی مدیر');
  const created = await api.request(api.cookie, '/api/records/classes', { name: 'کلاس صبح', grade: 'پایه هشتم', capacity: 20, shift: 'morning' });
  assert.equal(created.response.status, 201, created.data.error || 'نوبت شناخته‌شده باید پذیرفته شود');
  assert.equal(created.data.data.shift, 'صبح', 'نوبت‌های معادل باید به برچسب فارسی استاندارد شوند');
  assert.equal(created.data.data.studentCount, 0, 'کلاس تازه باید از شمارش واقعی روابط دانش‌آموزی شروع شود');
  const inactiveClass = await api.request(api.cookie, '/api/records/classes', { name: 'کلاس غیرفعال', grade: 'پایه هشتم', capacity: 5, status: 'غیرفعال' });
  assert.equal(inactiveClass.response.status, 201);
  const enrollment = await api.request(api.cookie, '/api/records/students', {
    name: 'دانش‌آموز کلاس غیرفعال', studentNo: 'INACTIVE-1', classId: inactiveClass.data.data.id,
    guardianName: 'ولی', guardianPhone: '09120000000'
  });
  assert.equal(enrollment.response.status, 409, 'کلاس غیرفعال نباید پذیرش دانش‌آموز جدید داشته باشد');
  const emptyOptionalNumber = await api.request(api.cookie, '/api/records/subjects/sub-01', { weeklyHours: '' }, 'PATCH');
  assert.equal(emptyOptionalNumber.response.status, 200, 'فیلد عددی اختیاری خالی باید به صفر تبدیل شود، نه رشتهٔ خالی');
  assert.equal(emptyOptionalNumber.data.data.weeklyHours, 0);
  const emptyRequiredNumber = await api.request(api.cookie, '/api/records/grades/grd-01', { score: '' }, 'PATCH');
  assert.equal(emptyRequiredNumber.response.status, 400, 'نمرهٔ الزامی خالی نباید به دادهٔ نامعتبر تبدیل شود');
}));

test('فهرست API ورودی صفحه‌بندی را به محدودهٔ صحیح محدود می‌کند', async () => withApi(async (api) => {
  const malformed = await api.request(api.cookie, '/api/records/students?page=Infinity&limit=1.5');
  assert.equal(malformed.response.status, 200);
  assert.equal(malformed.data.page, 1, 'صفحهٔ نامتناهی نباید به null در پاسخ تبدیل شود');
  assert.equal(malformed.data.limit, 1, 'اندازهٔ صفحه باید عدد صحیح باشد');
  assert.equal(malformed.data.data.length, 1);

  const tooLarge = await api.request(api.cookie, '/api/records/students?page=99999&limit=2');
  assert.equal(tooLarge.data.page, Math.ceil(tooLarge.data.total / 2), 'صفحهٔ خارج از محدوده باید به آخرین صفحه محدود شود');
}));

test('غیرفعال‌کردن پرونده حساب مرتبط و نشست ورود آن را فوراً باطل می‌کند', async () => withApi(async (api) => {
  const student = await api.login('sara', 'student123');
  assert.equal(student.response.status, 200);
  const profileUpdate = await api.request(api.cookie, '/api/records/students/std-1001', { address: 'نشانی تازه' }, 'PATCH');
  assert.equal(profileUpdate.response.status, 200);
  assert.equal((await api.request(student.cookie, '/api/auth/me')).data.user.role, 'student', 'به‌روزرسانی غیرامنیتی پروفایل نباید نشست را بی‌دلیل ببندد');
  const disabled = await api.request(api.cookie, '/api/records/students/std-1001', { status: 'غیرفعال' }, 'PATCH');
  assert.equal(disabled.response.status, 200, disabled.data.error || 'غیرفعال‌کردن پرونده باید موفق شود');
  const account = (await api.store.read()).users.find((user) => user.username === 'sara');
  assert.equal(account.status, 'غیرفعال');
  const oldSession = await api.request(student.cookie, '/api/auth/me');
  assert.equal(oldSession.data.user, null, 'نشست باز دانش‌آموز باید بلافاصله رد شود');
  const newLogin = await api.login('sara', 'student123');
  assert.equal(newLogin.response.status, 401, 'پرونده غیرفعال نباید اجازه ورود بدهد');

  const reactivated = await api.request(api.cookie, '/api/records/students/std-1001', { status: 'فعال' }, 'PATCH');
  assert.equal(reactivated.response.status, 200);
  assert.equal((await api.request(student.cookie, '/api/auth/me')).data.user, null, 'فعال‌سازی دوباره پرونده نباید نشست منقضی‌شده را زنده کند');
}));

test('تغییر پیوند دانش‌آموزان ولی دسترسی فرزند قبلی و نشست والد را لغو می‌کند', async () => withApi(async (api) => {
  const parent = await api.login('maryam', 'parent123');
  assert.equal(parent.response.status, 200);
  const linkedBefore = await api.request(parent.cookie, '/api/records/students');
  assert.deepEqual(linkedBefore.data.data.map((student) => student.id), ['std-1001']);

  const updated = await api.request(api.cookie, '/api/records/parents/par-01', { studentIds: ['std-1003'] }, 'PATCH');
  assert.equal(updated.response.status, 200, updated.data.error || 'تغییر پیوند والد باید موفق شود');
  const account = (await api.store.read()).users.find((user) => user.parentId === 'par-01');
  assert.equal(account.studentId, 'std-1003', 'شناسهٔ اصلی حساب والد باید با پروندهٔ معتبر همگام شود');
  assert.equal((await api.request(parent.cookie, '/api/auth/me')).data.user, null, 'تغییر دامنهٔ دسترسی باید نشست قبلی را باطل کند');
  const nextLogin = await api.login('maryam', 'parent123');
  assert.equal(nextLogin.response.status, 200, nextLogin.data.error || 'ولیِ دارای فرزند فعال باید بتواند دوباره وارد شود');
  const linkedAfter = await api.request(nextLogin.cookie, '/api/records/students');
  assert.deepEqual(linkedAfter.data.data.map((student) => student.id), ['std-1003']);
}));

test('اطلاعیهٔ پیش‌نویس یا زمان‌بندی‌شده برای نقش‌های غیرمدیر پنهان و مخاطب پایه‌ای دقیق است', async () => withApi(async (api) => {
  const teacher = await api.login('ahmadi', 'teacher123');
  const parent = await api.login('maryam', 'parent123');
  const draft = await api.request(api.cookie, '/api/records/notices', { title: 'پیش‌نویس داخلی', body: 'منتشر نشده', audience: 'همه' });
  assert.equal(draft.response.status, 201, draft.data.error || 'پیش‌نویس باید ذخیره شود');
  assert.equal(draft.data.data.status, 'پیش‌نویس', 'انتشار تصادفی نباید پیش‌فرض باشد');
  const scheduled = await api.request(api.cookie, '/api/records/notices', {
    title: 'اطلاعیهٔ آیندهٔ پایه هشتم', body: 'متن زمان‌بندی‌شده', audience: 'پایه هشتم',
    status: 'منتشرشده', publishDate: '۱۴۰۶/۰۱/۰۱'
  });
  assert.equal(scheduled.response.status, 201, scheduled.data.error || 'تاریخ شمسی معتبر باید پذیرفته شود');
  for (const cookie of [teacher.cookie, parent.cookie]) {
    const records = await api.request(cookie, '/api/records/notices');
    assert.ok(!records.data.data.some((item) => [draft.data.data.id, scheduled.data.data.id].includes(item.id)), 'پیش‌نویس و انتشار آینده نباید نمایش داده شوند');
  }

  const visible = await api.request(api.cookie, `/api/records/notices/${scheduled.data.data.id}`, { publishDate: '2020-01-01' }, 'PATCH');
  assert.equal(visible.response.status, 200);
  const [teacherNotices, parentNotices] = await Promise.all([
    api.request(teacher.cookie, '/api/records/notices'),
    api.request(parent.cookie, '/api/records/notices')
  ]);
  assert.ok(teacherNotices.data.data.some((item) => item.id === scheduled.data.data.id), 'معلم کلاس هشتم باید اطلاعیهٔ پایهٔ خود را ببیند');
  assert.ok(parentNotices.data.data.some((item) => item.id === scheduled.data.data.id), 'ولی دانش‌آموز پایهٔ هشتم باید اطلاعیه را ببیند');
  assert.ok(!parentNotices.data.data.some((item) => item.id === draft.data.data.id), 'پیش‌نویس برای ولی همچنان پنهان بماند');

  const parentOnly = await api.request(api.cookie, '/api/records/notices', {
    title: 'اطلاعیه اولیا', body: 'ویژه والدین', audience: 'اولیا', status: 'منتشرشده', publishDate: '2020-01-01'
  });
  assert.equal(parentOnly.response.status, 201);
  const teacherFinal = await api.request(teacher.cookie, '/api/records/notices');
  const parentFinal = await api.request(parent.cookie, '/api/records/notices');
  assert.ok(!teacherFinal.data.data.some((item) => item.id === parentOnly.data.data.id), 'محتوای ویژهٔ اولیا نباید به معلم برسد');
  assert.ok(parentFinal.data.data.some((item) => item.id === parentOnly.data.data.id));
}));
