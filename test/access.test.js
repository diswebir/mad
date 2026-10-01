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

test('نقش‌ها به ماژول‌های خود دسترسی دارند و نوشتن خارج از سطح دسترسی رد می‌شود', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mad-access-'));
  const state = await createInitialState(true);
  state.settings.installed = true;
  state.records.students.push(...Array.from({ length: 105 }, (_, index) => ({
    id: `pagination-${index + 1}`, name: `دانش‌آموز صفحه‌بندی ${index + 1}`, studentNo: `PAGE-${index + 1}`,
    classId: 'cls-801', status: 'فعال', guardianName: 'ولی آزمایشی', guardianPhone: '09120000000'
  })));
  const initialTicketTotal = state.records.tickets.length;
  const initialFinanceTotal = state.records.finance.length;
  const initialFinancePaid = state.records.finance.filter((entry) => entry.status === 'پرداخت‌شده').length;
  const store = await openJsonStore(path.join(directory, 'state.json'), state);
  const ctx = { store, demoMode: false, sessions: new Map(), loginAttempts: new Map(), saveConfig: async () => undefined };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    handleApi(req, res, url, ctx).catch((error) => {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    });
  });

  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = async (cookie, route, { method = 'GET', body, extraHeaders = {} } = {}) => {
      const headers = { ...extraHeaders };
      if (cookie) headers.cookie = cookie;
      if (body !== undefined) headers['content-type'] = 'application/json';
      const response = await fetch(`${base}${route}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      let data = {};
      try { data = await response.json(); } catch { /* no response body */ }
      return { response, data };
    };
    const login = async (username, password) => {
      const { response, data } = await request('', '/api/auth/login', { method: 'POST', body: { username, password } });
      assert.equal(response.status, 200, `ورود حساب ${username} باید موفق باشد`);
      return response.headers.get('set-cookie').split(';')[0];
    };
    const accounts = {
      admin: await login('admin', 'admin123'),
      teacher: await login('ahmadi', 'teacher123'),
      student: await login('sara', 'student123'),
      parent: await login('maryam', 'parent123')
    };
    const previousDemoMode = ctx.demoMode;
    ctx.demoMode = true;
    let switchedSession;
    let switchedBootstrap;
    try {
      switchedSession = await request(accounts.admin, '/api/auth/login', { method: 'POST', body: { username: 'ahmadi', password: 'teacher123' } });
      assert.equal(switchedSession.response.status, 200, 'ورود سریع باید نشست قبلی را به حساب نمایشی انتخاب‌شده تغییر دهد');
      assert.match(switchedSession.data.demoSessionToken, /^[a-f0-9]{64}$/i, 'ورود دمو باید توکن نشست جایگزین کوکی ارائه کند');
      const demoSessionHeader = { 'x-demo-session': switchedSession.data.demoSessionToken };
      switchedBootstrap = await request('', '/api/bootstrap', { extraHeaders: demoSessionHeader });
      const staleCookieBootstrap = await request(accounts.admin, '/api/bootstrap', { extraHeaders: demoSessionHeader });
      assert.equal(staleCookieBootstrap.data.user.role, 'teacher', 'توکن نقش تازه باید بر نشست قدیمی مدیر اولویت داشته باشد');
      const demoLogout = await request('', '/api/auth/logout', { method: 'POST', extraHeaders: demoSessionHeader });
      assert.equal(demoLogout.response.status, 200, 'خروج باید نشست دمو را هم با توکن سرآیند باطل کند');
      const afterDemoLogout = await request('', '/api/bootstrap', { extraHeaders: demoSessionHeader });
      assert.equal(afterDemoLogout.data.user.role, 'admin', 'توکن دمو پس از خروج دیگر نباید نقش معلم را نگه دارد');
    } finally { ctx.demoMode = previousDemoMode; }
    assert.equal(switchedBootstrap.data.user.role, 'teacher', 'نشست دمو باید بدون وابستگی به cookie نقش انتخاب‌شده را برگرداند');
    assert.ok(switchedBootstrap.data.modules.length < (await request(accounts.admin, '/api/bootstrap')).data.modules.length, 'تعویض حساب باید فهرست ماژول‌های نقش را هم عوض کند');

    for (const [account, cookie] of Object.entries(accounts)) {
      const { data: bootstrap } = await request(cookie, '/api/bootstrap');
      assert.ok(bootstrap.user, `کاربر ${account} باید bootstrap داشته باشد`);
      const modules = bootstrap.modules;
      assert.ok(modules.some((module) => module.id === 'dashboard'), `داشبورد باید برای ${account} در دسترس باشد`);
      if (account === 'admin') {
        assert.equal(bootstrap.dashboard.counts.ticketTotal, initialTicketTotal, 'گزارش داشبورد باید کل تیکت‌ها را مستقل از محدودیت صفحه دریافت کند');
        assert.equal(bootstrap.dashboard.counts.financeTotal, initialFinanceTotal, 'گزارش مالی باید کل رکوردها را محاسبه کند');
        assert.equal(bootstrap.dashboard.counts.financePaid, initialFinancePaid, 'گزارش باید پرداخت‌های موفق را کامل محاسبه کند');
        assert.ok(bootstrap.dashboard.classDistribution.every((row) => Object.hasOwn(row, 'capacity')), 'گزارش کلاس باید ظرفیت را همراه توزیع برگرداند');
      }
      for (const module of modules) {
        if (module.id === 'dashboard') continue;
        const route = module.id === 'settings' ? '/api/settings' : `/api/records/${module.id}?limit=100`;
        const { response, data } = await request(cookie, route);
        assert.equal(response.status, 200, `ماژول ${module.id} برای نقش ${bootstrap.user.role} باید بارگذاری شود`);
        if (account === 'admin' && module.id === 'timetable') {
          const scheduledClasses = new Set(data.data.map((entry) => entry.classId));
          assert.ok(['cls-801', 'cls-802', 'cls-901', 'cls-902'].every((id) => scheduledClasses.has(id)), 'تقویم نمونه باید از هر چهار کلاس پایه‌های موجود برنامه داشته باشد');
          assert.ok(data.data.every((entry) => entry.startTime && entry.endTime), 'ساعت شروع و پایان هر زنگ باید ثبت شده باشد');
        }
      }
    }

    const { data: teacherMessages } = await request(accounts.teacher, '/api/records/messages');
    assert.ok(teacherMessages.data.length, 'معلم باید سوابق پیام‌رسانی مجاز را ببیند');
    const teacherClasses = await request(accounts.teacher, '/api/records/classes', { method: 'POST', body: { name: 'کلاس غیرمجاز', grade: 'پایه هشتم' } });
    assert.equal(teacherClasses.response.status, 403, 'معلم نباید کلاس ایجاد کند');
    const teacherAssignment = await request(accounts.teacher, '/api/records/assignments', { method: 'POST', body: { title: 'تکلیف آزمون', subject: 'ریاضی', classId: 'cls-801' } });
    assert.equal(teacherAssignment.response.status, 201, 'معلم باید بتواند برای کلاس خودش تکلیف ثبت کند');
    const teacherAttendance = await request(accounts.teacher, '/api/records/attendance', { method: 'POST', body: { studentId: 'std-1002', studentName: 'نام جعلی', classId: 'cls-801', date: '2026-10-02', status: 'حاضر' } });
    assert.equal(teacherAttendance.response.status, 201, 'ثبت حضور باید از فرم معلم ذخیره شود');
    assert.equal(teacherAttendance.data.data.studentName, 'آرش رضایی', 'نام دانش‌آموز باید از پرونده معتبر پر شود');
    const sameDayAttendance = await request(accounts.teacher, '/api/records/attendance', { method: 'POST', body: { studentId: 'std-1002', studentName: 'نام جعلی', classId: 'cls-801', date: '2026-10-02', status: 'با تأخیر' } });
    assert.equal(sameDayAttendance.response.status, 200, 'ثبت دوباره حضور همان روز باید رکورد موجود را به‌روزرسانی کند');
    const teacherGrade = await request(accounts.teacher, '/api/records/grades', { method: 'POST', body: { studentId: 'std-1002', studentName: 'نام جعلی', classId: 'cls-801', subject: 'ریاضی', exam: 'ارزشیابی آزمایشی', score: 18, maxScore: 20 } });
    assert.equal(teacherGrade.response.status, 201, 'معلم باید بتواند برای کلاس خودش نمره ثبت کند');
    const invalidGrade = await request(accounts.teacher, '/api/records/grades', { method: 'POST', body: { studentId: 'std-1002', studentName: 'آرش رضایی', classId: 'cls-801', subject: 'ریاضی', exam: 'نمره نامعتبر', score: 22, maxScore: 20 } });
    assert.equal(invalidGrade.response.status, 400, 'نمره نباید از نمره کل بیشتر باشد');
    const financeCreate = await request(accounts.admin, '/api/records/finance', { method: 'POST', body: { studentId: 'std-1001', studentName: 'نام جعلی', title: 'قسط آزمایشی', amount: 1000 } });
    assert.equal(financeCreate.response.status, 201, 'ثبت مالی از فرم مدیر باید ذخیره شود');
    assert.equal(financeCreate.data.data.studentName, 'سارا محمدی', 'نام مالی باید از پرونده دانش‌آموز استخراج شود');
    const financeUpdate = await request(accounts.admin, `/api/records/finance/${financeCreate.data.data.id}`, { method: 'PATCH', body: { studentId: 'std-1001', studentName: 'نام جعلی', amount: 1500 } });
    assert.equal(financeUpdate.response.status, 200, 'ویرایش مالی باید پذیرفته شود');
    assert.equal(financeUpdate.data.data.studentName, 'سارا محمدی', 'ویرایش مالی نباید نام ساختگی را نگه دارد');
    const teacherGradeTamper = await request(accounts.teacher, '/api/records/grades/grd-03', { method: 'PATCH', body: { studentId: 'std-1004', classId: 'cls-901', score: 20 } });
    assert.equal(teacherGradeTamper.response.status, 403, 'معلم نباید پرونده نمره را به دانش‌آموز کلاس دیگر منتقل کند');

    const adminPageOne = await request(accounts.admin, '/api/records/students?limit=2&page=1');
    const adminPageTwo = await request(accounts.admin, '/api/records/students?limit=2&page=2');
    assert.equal(adminPageOne.data.data.length, 2, 'صفحه اول باید محدودیت درخواستی را رعایت کند');
    assert.equal(adminPageTwo.data.data.length, 2, 'صفحه بعد باید داده مستقل برگرداند');
    assert.notDeepEqual(adminPageOne.data.data.map((row) => row.id), adminPageTwo.data.data.map((row) => row.id), 'صفحه‌بندی نباید ردیف‌ها را تکرار کند');
    const largePageOne = await request(accounts.admin, '/api/records/students?limit=100&page=1');
    const largePageTwo = await request(accounts.admin, '/api/records/students?limit=100&page=2');
    assert.ok(largePageOne.data.total > 100, 'فهرست آزمون باید بیش از ۱۰۰ رکورد داشته باشد');
    assert.equal(largePageOne.data.data.length, 100, 'صفحه اول فهرست بزرگ باید دقیقاً ۱۰۰ رکورد داشته باشد');
    assert.equal(largePageTwo.data.data.length, largePageOne.data.total - 100, 'صفحه دوم باید تمام رکوردهای باقیمانده را برگرداند');
    assert.ok(!largePageOne.data.data.some((row) => largePageTwo.data.data.some((next) => next.id === row.id)), 'دو صفحه بزرگ نباید رکورد مشترک داشته باشند');
    const { data: studentRows } = await request(accounts.student, '/api/records/students');
    assert.deepEqual(studentRows.data.map((row) => row.id), ['std-1001'], 'دانش‌آموز فقط باید پرونده خودش را ببیند');
    const { data: studentTimetable } = await request(accounts.student, '/api/records/timetable');
    assert.ok(studentTimetable.data.length && studentTimetable.data.every((row) => row.classId === 'cls-802'), 'دانش‌آموز فقط باید برنامه کلاس خودش را ببیند');
    const { data: studentNotices } = await request(accounts.student, '/api/records/notices');
    assert.ok(studentNotices.data.every((notice) => !/اولیا|والد|سرپرست/.test(notice.audience || '')), 'اطلاعیه مختص اولیا نباید به دانش‌آموز نمایش داده شود');
    const parentTicket = await request(accounts.parent, '/api/records/tickets', { method: 'POST', body: { subject: 'پیگیری پرونده', firstMessage: 'لطفاً وضعیت پرونده را بررسی کنید.' } });
    assert.equal(parentTicket.response.status, 201, 'ولی باید بتواند برای فرزند خودش تیکت ثبت کند');
    const ticketId = parentTicket.data.data.id;
    const forbiddenTicketClose = await request(accounts.parent, `/api/records/tickets/${ticketId}`, { method: 'PATCH', body: { status: 'بسته' } });
    assert.equal(forbiddenTicketClose.response.status, 403, 'ولی نباید بتواند وضعیت تیکت را تغییر دهد');
    const reply = await request(accounts.parent, `/api/records/tickets/${ticketId}`, { method: 'PATCH', body: { reply: 'سپاسگزارم' } });
    assert.equal(reply.response.status, 200, 'ولی باید بتواند در تیکت خودش پاسخ بفرستد');

    const adminCrudCases = {
      students: [{ name: 'دانش‌آموز آزمایشی', studentNo: 'T-100', classId: 'cls-801', guardianName: 'ولی آزمایشی', guardianPhone: '09120000000' }, { name: 'name', value: 'دانش‌آموز ویرایش‌شده' }],
      teachers: [{ name: 'معلم آزمایشی', teacherNo: 'TCH-100', subject: 'علوم', phone: '09120000001', classIds: [] }, { name: 'phone', value: '09120000002' }],
      classes: [{ name: 'کلاس آزمایشی', grade: 'پایه هفتم', capacity: 35, studentCount: 0 }, { name: 'room', value: 'آزمایشگاه' }],
      parents: [{ name: 'ولی آزمایشی', phone: '09120000003', studentIds: ['std-1001'] }, { name: 'email', value: 'parent@example.test' }],
      attendance: [{ studentId: 'std-1001', studentName: 'نام ساختگی', classId: 'cls-802', date: '2026-10-04', status: 'حاضر' }, { name: 'status', value: 'غایب' }],
      subjects: [{ name: 'درس آزمایشی', grade: 'پایه هشتم' }, { name: 'code', value: 'SUB-100' }],
      timetable: [{ day: 'شنبه', subject: 'علوم', classId: 'cls-802', startTime: '۱۱:۰۰', endTime: '۱۱:۴۵' }, { name: 'room', value: '۲۰۲' }],
      assignments: [{ title: 'تکلیف آزمایشی', subject: 'علوم', classId: 'cls-802' }, { name: 'description', value: 'شرح جدید' }],
      exams: [{ title: 'آزمون آزمایشی', subject: 'علوم', classId: 'cls-802', date: '2026-10-05' }, { name: 'room', value: '۲۰۲' }],
      grades: [{ studentId: 'std-1001', studentName: 'نام ساختگی', classId: 'cls-802', subject: 'علوم', exam: 'آزمون آزمایشی', score: 17, maxScore: 20 }, { name: 'score', value: 18 }],
      tickets: [{ subject: 'تیکت آزمایشی', firstMessage: 'درخواست آزمایشی', studentId: 'std-1001' }, { name: 'reply', value: 'پاسخ آزمایشی' }],
      notices: [{ title: 'اطلاعیه آزمایشی', audience: 'همه', body: 'متن آزمایشی' }, { name: 'category', value: 'مهم' }],
      events: [{ title: 'رویداد آزمایشی', date: '2026-10-06', audience: 'همه' }, { name: 'location', value: 'سالن' }],
      messages: [{ title: 'پیام آزمایشی', to: 'همه', channel: 'اعلان پنل' }, { name: 'status', value: 'ارسال‌شده' }],
      finance: [{ studentId: 'std-1001', studentName: 'نام ساختگی', title: 'پرداخت آزمایشی', amount: 2500 }, { name: 'amount', value: 3000 }],
      library: [{ title: 'کتاب آزمایشی', copies: 3, available: 2 }, { name: 'available', value: 1 }],
      transport: [{ route: 'مسیر آزمایشی', driver: 'راننده آزمایشی', students: 10 }, { name: 'departure', value: '۰۸:۰۰' }],
      documents: [{ title: 'سند آزمایشی', audience: 'همه', fileType: 'PDF' }, { name: 'category', value: 'راهنما' }]
    };
    for (const [resource, [payload, update]] of Object.entries(adminCrudCases)) {
      const created = await request(accounts.admin, `/api/records/${resource}`, { method: 'POST', body: payload });
      assert.equal(created.response.status, 201, `مدیر باید بتواند در ${resource} رکورد بسازد: ${created.data.error || ''}`);
      const id = created.data.data.id;
      assert.ok(id, `رکورد ${resource} باید شناسه داشته باشد`);
      if (['attendance', 'grades', 'finance'].includes(resource)) assert.equal(created.data.data.studentName, 'سارا محمدی', `نام مرتبط در ${resource} باید از پرونده گرفته شود`);
      const updated = await request(accounts.admin, `/api/records/${resource}/${encodeURIComponent(id)}`, { method: 'PATCH', body: { [update.name]: update.value } });
      assert.equal(updated.response.status, 200, `مدیر باید بتواند رکورد ${resource} را ویرایش کند: ${updated.data.error || ''}`);
    }

    const parentAccount = await request(accounts.admin, '/api/records/users', { method: 'POST', body: {
      name: 'ولی آزمایشی', username: 'linked-parent', role: 'parent', parentId: 'par-02', password: 'strong-pass-123'
    } });
    assert.equal(parentAccount.response.status, 201, 'ساخت حساب ولی باید پرونده مرتبط را بپذیرد');
    const linkedParentCookie = await login('linked-parent', 'strong-pass-123');
    const { data: linkedChildren } = await request(linkedParentCookie, '/api/records/students');
    assert.deepEqual(linkedChildren.data.map((row) => row.id), ['std-1002'], 'حساب ولی باید دانش‌آموزان پرونده والد را ببیند');

    const dbProbeAfterInstall = await request(accounts.admin, '/api/install/test-db', { method: 'POST', body: { host: '127.0.0.1', database: 'not-used', user: 'not-used' } });
    assert.equal(dbProbeAfterInstall.response.status, 409, 'آزمون اتصال دیتابیس پس از نصب نباید در دسترس بماند');
    const ownAdminEdit = await request(accounts.admin, '/api/records/users/usr-demo-admin', { method: 'PATCH', body: { status: 'غیرفعال' } });
    assert.equal(ownAdminEdit.response.status, 409, 'مدیر نباید بتواند حساب فعال خودش را غیرفعال کند');
    const forbiddenStudentUsers = await request(accounts.student, '/api/records/users');
    assert.equal(forbiddenStudentUsers.response.status, 403, 'دانش‌آموز نباید به مدیریت کاربران دسترسی داشته باشد');

    const deleteActiveClass = await request(accounts.admin, '/api/records/classes/cls-801', { method: 'DELETE' });
    assert.equal(deleteActiveClass.response.status, 409, 'کلاس دارای دانش‌آموز نباید حذف و پرونده‌ها یتیم شوند');
    const disableCore = await request(accounts.admin, '/api/modules/classes', { method: 'PATCH', body: { enabled: false } });
    assert.equal(disableCore.response.status, 400, 'ماژول زیربنایی کلاس‌ها نباید خاموش شود و فرم‌های وابسته را خراب کند');
    const disabled = await request(accounts.admin, '/api/modules/documents', { method: 'PATCH', body: { enabled: false } });
    assert.equal(disabled.response.status, 200, 'مدیر باید بتواند ماژول را خاموش کند');
    const blockedDisabledModule = await request(accounts.student, '/api/records/documents');
    assert.equal(blockedDisabledModule.response.status, 403, 'ماژول خاموش نباید از API قابل استفاده باشد');
    const enabled = await request(accounts.admin, '/api/modules/documents', { method: 'PATCH', body: { enabled: true } });
    assert.equal(enabled.response.status, 200, 'مدیر باید بتواند ماژول را دوباره روشن کند');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await store.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
