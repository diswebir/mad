'use strict';
(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const APP_VERSION = '1.1.0';
  let storedDemoSession = '';
  try { storedDemoSession = window.sessionStorage.getItem('mad-demo-session') || ''; } catch { /* session storage may be unavailable */ }
  const state = { user: null, settings: {}, modules: [], dashboard: {}, demoMode: false, appVersion: APP_VERSION, demoSessionToken: storedDemoSession, cache: {}, page: 'dashboard', search: '', statusFilter: '', openNavGroup: '', calendarYear: 0, calendarMonth: 0, calendarGrade: '', calendarSelectedDay: '', calendarData: { events: [], timetable: [], classes: [] }, attendanceClassId: '', attendanceDate: '', attendanceAbsentIds: new Set(), attendanceDirty: false, attendanceSearch: '', attendanceMode: 'quick' };
  function setDemoSessionToken(token) {
    state.demoSessionToken = typeof token === 'string' ? token : '';
    try {
      if (state.demoSessionToken) window.sessionStorage.setItem('mad-demo-session', state.demoSessionToken);
      else window.sessionStorage.removeItem('mad-demo-session');
    } catch { /* session storage may be unavailable */ }
  }
  const GROUP_ORDER = ['نمای کلی', 'مدرسه', 'آموزش', 'ارتباطات', 'امور اجرایی', 'مدیریت', 'سیستم'];
  const ROLE_NAMES = { admin: 'مدیر مدرسه', teacher: 'معلم', student: 'دانش‌آموز', parent: 'ولی دانش‌آموز' };
  const ROLE_READABLE = {
    teacher: ['students', 'classes', 'attendance', 'subjects', 'timetable', 'assignments', 'exams', 'grades', 'tickets', 'notices', 'events', 'messages', 'library', 'documents', 'parents', 'teachers'],
    student: ['students', 'classes', 'attendance', 'subjects', 'timetable', 'assignments', 'exams', 'grades', 'tickets', 'notices', 'events', 'library', 'documents', 'parents', 'finance', 'transport'],
    parent: ['students', 'classes', 'attendance', 'subjects', 'timetable', 'assignments', 'exams', 'grades', 'tickets', 'notices', 'events', 'documents', 'parents', 'finance', 'transport']
  };
  const ROLE_WRITABLE = {
    teacher: ['attendance', 'assignments', 'exams', 'grades', 'tickets', 'notices', 'messages', 'documents'],
    student: ['tickets'], parent: ['tickets']
  };
  const CUSTOM_ROLE_RESERVED_MODULES = new Set(['users', 'roles', 'audit', 'reports', 'settings', 'modules']);
  const CUSTOM_ROLE_WRITABLE = ['students', 'teachers', 'classes', 'parents', 'attendance', 'subjects', 'timetable', 'assignments', 'exams', 'grades', 'tickets', 'notices', 'events', 'messages', 'finance', 'library', 'transport', 'documents'];
  const CUSTOM_ROLE_CLASS_WRITABLE = ['students', 'classes', 'parents', 'attendance', 'subjects', 'timetable', 'assignments', 'exams', 'grades', 'tickets', 'finance'];
  const RESOURCE_NAMES = {
    students: 'دانش‌آموزان', teachers: 'معلمان', classes: 'کلاس‌ها', parents: 'اولیا', attendance: 'حضور و غیاب',
    subjects: 'درس‌ها', timetable: 'برنامه هفتگی', assignments: 'تکالیف', exams: 'آزمون‌ها', grades: 'نمرات و کارنامه',
    tickets: 'تیکت‌ها', notices: 'اطلاعیه‌ها', events: 'تقویم مدرسه', messages: 'پیام‌رسانی', finance: 'شهریه و مالی',
    library: 'کتابخانه', transport: 'سرویس مدرسه', documents: 'اسناد و فایل‌ها', reports: 'گزارش‌ها', users: 'کاربران',
    roles: 'نقش‌ها و دسترسی‌ها', audit: 'گزارش فعالیت‌ها', modules: 'مدیریت ماژول‌ها', settings: 'تنظیمات مدرسه'
  };
  const PAGE_META = {
    students: { title: 'دانش‌آموزان', singular: 'دانش‌آموز', icon: 'student', description: 'پرونده تحصیلی و مشخصات دانش‌آموزان مدرسه را مدیریت کنید.', primary: 'name', secondary: 'studentNo', columns: [{ key: 'name', label: 'نام دانش‌آموز', primary: true, secondary: 'studentNo' }, { key: 'classId', label: 'پایه و کلاس' }, { key: 'guardianName', label: 'ولی دانش‌آموز' }, { key: 'guardianPhone', label: 'شماره تماس ولی' }, { key: 'status', label: 'وضعیت' }] },
    teachers: { title: 'معلمان', singular: 'معلم', icon: 'teacher', description: 'کادر آموزشی، تخصص و کلاس‌های تحت مسئولیت هر معلم.', primary: 'name', secondary: 'teacherNo', columns: [{ key: 'name', label: 'نام معلم', primary: true, secondary: 'teacherNo' }, { key: 'subject', label: 'تخصص' }, { key: 'classIds', label: 'کلاس‌های واگذارشده' }, { key: 'phone', label: 'شماره تماس' }, { key: 'status', label: 'وضعیت' }] },
    classes: { title: 'کلاس‌ها', singular: 'کلاس', icon: 'classes', description: 'کلاس‌ها را بسازید، ظرفیت را تنظیم کنید و معلم مسئول را مشخص کنید.', primary: 'name', secondary: 'grade', columns: [{ key: 'name', label: 'کلاس', primary: true, secondary: 'grade' }, { key: 'teacherId', label: 'معلم مسئول' }, { key: 'studentCount', label: 'دانش‌آموزان' }, { key: 'room', label: 'اتاق' }, { key: 'shift', label: 'نوبت' }, { key: 'status', label: 'وضعیت' }] },
    parents: { title: 'اولیا', singular: 'ولی', icon: 'parents', description: 'اطلاعات تماس والدین و ارتباط آن‌ها با دانش‌آموزان.', primary: 'name', secondary: 'relation', columns: [{ key: 'name', label: 'نام ولی', primary: true, secondary: 'relation' }, { key: 'phone', label: 'شماره تماس' }, { key: 'email', label: 'ایمیل' }, { key: 'studentIds', label: 'دانش‌آموزان' }, { key: 'status', label: 'وضعیت' }] },
    attendance: { title: 'حضور و غیاب', singular: 'ثبت حضور', icon: 'attendance', description: 'ثبت و پیگیری حضور، تأخیر و غیبت دانش‌آموزان هر کلاس.', primary: 'studentName', secondary: 'date', columns: [{ key: 'studentName', label: 'دانش‌آموز', primary: true, secondary: 'studentId' }, { key: 'classId', label: 'کلاس' }, { key: 'date', label: 'تاریخ' }, { key: 'time', label: 'ساعت ورود' }, { key: 'status', label: 'وضعیت' }] },
    subjects: { title: 'درس‌ها', singular: 'درس', icon: 'subjects', description: 'درس‌های ارائه‌شده، پایه تحصیلی و ساعات آموزشی.', primary: 'name', secondary: 'code', columns: [{ key: 'name', label: 'نام درس', primary: true, secondary: 'code' }, { key: 'grade', label: 'پایه' }, { key: 'teacherId', label: 'معلم' }, { key: 'weeklyHours', label: 'ساعت هفتگی' }, { key: 'status', label: 'وضعیت' }] },
    timetable: { title: 'برنامه هفتگی', singular: 'زنگ', icon: 'timetable', description: 'برنامه هفتگی کلاس‌ها و دبیران را یکجا ببینید.', primary: 'subject', secondary: 'day', columns: [{ key: 'day', label: 'روز', primary: true, secondary: 'startTime' }, { key: 'startTime', label: 'ساعت شروع' }, { key: 'subject', label: 'درس' }, { key: 'classId', label: 'کلاس' }, { key: 'teacherId', label: 'معلم' }, { key: 'room', label: 'اتاق' }] },
    assignments: { title: 'تکالیف', singular: 'تکلیف', icon: 'assignments', description: 'تکلیف‌های هر کلاس و مهلت تحویل آن‌ها را مدیریت کنید.', primary: 'title', secondary: 'subject', columns: [{ key: 'title', label: 'عنوان تکلیف', primary: true, secondary: 'subject' }, { key: 'classId', label: 'کلاس' }, { key: 'dueDate', label: 'مهلت تحویل' }, { key: 'teacherId', label: 'معلم' }, { key: 'status', label: 'وضعیت' }] },
    exams: { title: 'آزمون‌ها', singular: 'آزمون', icon: 'exams', description: 'تقویم امتحان‌ها و ارزشیابی‌های پیش‌رو.', primary: 'title', secondary: 'subject', columns: [{ key: 'title', label: 'عنوان آزمون', primary: true, secondary: 'subject' }, { key: 'classId', label: 'کلاس' }, { key: 'date', label: 'تاریخ' }, { key: 'time', label: 'ساعت' }, { key: 'room', label: 'اتاق' }, { key: 'status', label: 'وضعیت' }] },
    grades: { title: 'نمرات و کارنامه', singular: 'نمره', icon: 'grades', description: 'نتایج ارزشیابی را ثبت کنید و روند تحصیلی را پیگیری کنید.', primary: 'studentName', secondary: 'subject', columns: [{ key: 'studentName', label: 'دانش‌آموز', primary: true, secondary: 'classId' }, { key: 'subject', label: 'درس' }, { key: 'exam', label: 'ارزشیابی' }, { key: 'score', label: 'نمره' }, { key: 'maxScore', label: 'از' }, { key: 'date', label: 'تاریخ' }] },
    tickets: { title: 'تیکت‌ها', singular: 'تیکت', icon: 'tickets', description: 'درخواست‌ها و گفت‌وگوهای مدرسه را پیگیری و پاسخ دهید.', primary: 'subject', secondary: 'studentName', columns: [{ key: 'subject', label: 'موضوع گفت‌وگو', primary: true, secondary: 'studentName' }, { key: 'category', label: 'دسته‌بندی' }, { key: 'priority', label: 'اولویت' }, { key: 'lastReplyAt', label: 'آخرین به‌روزرسانی' }, { key: 'status', label: 'وضعیت' }] },
    notices: { title: 'اطلاعیه‌ها', singular: 'اطلاعیه', icon: 'notices', description: 'خبرها و اعلان‌های مهم مدرسه را هدفمند منتشر کنید.', primary: 'title', secondary: 'category', columns: [{ key: 'title', label: 'عنوان اطلاعیه', primary: true, secondary: 'category' }, { key: 'audience', label: 'مخاطبان' }, { key: 'publishDate', label: 'تاریخ انتشار' }, { key: 'status', label: 'وضعیت' }] },
    events: { title: 'تقویم مدرسه', singular: 'رویداد', icon: 'events', description: 'جلسه‌ها، اردوها و مناسبت‌های مدرسه را برنامه‌ریزی کنید.', primary: 'title', secondary: 'category', columns: [{ key: 'title', label: 'عنوان رویداد', primary: true, secondary: 'category' }, { key: 'date', label: 'تاریخ' }, { key: 'time', label: 'ساعت' }, { key: 'location', label: 'مکان' }, { key: 'audience', label: 'مخاطبان' }] },
    messages: { title: 'پیام‌رسانی', singular: 'پیام', icon: 'messages', description: 'سوابق پیامک‌ها و اعلان‌های ارسال‌شده برای خانواده‌ها.', primary: 'title', secondary: 'channel', columns: [{ key: 'title', label: 'عنوان پیام', primary: true, secondary: 'channel' }, { key: 'to', label: 'گیرندگان' }, { key: 'sentAt', label: 'زمان ارسال' }, { key: 'status', label: 'وضعیت' }] },
    finance: { title: 'شهریه و مالی', singular: 'پرداخت', icon: 'finance', description: 'شهریه، اقساط و وضعیت پرداخت هر دانش‌آموز را پیگیری کنید.', primary: 'title', secondary: 'studentName', columns: [{ key: 'studentName', label: 'دانش‌آموز', primary: true, secondary: 'title' }, { key: 'amount', label: 'مبلغ' }, { key: 'dueDate', label: 'سررسید' }, { key: 'paidAt', label: 'تاریخ پرداخت' }, { key: 'method', label: 'روش پرداخت' }, { key: 'status', label: 'وضعیت' }] },
    library: { title: 'کتابخانه', singular: 'کتاب', icon: 'library', description: 'منابع کتابخانه، تعداد نسخه‌ها و وضعیت امانت را مدیریت کنید.', primary: 'title', secondary: 'author', columns: [{ key: 'title', label: 'عنوان کتاب', primary: true, secondary: 'author' }, { key: 'category', label: 'دسته‌بندی' }, { key: 'copies', label: 'نسخه‌ها' }, { key: 'available', label: 'موجود' }, { key: 'status', label: 'وضعیت' }] },
    transport: { title: 'سرویس مدرسه', singular: 'مسیر', icon: 'transport', description: 'مسیرها، رانندگان و ظرفیت سرویس‌های مدرسه.', primary: 'route', secondary: 'driver', columns: [{ key: 'route', label: 'مسیر سرویس', primary: true, secondary: 'vehicle' }, { key: 'driver', label: 'راننده' }, { key: 'phone', label: 'شماره تماس' }, { key: 'students', label: 'دانش‌آموزان' }, { key: 'departure', label: 'ساعت حرکت' }, { key: 'status', label: 'وضعیت' }] },
    documents: { title: 'اسناد و فایل‌ها', singular: 'سند', icon: 'documents', description: 'فرم‌ها، راهنماها و اسناد موردنیاز مدرسه را سامان دهید.', primary: 'title', secondary: 'category', columns: [{ key: 'title', label: 'عنوان سند', primary: true, secondary: 'fileType' }, { key: 'category', label: 'دسته‌بندی' }, { key: 'audience', label: 'مخاطبان' }, { key: 'updatedAt', label: 'آخرین به‌روزرسانی' }, { key: 'status', label: 'وضعیت' }] },
    users: { title: 'کاربران', singular: 'کاربر', icon: 'users', description: 'حساب‌های ورود مدیران، معلمان، دانش‌آموزان و اولیا.', primary: 'name', secondary: 'username', columns: [{ key: 'name', label: 'نام کاربر', primary: true, secondary: 'username' }, { key: 'role', label: 'نقش' }, { key: 'phone', label: 'شماره تماس' }, { key: 'createdAt', label: 'تاریخ ایجاد' }, { key: 'status', label: 'وضعیت' }] },
    roles: { title: 'نقش‌ها و دسترسی‌ها', singular: 'نقش', icon: 'roles', description: 'سطوح دسترسی پایه در سامانه را مشاهده کنید.', primary: 'name', secondary: 'description', columns: [{ key: 'name', label: 'نقش', primary: true, secondary: 'description' }, { key: 'users', label: 'تعداد حساب‌ها' }] },
    audit: { title: 'گزارش فعالیت‌ها', singular: 'فعالیت', icon: 'audit', description: 'تغییرات مهم انجام‌شده توسط کاربران سامانه.', primary: 'description', secondary: 'userName', columns: [{ key: 'userName', label: 'کاربر', primary: true, secondary: 'role' }, { key: 'action', label: 'عملیات' }, { key: 'resource', label: 'بخش' }, { key: 'description', label: 'جزئیات' }, { key: 'at', label: 'زمان' }] }
  };
  const FORM_FIELDS = {
    students: [
      { name: 'name', label: 'نام و نام خانوادگی', required: true }, { name: 'studentNo', label: 'شماره دانش‌آموزی', required: true },
      { name: 'classId', label: 'کلاس', type: 'select', source: 'classes', required: true }, { name: 'gender', label: 'جنسیت', type: 'select', options: ['دختر', 'پسر'] },
      { name: 'birthDate', label: 'تاریخ تولد', placeholder: 'مثلاً ۱۳۹۲/۰۴/۱۸' }, { name: 'phone', label: 'شماره تماس دانش‌آموز', type: 'tel' },
      { name: 'guardianName', label: 'نام ولی / سرپرست', required: true }, { name: 'guardianRelation', label: 'نسبت', type: 'select', options: ['مادر', 'پدر', 'سرپرست'] },
      { name: 'guardianPhone', label: 'شماره تماس ولی', type: 'tel', required: true }, { name: 'emergencyContact', label: 'شماره تماس اضطراری', type: 'tel' },
      { name: 'status', label: 'وضعیت پرونده', type: 'select', options: ['فعال', 'غیرفعال', 'در انتظار تکمیل'] },
      { name: 'address', label: 'نشانی محل سکونت', type: 'textarea', wide: true }, { name: 'healthNotes', label: 'نکات سلامت / توضیحات', type: 'textarea', wide: true },
      { name: 'accountUsername', label: 'نام کاربری پنل دانش‌آموز', placeholder: 'اختیاری · حروف انگلیسی', direction: 'ltr' }, { name: 'accountPassword', label: 'گذرواژه پنل دانش‌آموز', type: 'password', placeholder: 'حداقل ۸ نویسه' }
    ],
    teachers: [
      { name: 'name', label: 'نام و نام خانوادگی', required: true }, { name: 'teacherNo', label: 'کد پرسنلی', required: true },
      { name: 'subject', label: 'تخصص / درس', required: true }, { name: 'degree', label: 'مدرک تحصیلی' },
      { name: 'phone', label: 'شماره تماس', type: 'tel', required: true }, { name: 'email', label: 'ایمیل', type: 'email' },
      { name: 'classIds', label: 'کلاس‌های تحت مسئولیت', type: 'select-multiple', source: 'classes' }, { name: 'status', label: 'وضعیت', type: 'select', options: ['فعال', 'غیرفعال'] },
      { name: 'accountUsername', label: 'نام کاربری پنل معلم', direction: 'ltr', placeholder: 'اختیاری · حروف انگلیسی' }, { name: 'accountPassword', label: 'گذرواژه پنل معلم', type: 'password', placeholder: 'حداقل ۸ نویسه' }
    ],
    classes: [
      { name: 'name', label: 'نام کلاس', required: true }, { name: 'grade', label: 'پایه تحصیلی', type: 'select', options: ['پایه هفتم', 'پایه هشتم', 'پایه نهم', 'پایه دهم', 'پایه یازدهم', 'پایه دوازدهم'], required: true },
      { name: 'teacherId', label: 'معلم مسئول', type: 'select', source: 'teachers' }, { name: 'room', label: 'شماره اتاق' },
      { name: 'capacity', label: 'ظرفیت کلاس', type: 'number', required: true }, { name: 'studentCount', label: 'تعداد دانش‌آموز فعلی', type: 'number' },
      { name: 'shift', label: 'نوبت آموزشی', type: 'select', options: ['صبح', 'عصر'] }, { name: 'status', label: 'وضعیت', type: 'select', options: ['فعال', 'غیرفعال'] }
    ],
    parents: [
      { name: 'name', label: 'نام و نام خانوادگی', required: true }, { name: 'relation', label: 'نسبت', type: 'select', options: ['مادر', 'پدر', 'سرپرست'] },
      { name: 'phone', label: 'شماره تماس', type: 'tel', required: true }, { name: 'email', label: 'ایمیل', type: 'email' },
      { name: 'studentIds', label: 'دانش‌آموزان مرتبط', type: 'select-multiple', source: 'students' }, { name: 'status', label: 'وضعیت', type: 'select', options: ['فعال', 'غیرفعال'] }
    ],
    attendance: [
      { name: 'studentId', label: 'دانش‌آموز', type: 'select', source: 'students', required: true }, { name: 'classId', label: 'کلاس', type: 'select', source: 'classes', required: true },
      { name: 'date', label: 'تاریخ میلادی', type: 'date', required: true }, { name: 'time', label: 'ساعت ورود', placeholder: '۰۷:۴۵' },
      { name: 'status', label: 'وضعیت حضور', type: 'select', options: ['حاضر', 'غایب', 'با تأخیر', 'مرخصی'], required: true }, { name: 'note', label: 'توضیحات', type: 'textarea', wide: true }
    ],
    subjects: [
      { name: 'name', label: 'نام درس', required: true }, { name: 'code', label: 'کد درس' }, { name: 'grade', label: 'پایه', type: 'select', options: ['پایه هفتم', 'پایه هشتم', 'پایه نهم', 'پایه دهم', 'پایه یازدهم', 'پایه دوازدهم'] },
      { name: 'teacherId', label: 'معلم درس', type: 'select', source: 'teachers' }, { name: 'weeklyHours', label: 'ساعت در هفته', type: 'number' }, { name: 'status', label: 'وضعیت', type: 'select', options: ['فعال', 'غیرفعال'] }
    ],
    timetable: [
      { name: 'day', label: 'روز هفته', type: 'select', options: ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه'], required: true }, { name: 'subject', label: 'نام درس', required: true },
      { name: 'classId', label: 'کلاس', type: 'select', source: 'classes', required: true }, { name: 'teacherId', label: 'معلم', type: 'select', source: 'teachers' },
      { name: 'startTime', label: 'ساعت شروع', type: 'time', required: true }, { name: 'endTime', label: 'ساعت پایان', type: 'time', required: true }, { name: 'room', label: 'اتاق' }
    ],
    assignments: [
      { name: 'title', label: 'عنوان تکلیف', required: true }, { name: 'subject', label: 'درس', required: true }, { name: 'classId', label: 'کلاس', type: 'select', source: 'classes', required: true },
      { name: 'dueDate', label: 'مهلت تحویل' }, { name: 'status', label: 'وضعیت', type: 'select', options: ['در حال انجام', 'تحویل‌شده', 'بررسی‌شده'] },
      { name: 'description', label: 'شرح تکلیف', type: 'textarea', wide: true }
    ],
    exams: [
      { name: 'title', label: 'عنوان آزمون', required: true }, { name: 'subject', label: 'درس', required: true }, { name: 'classId', label: 'کلاس', type: 'select', source: 'classes', required: true },
      { name: 'date', label: 'تاریخ آزمون', required: true }, { name: 'time', label: 'ساعت' }, { name: 'room', label: 'اتاق' }, { name: 'status', label: 'وضعیت', type: 'select', options: ['برنامه‌ریزی‌شده', 'برگزارشده', 'لغوشده'] }
    ],
    grades: [
      { name: 'studentId', label: 'دانش‌آموز', type: 'select', source: 'students', required: true }, { name: 'classId', label: 'کلاس', type: 'select', source: 'classes' },
      { name: 'subject', label: 'درس', required: true }, { name: 'exam', label: 'عنوان ارزشیابی', required: true },
      { name: 'score', label: 'نمره کسب‌شده', type: 'number', required: true }, { name: 'maxScore', label: 'نمره از', type: 'number' }, { name: 'date', label: 'تاریخ' }
    ],
    tickets: [
      { name: 'subject', label: 'موضوع درخواست', required: true }, { name: 'category', label: 'دسته‌بندی', type: 'select', options: ['آموزشی', 'حضور و غیاب', 'مالی', 'مشاوره', 'پشتیبانی'] },
      { name: 'priority', label: 'اولویت', type: 'select', options: ['عادی', 'متوسط', 'بالا'] }, { name: 'studentId', label: 'دانش‌آموز مرتبط', type: 'select', source: 'students', adminOnly: true },
      { name: 'firstMessage', label: 'شرح درخواست', type: 'textarea', wide: true, required: true }
    ],
    notices: [
      { name: 'title', label: 'عنوان اطلاعیه', required: true }, { name: 'category', label: 'دسته‌بندی', type: 'select', options: ['اطلاعیه', 'مهم', 'جلسه', 'آموزشی'] },
      { name: 'audience', label: 'مخاطبان', type: 'select', options: ['همه', 'پایه هفتم', 'پایه هشتم', 'پایه نهم', 'اولیا', 'معلمان'] },
      { name: 'publishDate', label: 'تاریخ انتشار' }, { name: 'status', label: 'وضعیت', type: 'select', options: ['منتشرشده', 'پیش‌نویس'] },
      { name: 'body', label: 'متن اطلاعیه', type: 'textarea', wide: true, required: true }
    ],
    events: [
      { name: 'title', label: 'عنوان رویداد', required: true }, { name: 'category', label: 'نوع رویداد', type: 'select', options: ['جلسه', 'اردو', 'ورزشی', 'فرهنگی', 'تعطیلی'] },
      { name: 'date', label: 'تاریخ', required: true }, { name: 'time', label: 'ساعت' }, { name: 'location', label: 'مکان' },
      { name: 'audience', label: 'مخاطبان', type: 'select', options: ['همه', 'پایه هفتم', 'پایه هشتم', 'پایه نهم', 'اولیا', 'معلمان'] }
    ],
    messages: [
      { name: 'title', label: 'موضوع پیام', required: true }, { name: 'to', label: 'گیرندگان', required: true }, { name: 'channel', label: 'کانال', type: 'select', options: ['پیامک', 'اعلان پنل', 'ایمیل'] },
      { name: 'sentAt', label: 'تاریخ ارسال' }, { name: 'status', label: 'وضعیت', type: 'select', options: ['ارسال‌شده', 'در صف ارسال', 'ناموفق'] }
    ],
    finance: [
      { name: 'studentId', label: 'دانش‌آموز', type: 'select', source: 'students', required: true }, { name: 'title', label: 'عنوان پرداخت', required: true },
      { name: 'amount', label: 'مبلغ (تومان)', type: 'number', required: true }, { name: 'dueDate', label: 'سررسید' }, { name: 'paidAt', label: 'تاریخ پرداخت' },
      { name: 'status', label: 'وضعیت پرداخت', type: 'select', options: ['در انتظار پرداخت', 'پرداخت‌شده', 'سررسید گذشته'] }, { name: 'method', label: 'روش پرداخت' }
    ],
    library: [
      { name: 'title', label: 'عنوان کتاب', required: true }, { name: 'author', label: 'نویسنده' }, { name: 'category', label: 'دسته‌بندی', type: 'select', options: ['داستان', 'علمی', 'ادبیات', 'آموزشی', 'تاریخ'] },
      { name: 'copies', label: 'تعداد نسخه', type: 'number' }, { name: 'available', label: 'نسخه موجود', type: 'number' }, { name: 'status', label: 'وضعیت', type: 'select', options: ['موجود', 'امانت', 'خارج از دسترس'] }
    ],
    transport: [
      { name: 'route', label: 'نام مسیر', required: true }, { name: 'driver', label: 'نام راننده', required: true }, { name: 'phone', label: 'شماره راننده', type: 'tel' },
      { name: 'vehicle', label: 'نوع خودرو' }, { name: 'students', label: 'تعداد دانش‌آموز', type: 'number' }, { name: 'departure', label: 'ساعت حرکت' }, { name: 'status', label: 'وضعیت', type: 'select', options: ['فعال', 'غیرفعال'] }
    ],
    documents: [
      { name: 'title', label: 'عنوان سند', required: true }, { name: 'category', label: 'دسته‌بندی', type: 'select', options: ['راهنما', 'فرم', 'تقویم', 'آیین‌نامه', 'سایر'] },
      { name: 'audience', label: 'مخاطبان', type: 'select', options: ['همه', 'اولیا', 'معلمان', 'دانش‌آموزان'] }, { name: 'fileType', label: 'نوع فایل', type: 'select', options: ['PDF', 'DOCX', 'XLSX', 'تصویر'] },
      { name: 'updatedAt', label: 'تاریخ به‌روزرسانی' }, { name: 'status', label: 'وضعیت', type: 'select', options: ['منتشرشده', 'پیش‌نویس'] }
    ],
    users: [
      { name: 'name', label: 'نام و نام خانوادگی', required: true }, { name: 'username', label: 'نام کاربری', required: true, direction: 'ltr' },
      { name: 'role', label: 'نقش کاربری', type: 'select', source: 'roles', required: true },
      { name: 'phone', label: 'شماره تماس', type: 'tel' }, { name: 'password', label: 'گذرواژه اولیه', type: 'password', required: true, placeholder: 'حداقل ۸ نویسه' },
      { name: 'studentId', label: 'پرونده دانش‌آموز', type: 'select', source: 'students', adminOnly: true, roleAssociation: 'student' },
      { name: 'teacherId', label: 'پرونده معلم', type: 'select', source: 'teachers', adminOnly: true, roleAssociation: 'teacher' },
      { name: 'parentId', label: 'پرونده ولی', type: 'select', source: 'parents', adminOnly: true, roleAssociation: 'parent' },
      { name: 'classIds', label: 'کلاس‌های مجاز این حساب', type: 'select-multiple', source: 'classes', adminOnly: true, roleAssociation: 'custom' }
    ]
  };

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }
  function icon(name, size = 20, className = '') { return window.uiIcon(name, size, className); }
  function faNumber(value) { return new Intl.NumberFormat('fa-IR').format(Number(value || 0)); }
  function money(value) { return `${new Intl.NumberFormat('fa-IR').format(Number(value || 0))} تومان`; }
  function roleName(role) { return ROLE_NAMES[role] || (state.user?.role === role ? state.user?.roleName : '') || (state.cache.roles?.data || []).find((entry) => entry.id === role)?.name || (state.cache.users?.data || []).find((entry) => entry.role === role)?.roleName || role || '—'; }
  function firstGlyph(value) { return [...String(value || '؟')][0] || '؟'; }
  function className(id) { const rows = state.cache.classes?.data || []; return rows.find((item) => item.id === id)?.name || rows.find((item) => item.name === id)?.name || id || '—'; }
  function teacherName(id) { return (state.cache.teachers?.data || []).find((item) => item.id === id)?.name || id || '—'; }
  function studentName(id) { return (state.cache.students?.data || []).find((item) => item.id === id)?.name || id || '—'; }
  function fmtDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (!Number.isNaN(date.getTime()) && /^\d{4}-\d\d-\d\d/.test(value)) {
      const dateOnly = /^\d{4}-\d\d-\d\d$/.test(value);
      const stableDate = dateOnly ? new Date(`${value}T12:00:00.000Z`) : date;
      return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { day: 'numeric', month: 'short', timeZone: dateOnly ? 'UTC' : state.settings.timezone || 'Asia/Tehran' }).format(stableDate);
    }
    return String(value);
  }
  function fmtDateTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: state.settings.timezone || 'Asia/Tehran' }).format(date);
  }
  const PERSIAN_DATE_PARTS = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC' });
  const CALENDAR_DAY_NAMES = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
  const CALENDAR_WEEKDAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
  const PERSIAN_DAY_MS = 24 * 60 * 60 * 1000;
  const PERSIAN_MONTH_START_CACHE = new Map();
  function latinDigits(value) {
    return String(value ?? '').replace(/[۰-۹٠-٩]/g, (digit) => String(digit.charCodeAt(0) >= 0x06f0 ? digit.charCodeAt(0) - 0x06f0 : digit.charCodeAt(0) - 0x0660));
  }
  function schoolDateISO(date = new Date()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA-u-ca-gregory-nu-latn', {
      year: 'numeric', month: '2-digit', day: '2-digit', timeZone: state.settings.timezone || 'Asia/Tehran'
    }).formatToParts(date).map((part) => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  function persianParts(date) {
    const parts = Object.fromEntries(PERSIAN_DATE_PARTS.formatToParts(date).map((part) => [part.type, part.value]));
    const year = Number(parts.year), month = Number(parts.month), day = Number(parts.day);
    return { year, month, day, key: `${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}` };
  }
  function persianMonthStart(year, month) {
    const key = `${year}/${month}`;
    if (PERSIAN_MONTH_START_CACHE.has(key)) return new Date(PERSIAN_MONTH_START_CACHE.get(key));
    const searchStart = Date.UTC(year + 621, 2, 1);
    for (let offset = 0; offset <= 370; offset += 1) {
      const timestamp = searchStart + offset * PERSIAN_DAY_MS;
      const parts = persianParts(new Date(timestamp));
      if (parts.year === year && parts.month === month && parts.day === 1) {
        PERSIAN_MONTH_START_CACHE.set(key, timestamp);
        return new Date(timestamp);
      }
    }
    return null;
  }
  function persianMonthLength(year, month) {
    const first = persianMonthStart(year, month);
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    const next = persianMonthStart(nextYear, nextMonth);
    return first && next ? Math.round((next.getTime() - first.getTime()) / PERSIAN_DAY_MS) : 30;
  }
  function persianDateKey(value) {
    const match = latinDigits(value).trim().match(/^(\d{3,4})[/-](\d{1,2})[/-](\d{1,2})/);
    if (!match) return '';
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    if (year >= 1700) return persianParts(new Date(Date.UTC(year, month - 1, day))).key;
    if (month < 1 || month > 12 || day < 1 || day > 31) return '';
    return `${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
  }
  function persianDateFromKey(key) {
    const match = String(key || '').match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
    if (!match) return null;
    const first = persianMonthStart(Number(match[1]), Number(match[2]));
    return first ? new Date(first.getTime() + (Number(match[3]) - 1) * PERSIAN_DAY_MS) : null;
  }
  function normalizedWeekday(value) {
    return String(value || '').replace(/[ي]/g, 'ی').replace(/[ك]/g, 'ک').replace(/[\s\u200c\u200f]/g, '');
  }
  function timeSortValue(value) {
    const match = latinDigits(value).match(/(\d{1,2}):(\d{2})/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : 99999;
  }
  function getModule(id) { return state.modules.find((item) => item.id === id); }
  function moduleAvailable(id) { const module = getModule(id); return Boolean(module && module.enabled !== false); }
  function updateNotificationState(unreadCount = 0) {
    const button = $('#notification-button');
    const available = moduleAvailable('tickets');
    button.hidden = !available;
    $('#notification-dot').hidden = !available || !unreadCount;
  }
  function pageTitle(id) {
    if (id === 'students' && ['student', 'parent'].includes(state.user?.role)) return state.user.role === 'student' ? 'پرونده من' : 'پرونده فرزندم';
    return RESOURCE_NAMES[id] || PAGE_META[id]?.title || id;
  }
  function statusClass(value) {
    const v = String(value || '').toLowerCase();
    if (v.includes('غیرفعال') || v.includes('غایب') || v.includes('گذشته') || v.includes('لغو') || v.includes('ناموفق')) return 'red';
    if (v.includes('فعال') || v.includes('حاضر') || v.includes('پرداخت‌شده') || v.includes('منتشرشده') || v.includes('تحویل') || v.includes('موجود') || v.includes('ارسال‌شده') || v.includes('بررسی‌شده') || v.includes('بسته')) return 'green';
    if (v.includes('تأخیر') || v.includes('انتظار') || v.includes('پیگیری') || v.includes('پیش‌نویس') || v.includes('امانت') || v.includes('در حال')) return 'amber';
    if (v.includes('برنامه‌ریزی') || v.includes('عادی')) return 'blue';
    if (v.includes('بالا')) return 'purple';
    return 'gray';
  }
  function statusBadge(value) {
    if (!value) return '<span class="table-subtle">—</span>';
    return `<span class="badge badge-${statusClass(value)}">${esc(value)}</span>`;
  }

  async function request(url, options = {}) {
    const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(state.demoSessionToken ? { 'X-Demo-Session': state.demoSessionToken } : {}), ...(options.headers || {}) };
    const response = await fetch(url, { ...options, headers, credentials: 'same-origin', cache: 'no-store' });
    let data = {};
    try { data = await response.json(); } catch { /* ignore non-json response */ }
    if (!response.ok) {
      const error = new Error(data.error || 'درخواست انجام نشد.');
      error.status = response.status;
      if (response.status === 401 && state.user) showLogin(state.demoMode);
      throw error;
    }
    return data;
  }

  function showLogin(demoMode) {
    state.user = null;
    state.demoMode = Boolean(demoMode);
    $('#app').hidden = true;
    $('#auth-screen').hidden = false;
    $('#demo-accounts').hidden = !state.demoMode;
    $('#login-error').textContent = '';
  }

  async function boot() {
    window.hydrateIcons();
    try {
      const me = await request('/api/auth/me');
      state.demoMode = Boolean(me.demoMode);
      if (!state.demoMode) setDemoSessionToken('');
      if (!me.user) return showLogin(state.demoMode);
      state.user = me.user;
      state.settings = me.settings || {};
      await loadApp();
    } catch (error) {
      showLogin(false);
      console.error(error);
    }
  }

  async function loadApp(expectedUserId = '') {
    try {
      const data = await request('/api/bootstrap');
      if (expectedUserId && data.user?.id !== expectedUserId) throw new Error('حساب ورود عوض شد، اما نشست جدید تأیید نشد. یک‌بار دیگر نقش نمایشی را انتخاب کنید.');
      Object.assign(state, { user: data.user, settings: data.settings, modules: data.modules, dashboard: data.dashboard, demoMode: data.demoMode, appVersion: data.appVersion || APP_VERSION });
      state.attendanceMode = 'quick';
      state.attendanceAbsentIds = new Set();
      state.attendanceDirty = false;
      state.attendanceClassId = '';
      state.attendanceDate = '';
      state.cache = {};
      $('#auth-screen').hidden = true;
      $('#app').hidden = false;
      $('#school-name-side').textContent = state.settings.schoolName || 'مدرسه شما';
      $('#school-year-side').textContent = state.settings.academicYear || 'سال تحصیلی';
      $('#school-avatar').textContent = firstGlyph(state.settings.schoolName);
      $('#profile-name').textContent = state.user.name;
      $('#profile-role').textContent = roleName(state.user.role);
      $('#profile-avatar').textContent = firstGlyph(state.user.name);
      updateNotificationState(data.unreadTickets);
      const warmResources = ['classes', 'teachers'];
      if (['student', 'parent'].includes(state.user.role)) warmResources.push('grades', 'attendance');
      await Promise.all(warmResources.map((resource) => loadAllRecords(resource, true).catch(() => null)));
      state.page = 'dashboard';
      state.openNavGroup = '';
      buildSidebar();
      buildProfileMenu();
      await navigate('dashboard');
      return true;
    } catch (error) {
      if (error.status === 401 || error.status === 423) { showLogin(state.demoMode); return false; }
      toast(error.message, 'error');
      return false;
    }
  }

  function buildSidebar() {
    const nav = $('#sidebar-nav');
    const groups = new Map();
    state.modules.filter((module) => (module.enabled !== false || module.id === 'modules') && !(module.id === 'classes' && ['student', 'parent'].includes(state.user.role))).forEach((module) => {
      if (!groups.has(module.group)) groups.set(module.group, []);
      groups.get(module.group).push(module);
    });
    const orderedGroups = GROUP_ORDER.filter((group) => groups.has(group));
    const activeGroup = state.modules.find((module) => module.id === state.page)?.group;
    if (!groups.has(state.openNavGroup)) state.openNavGroup = groups.has(activeGroup) ? activeGroup : orderedGroups[0] || '';
    nav.innerHTML = orderedGroups.map((group) => `
      <details class="nav-group" data-nav-group="${esc(group)}">
        <summary class="nav-group-label"><span>${esc(group)}</span><span class="nav-group-chevron" aria-hidden="true">${icon('chevron-down', 13)}</span></summary>
        <div class="nav-group-links">${groups.get(group).map((module) => {
          let title = module.title;
          if (module.id === 'students' && state.user.role === 'student') title = 'پرونده من';
          if (module.id === 'students' && state.user.role === 'parent') title = 'پرونده فرزندم';
          const count = module.id === 'tickets' ? state.dashboard.counts?.openTickets : 0;
          return `<button class="nav-link ${module.id === state.page ? 'is-active' : ''} ${module.enabled === false ? 'nav-link-disabled' : ''}" data-nav="${esc(module.id)}" type="button" ${module.id === state.page ? 'aria-current="page"' : ''}>${icon(module.icon, 17)}<span>${esc(title)}</span>${count ? `<span class="nav-link-count">${faNumber(count)}</span>` : ''}</button>`;
        }).join('')}</div>
      </details>`).join('');
    nav.querySelectorAll('.nav-group').forEach((groupElement) => {
      groupElement.addEventListener('toggle', () => {
        if (!groupElement.isConnected || !groupElement.open) return;
        state.openNavGroup = groupElement.dataset.navGroup;
        nav.querySelectorAll('.nav-group').forEach((otherGroup) => { if (otherGroup !== groupElement) otherGroup.open = false; });
      });
    });
    const groupElements = [...nav.querySelectorAll('.nav-group')];
    const initialGroup = groupElements.find((groupElement) => groupElement.dataset.navGroup === state.openNavGroup)
      || nav.querySelector('.nav-link.is-active')?.closest('.nav-group')
      || groupElements[0];
    if (initialGroup) {
      state.openNavGroup = initialGroup.dataset.navGroup;
      initialGroup.open = true;
    }
  }

  function buildProfileMenu() {
    const roleLinks = state.demoMode ? `
      <div class="profile-menu-title">ورود سریع به پنل نمایشی</div>
      <button class="profile-menu-item" data-switch-account="admin" data-password="admin123">${icon('user-shield', 16)}<span>مدیر مدرسه</span></button>
      <button class="profile-menu-item" data-switch-account="ahmadi" data-password="teacher123">${icon('teacher', 16)}<span>پنل معلم</span></button>
      <button class="profile-menu-item" data-switch-account="sara" data-password="student123">${icon('student', 16)}<span>پنل دانش‌آموز</span></button>
      <button class="profile-menu-item" data-switch-account="maryam" data-password="parent123">${icon('parents', 16)}<span>پنل اولیا</span></button>
      <div class="profile-menu-separator"></div>` : '';
    const settingsLink = moduleAvailable('settings') ? `<button class="profile-menu-item" data-go-settings>${icon('settings', 16)}<span>تنظیمات مدرسه</span></button>` : '';
    $('#profile-menu').innerHTML = `${roleLinks}${settingsLink}<button class="profile-menu-item logout-item" data-logout>${icon('close', 16)}<span>خروج از حساب</span></button>`;
  }

  async function navigate(page) {
    const module = getModule(page);
    if (page !== 'search' && page !== 'dashboard' && !module) return;
    if (module && module.enabled === false) return toast('این ماژول غیرفعال است.', 'warning');
    if (state.page !== page && !$('#modal-layer').hidden) closeModal();
    state.page = page;
    state.search = '';
    state.statusFilter = '';
    $('#global-search').value = '';
    $('#breadcrumb-current').textContent = page === 'search' ? 'نتایج جست‌وجو' : pageTitle(page);
    buildSidebar();
    closeProfileMenu();
    if (page === 'dashboard') {
      $('#page-content').innerHTML = renderDashboard();
      bindDashboard();
      return;
    }
    if (page === 'settings') {
      $('#page-content').innerHTML = renderSettings();
      bindSettings();
      return;
    }
    if (page === 'modules') {
      $('#page-content').innerHTML = renderModules();
      bindModules();
      return;
    }
    if (page === 'roles') {
      const result = await loadAllRecords('roles', true);
      if (state.page !== 'roles') return;
      $('#page-content').innerHTML = renderRolePermissions(result.data || []);
      bindRolePermissions();
      return;
    }
    if (page === 'attendance' && ['admin', 'teacher'].includes(state.user.role)) {
      if (state.attendanceMode !== 'history') { await loadAttendanceWorkspace(); return; }
      await loadAllRecords('classes').catch(() => null);
    }
    if (page === 'reports') {
      const resources = ['classes', 'tickets', ...(moduleAvailable('finance') ? ['finance'] : [])];
      await Promise.all(resources.map((resource) => loadRecords(resource).catch(() => null)));
      $('#page-content').innerHTML = renderReports();
      bindReports();
      return;
    }
    if (page === 'events') { await loadCalendarPage(); return; }
    if (page === 'search') return;
    const content = $('#page-content');
    content.innerHTML = `<div class="loading-page"><span class="loading-spinner"></span><span>در حال دریافت اطلاعات ${esc(pageTitle(page))}…</span></div>`;
    try {
      const result = await loadRecords(page, true);
      if (state.page !== page) return;
      content.innerHTML = renderRecordsPage(page, result);
      bindRecordsPage(page, result);
    } catch (error) {
      if (state.page !== page) return;
      content.innerHTML = `<div class="page-heading"><div><h1>${esc(pageTitle(page))}</h1><p>${esc(error.message)}</p></div></div>${renderEmpty('empty-box', 'دریافت اطلاعات ممکن نشد', 'دوباره تلاش کنید.', '<button class="button button-outline" data-retry>تلاش دوباره</button>')}`;
      $('[data-retry]', content)?.addEventListener('click', () => navigate(page));
    }
  }

  async function loadRecords(resource, force = false, page = 1, filters = {}) {
    const query = String(filters.q || '').trim();
    const status = String(filters.status || '').trim();
    const cacheable = page === 1 && !query && !status && !filters.from && !filters.to && !filters.classId;
    if (!force && cacheable && state.cache[resource]) return state.cache[resource];
    const params = new URLSearchParams({ page: String(page), limit: '100' });
    if (query) params.set('q', query);
    if (status) params.set('status', status);
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    if (filters.classId) params.set('classId', filters.classId);
    const result = await request(`/api/records/${encodeURIComponent(resource)}?${params}`);
    if (cacheable) state.cache[resource] = result;
    return result;
  }

  async function loadAllRecords(resource, force = false) {
    const first = await loadRecords(resource, force, 1);
    const total = Number(first.total ?? first.data?.length ?? 0);
    const limit = Math.max(1, Number(first.limit || 100));
    const pageCount = Math.max(1, Math.ceil(total / limit));
    if (pageCount === 1) return first;
    const remaining = await Promise.all(Array.from({ length: pageCount - 1 }, (_, index) => loadRecords(resource, true, index + 2)));
    const result = { ...first, data: [ ...(first.data || []), ...remaining.flatMap((page) => page.data || []) ], total };
    state.cache[resource] = result;
    return result;
  }

  function ensureCalendarMonth() {
    if (state.calendarYear > 0 && state.calendarMonth >= 1 && state.calendarMonth <= 12) return;
    const timeZone = state.settings.timezone || 'Asia/Tehran';
    const formatter = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone });
    const parts = Object.fromEntries(formatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
    state.calendarYear = Number(parts.year);
    state.calendarMonth = Number(parts.month);
  }

  function calendarGradeOptions() {
    const classes = state.calendarData.classes || [];
    const order = ['اول', 'دوم', 'سوم', 'چهارم', 'پنجم', 'ششم', 'هفتم', 'هشتم', 'نهم', 'دهم', 'یازدهم', 'دوازدهم'];
    const rank = (value) => order.findIndex((word) => String(value).includes(word));
    return [...new Set(classes.map((item) => item.grade).filter(Boolean))].sort((a, b) => {
      const aRank = rank(a), bRank = rank(b);
      if (aRank >= 0 && bRank >= 0) return aRank - bRank;
      if (aRank >= 0) return -1;
      if (bRank >= 0) return 1;
      return a.localeCompare(b, 'fa');
    });
  }

  function calendarClassFor(row) {
    const classes = state.calendarData.classes || [];
    return classes.find((item) => item.id === row.classId || item.name === row.classId) || null;
  }

  function calendarScheduleFor(dayKey, grade = state.calendarGrade) {
    const date = persianDateFromKey(dayKey);
    if (!date || !moduleAvailable('timetable')) return [];
    const weekday = normalizedWeekday(CALENDAR_DAY_NAMES[date.getUTCDay()]);
    return (state.calendarData.timetable || []).filter((row) => {
      if (normalizedWeekday(row.day) !== weekday) return false;
      const classroom = calendarClassFor(row);
      if (!classroom) return false;
      return !grade || classroom.grade === grade;
    }).sort((a, b) => timeSortValue(a.startTime) - timeSortValue(b.startTime) || String(a.subject || '').localeCompare(String(b.subject || ''), 'fa'));
  }

  function calendarEventsFor(dayKey, grade = state.calendarGrade) {
    return (state.calendarData.events || []).filter((event) => {
      if (persianDateKey(event.date) !== dayKey) return false;
      if (!grade) return true;
      const audience = String(event.audience || '').replace(/[ي]/g, 'ی').replace(/[ك]/g, 'ک');
      return !audience || audience.includes('همه') || audience.includes(grade) || /دانش\s?آموز/.test(audience);
    }).sort((a, b) => timeSortValue(a.time) - timeSortValue(b.time));
  }

  function calendarMonthTitle() {
    ensureCalendarMonth();
    const first = persianMonthStart(state.calendarYear, state.calendarMonth);
    return first ? new Intl.DateTimeFormat('fa-IR-u-ca-persian', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(first) : `${faNumber(state.calendarMonth)} · ${faNumber(state.calendarYear)}`;
  }

  function renderCalendarGrid() {
    ensureCalendarMonth();
    const first = persianMonthStart(state.calendarYear, state.calendarMonth);
    if (!first) return '<div class="calendar-empty">نمایش این ماه ممکن نیست.</div>';
    const daysInMonth = persianMonthLength(state.calendarYear, state.calendarMonth);
    const leading = (first.getUTCDay() + 1) % 7;
    const cellCount = Math.ceil((leading + daysInMonth) / 7) * 7;
    const todayFormatter = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: state.settings.timezone || 'Asia/Tehran' });
    const todayParts = Object.fromEntries(todayFormatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
    const todayKey = `${todayParts.year}/${String(todayParts.month).padStart(2, '0')}/${String(todayParts.day).padStart(2, '0')}`;
    const weekdayHeaders = CALENDAR_WEEKDAYS.map((day) => `<span>${esc(day)}</span>`).join('');
    const cells = Array.from({ length: cellCount }, (_, index) => {
      const date = new Date(first.getTime() + (index - leading) * PERSIAN_DAY_MS);
      const parts = persianParts(date);
      const key = parts.key;
      const inMonth = parts.year === state.calendarYear && parts.month === state.calendarMonth;
      const schedules = calendarScheduleFor(key);
      const events = calendarEventsFor(key);
      const marks = [
        schedules.length ? `<small class="calendar-day-classes">${faNumber(schedules.length)} کلاس</small>` : '',
        events.length ? `<small class="calendar-day-events">${faNumber(events.length)} رویداد</small>` : ''
      ].filter(Boolean).join('');
      const dayLabel = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
      return `<button type="button" class="calendar-day ${inMonth ? '' : 'is-outside'} ${key === todayKey ? 'is-today' : ''} ${key === state.calendarSelectedDay ? 'is-selected' : ''} ${events.length ? 'has-events' : ''}" data-calendar-day="${key}" aria-label="${esc(dayLabel)}؛ ${faNumber(schedules.length)} کلاس، ${faNumber(events.length)} رویداد"><span class="calendar-day-number">${faNumber(parts.day)}</span><span class="calendar-day-markers">${marks || '<small class="calendar-day-empty">—</small>'}</span></button>`;
    }).join('');
    return `<div class="calendar-weekdays">${weekdayHeaders}</div><div class="calendar-month-grid">${cells}</div>`;
  }

  function renderEventsCalendar() {
    ensureCalendarMonth();
    const gradeOptions = calendarGradeOptions();
    const permissions = getModule('events')?.permissions || {};
    const addButton = permissions.canCreate ? `<button type="button" class="button button-primary" id="calendar-add-event">${icon('plus', 15)} <span>افزودن رویداد</span></button>` : '';
    return `<header class="page-heading"><div class="page-heading-with-icon"><span class="page-hero-icon">${icon('events', 20)}</span><div class="page-heading-copy"><div class="page-kicker">${icon('sparkles', 12)} تقویم آموزشی و رویدادها</div><h1>تقویم مدرسه</h1><p>برای دیدن برنامه‌ی کلاس‌ها و رویدادهای هر روز، روی همان روز کلیک کنید.</p></div></div><div class="page-heading-actions">${addButton}</div></header><section class="panel calendar-toolbar"><div class="calendar-month-controls"><button type="button" class="calendar-nav-button" data-calendar-shift="-1" aria-label="ماه قبل">${icon('chevron-right', 16)}</button><h2 id="calendar-month-title">${esc(calendarMonthTitle())}</h2><button type="button" class="calendar-nav-button" data-calendar-shift="1" aria-label="ماه بعد">${icon('chevron-left', 16)}</button><button type="button" class="button button-outline button-small" id="calendar-today">امروز</button></div><label class="calendar-grade-filter"><span>${icon('filter', 14)} فیلتر پایه</span><select id="calendar-grade-filter"><option value="">همه پایه‌ها</option>${gradeOptions.map((grade) => `<option value="${esc(grade)}" ${state.calendarGrade === grade ? 'selected' : ''}>${esc(grade)}</option>`).join('')}</select></label><button type="button" class="toolbar-icon-button calendar-refresh" id="calendar-refresh" title="به‌روزرسانی برنامه">${icon('audit', 16)}</button></section><section class="panel monthly-calendar" id="monthly-calendar">${renderCalendarGrid()}</section><div class="calendar-note"><span><i class="calendar-note-class"></i>برنامه هفتگی کلاس‌ها</span><span><i class="calendar-note-event"></i>رویداد مدرسه</span><small>ساعت‌ها بر اساس برنامه‌ی ثبت‌شده نمایش داده می‌شوند.</small></div>`;
  }

  async function loadCalendarPage() {
    const content = $('#page-content');
    content.innerHTML = `<div class="loading-page"><span class="loading-spinner"></span><span>در حال دریافت تقویم مدرسه…</span></div>`;
    try {
      const tasks = [loadAllRecords('events', true), loadAllRecords('classes', true)];
      if (moduleAvailable('timetable')) tasks.push(loadAllRecords('timetable', true));
      const results = await Promise.all(tasks);
      if (state.page !== 'events') return;
      state.calendarData = {
        events: results[0]?.data || [],
        classes: results[1]?.data || [],
        timetable: moduleAvailable('timetable') ? results[2]?.data || [] : []
      };
      if (state.calendarGrade && !calendarGradeOptions().includes(state.calendarGrade)) state.calendarGrade = '';
      state.calendarSelectedDay ||= (() => {
        const formatter = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: state.settings.timezone || 'Asia/Tehran' });
        const parts = Object.fromEntries(formatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
        return `${parts.year}/${String(parts.month).padStart(2, '0')}/${String(parts.day).padStart(2, '0')}`;
      })();
      content.innerHTML = renderEventsCalendar();
      bindEventsCalendar();
    } catch (error) {
      if (state.page !== 'events') return;
      content.innerHTML = `<div class="page-heading"><div><h1>تقویم مدرسه</h1><p>${esc(error.message)}</p></div></div>${renderEmpty('events', 'دریافت تقویم ممکن نشد', 'برای بارگذاری دوباره تلاش کنید.', '<button type="button" class="button button-outline" data-calendar-retry>تلاش دوباره</button>')}`;
      $('[data-calendar-retry]', content)?.addEventListener('click', loadCalendarPage);
    }
  }

  function renderCalendarDayModal(dayKey) {
    const date = persianDateFromKey(dayKey);
    if (!date) return renderEmpty('calendar', 'تاریخ معتبر نیست', 'روز دیگری را انتخاب کنید.');
    const dateTitle = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
    const schedules = calendarScheduleFor(dayKey);
    const events = calendarEventsFor(dayKey);
    const gradeOptions = calendarGradeOptions();
    const gradeFilter = `<label class="calendar-modal-filter"><span>${icon('filter', 14)} نمایش پایه</span><select id="calendar-day-grade-filter"><option value="">همه پایه‌ها</option>${gradeOptions.map((grade) => `<option value="${esc(grade)}" ${state.calendarGrade === grade ? 'selected' : ''}>${esc(grade)}</option>`).join('')}</select></label>`;
    const scheduleRows = schedules.map((item) => {
      const classroom = calendarClassFor(item) || {};
      return `<article class="calendar-schedule-row"><span class="calendar-schedule-time"><b>${esc(item.startTime || '—')}</b><small>${item.endTime ? `تا ${esc(item.endTime)}` : 'زمان پایان ثبت نشده'}</small></span><span class="calendar-schedule-copy"><b>${esc(item.subject || 'درس ثبت‌نشده')}</b><span><strong>${esc(classroom.grade || 'پایه نامشخص')}</strong><i>·</i>${esc(classroom.name || item.classId || 'کلاس نامشخص')}${item.room ? `<i>·</i>اتاق ${esc(item.room)}` : ''}</span></span><span class="calendar-schedule-badge">${item.room ? `اتاق ${esc(item.room)}` : 'برنامه هفتگی'}</span></article>`;
    }).join('');
    const eventRows = events.map((event) => `<article class="calendar-event-row"><span class="calendar-event-icon">${icon('events', 15)}</span><span class="calendar-event-copy"><b>${esc(event.title || 'رویداد مدرسه')}</b><small>${esc(event.category || 'رویداد')}${event.audience ? ` · ${esc(event.audience)}` : ''}${event.location ? ` · ${esc(event.location)}` : ''}</small></span><span class="calendar-event-time">${esc(event.time || '—')}</span></article>`).join('');
    const scheduleBody = !moduleAvailable('timetable')
      ? renderEmpty('timetable', 'برنامه هفتگی غیرفعال است', 'برای دیدن کلاس‌های این روز، ماژول برنامه هفتگی باید فعال باشد.')
      : schedules.length ? `<div class="calendar-schedule-list">${scheduleRows}</div>` : renderEmpty('timetable', 'کلاسی برای این روز ثبت نشده است', 'برنامه‌ی هفتگی برای این روز یا پایه وجود ندارد.');
    const eventsBody = events.length ? `<div class="calendar-event-list">${eventRows}</div>` : `<p class="calendar-no-events">برای این روز رویداد جداگانه‌ای ثبت نشده است.</p>`;
    return `<div class="modal-head"><div class="modal-head-main"><span class="modal-head-icon">${icon('calendar', 18)}</span><span><h2 id="modal-title">${esc(dateTitle)}</h2><p>برنامه‌ی کلاس‌ها و رویدادهای مدرسه</p></span></div><button type="button" class="modal-close" data-close-modal aria-label="بستن">${icon('close', 16)}</button></div><div class="modal-body calendar-day-body"><div class="calendar-day-summary"><span>${icon('timetable', 16)} <b>${faNumber(schedules.length)}</b> کلاس</span><span>${icon('events', 16)} <b>${faNumber(events.length)}</b> رویداد</span>${gradeFilter}</div><section class="calendar-modal-section"><div class="calendar-modal-section-heading"><h3>کلاس‌های در حال برگزاری</h3><span>${esc(CALENDAR_DAY_NAMES[date.getUTCDay()])}</span></div>${scheduleBody}</section><section class="calendar-modal-section calendar-events-section"><div class="calendar-modal-section-heading"><h3>رویدادهای مدرسه</h3></div>${eventsBody}</section></div><div class="modal-foot"><span class="modal-note">برنامه بر اساس روز هفته و پایه‌ی انتخاب‌شده فیلتر می‌شود.</span><div class="modal-foot-right"><button type="button" class="button button-outline" data-close-modal>بستن</button></div></div>`;
  }

  function refreshCalendarDayModal(dayKey) {
    const card = $('#modal-card');
    if ($('#modal-layer').hidden || !card.querySelector('#calendar-day-grade-filter')) return;
    const scrollTop = card.querySelector('.modal-body')?.scrollTop || 0;
    card.innerHTML = renderCalendarDayModal(dayKey);
    window.hydrateIcons(card);
    const body = card.querySelector('.modal-body');
    if (body) body.scrollTop = scrollTop;
  }

  function bindEventsCalendar() {
    const content = $('#page-content');
    content.onclick = (event) => {
      const day = event.target.closest('[data-calendar-day]');
      if (day) {
        const key = day.dataset.calendarDay;
        const parts = key.split('/').map(Number);
        state.calendarYear = parts[0];
        state.calendarMonth = parts[1];
        state.calendarSelectedDay = key;
        renderCalendarMonthGrid();
        openModal(renderCalendarDayModal(key), 'modal-wide');
        return;
      }
      const shift = event.target.closest('[data-calendar-shift]');
      if (shift) {
        let month = state.calendarMonth + Number(shift.dataset.calendarShift);
        let year = state.calendarYear;
        if (month < 1) { month = 12; year -= 1; }
        if (month > 12) { month = 1; year += 1; }
        state.calendarYear = year;
        state.calendarMonth = month;
        renderCalendarMonthGrid();
        return;
      }
      if (event.target.closest('#calendar-today')) {
        state.calendarYear = 0;
        state.calendarMonth = 0;
        ensureCalendarMonth();
        const formatter = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: state.settings.timezone || 'Asia/Tehran' });
        const parts = Object.fromEntries(formatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
        state.calendarSelectedDay = `${parts.year}/${String(parts.month).padStart(2, '0')}/${String(parts.day).padStart(2, '0')}`;
        renderCalendarMonthGrid();
        return;
      }
      if (event.target.closest('#calendar-add-event')) return openRecordForm('events');
      if (event.target.closest('#calendar-refresh')) return loadCalendarPage();
    };
    content.onchange = (event) => {
      if (event.target.id !== 'calendar-grade-filter') return;
      state.calendarGrade = event.target.value;
      renderCalendarMonthGrid();
      refreshCalendarDayModal(state.calendarSelectedDay);
    };
    $('#modal-card').onchange = (event) => {
      if (event.target.id !== 'calendar-day-grade-filter') return;
      state.calendarGrade = event.target.value;
      const pageFilter = $('#calendar-grade-filter');
      if (pageFilter) pageFilter.value = state.calendarGrade;
      renderCalendarMonthGrid();
      refreshCalendarDayModal(state.calendarSelectedDay);
    };
  }

  function renderCalendarMonthGrid() {
    const title = $('#calendar-month-title');
    const grid = $('#monthly-calendar');
    if (title) title.textContent = calendarMonthTitle();
    if (grid) grid.innerHTML = renderCalendarGrid();
  }

  function attendanceWorkspaceHeader(roster) {
    const classes = state.cache.classes?.data || [];
    const classOptions = classes.map((item) => `<option value=\"${esc(item.id)}\" ${state.attendanceClassId === item.id ? 'selected' : ''}>${esc(item.name)}${item.grade ? ` · ${esc(item.grade)}` : ''}</option>`).join('');
    return `<header class=\"page-heading\"><div class=\"page-heading-with-icon\"><span class=\"page-hero-icon\">${icon('attendance', 20)}</span><div class=\"page-heading-copy\"><div class=\"page-kicker\">${icon('sparkles', 12)} ثبت سریع کلاسی</div><h1>حضور و غیاب کلاس</h1><p>همه حاضر فرض می‌شوند؛ فقط دانش‌آموزان غایب را روشن کنید و یک‌بار ثبت بزنید.</p></div></div><div class=\"page-heading-actions\"><button class=\"button button-outline\" type=\"button\" id=\"attendance-history-view\">${icon('audit', 15)} <span class=\"button-label\">سوابق و گزارش</span></button></div></header><section class=\"panel attendance-quick-toolbar\"><label class=\"attendance-select-field\"><span>کلاس</span><select id=\"attendance-class\" aria-label=\"انتخاب کلاس\">${classOptions}</select></label><label class=\"attendance-select-field\"><span>تاریخ</span><input id=\"attendance-date\" type=\"date\" value=\"${esc(state.attendanceDate)}\" aria-label=\"تاریخ حضور و غیاب\"></label><label class=\"attendance-roster-search\">${icon('search', 15)}<input id=\"attendance-search\" type=\"search\" value=\"${esc(state.attendanceSearch)}\" placeholder=\"جست‌وجوی دانش‌آموز…\" autocomplete=\"off\"></label><button class=\"button button-outline attendance-mark-all\" type=\"button\" id=\"attendance-mark-all-present\">${icon('check', 15)} همه حاضر</button></section>${roster ? `<section class=\"panel attendance-roster-panel\"><div class=\"attendance-roster-heading\"><div><b>${esc(roster.class.name || 'کلاس')}</b><small>${esc(roster.class.grade || '')}${roster.class.room ? ` · اتاق ${esc(roster.class.room)}` : ''} · ${esc(fmtDate(roster.date))}</small></div><div class=\"attendance-roster-stats\"><span><b id=\"attendance-total\">${faNumber(roster.total)}</b><small>دانش‌آموز</small></span><span class=\"is-absent\"><b id=\"attendance-absent-count\">${faNumber(state.attendanceAbsentIds.size)}</b><small>غایب</small></span><span><b id=\"attendance-present-count\">${faNumber(Math.max(0, roster.total - state.attendanceAbsentIds.size))}</b><small>حاضر</small></span></div></div><div class=\"attendance-roster-list\" id=\"attendance-roster-list\">${roster.data.map((student) => {
      const absent = state.attendanceAbsentIds.has(student.id);
      const statusText = absent ? 'غایب' : student.status && student.status !== 'غایب' ? student.status : student.status === 'غایب' ? 'غایب' : 'ثبت‌نشده · حاضر فرض می‌شود';
      return `<article class=\"attendance-roster-row ${absent ? 'is-marked-absent' : ''}\" data-attendance-student=\"${esc(student.id)}\" data-search-text=\"${esc(`${student.name} ${student.studentNo || ''}`.toLocaleLowerCase('fa'))}\"><span class=\"attendance-student-avatar\">${esc(firstGlyph(student.name))}</span><span class=\"attendance-student-copy\"><b>${esc(student.name)}</b><small>${student.studentNo ? `شماره ${esc(student.studentNo)}` : 'شماره دانش‌آموزی ثبت نشده'}${student.time ? ` · ورود ${esc(student.time)}` : ''}</small></span><span class=\"attendance-student-status ${absent ? 'is-absent' : ''}\" data-attendance-status>${esc(statusText)}</span><button class=\"attendance-absence-switch ${absent ? 'is-on' : ''}\" type=\"button\" role=\"switch\" aria-checked=\"${absent}\" aria-label=\"ثبت غیبت ${esc(student.name)}\" data-attendance-toggle=\"${esc(student.id)}\"><span></span><b>${absent ? 'غایب' : 'حاضر'}</b></button></article>`;
    }).join('') || renderEmpty('student', 'دانش‌آموز فعالی در این کلاس نیست', 'برای تاریخ انتخاب‌شده فهرستی برای حضور و غیاب وجود ندارد.')}</div><div class=\"attendance-roster-footer\"><span id=\"attendance-save-state\">${state.attendanceDirty ? 'تغییرات هنوز ثبت نشده است.' : `آخرین ثبت این روز: ${faNumber(roster.summary.recorded)} از ${faNumber(roster.total)} دانش‌آموز`}</span><button class=\"button button-primary\" type=\"button\" id=\"attendance-save\" ${roster.total ? '' : 'disabled'}>${icon('check', 15)} ثبت حضور و غیاب</button></div></section>` : renderEmpty('attendance', 'کلاس ثبت نشده است', 'ابتدا در بخش کلاس‌ها، کلاس و معلم مسئول را تعریف کنید.')}`;
  }

  async function loadAttendanceWorkspace() {
    const content = $('#page-content');
    content.innerHTML = `<div class=\"loading-page\"><span class=\"loading-spinner\"></span><span>در حال آماده‌سازی فهرست کلاس…</span></div>`;
    try {
      const classesResult = await loadAllRecords('classes', true);
      if (state.page !== 'attendance') return;
      const classes = classesResult.data || [];
      state.attendanceDate ||= schoolDateISO();
      if (!classes.some((item) => item.id === state.attendanceClassId)) state.attendanceClassId = classes[0]?.id || '';
      if (!state.attendanceClassId) {
        state.attendanceAbsentIds = new Set();
        content.innerHTML = attendanceWorkspaceHeader(null);
        bindAttendanceWorkspace(null);
        return;
      }
      const roster = await request(`/api/attendance/class/${encodeURIComponent(state.attendanceClassId)}?date=${encodeURIComponent(state.attendanceDate)}`);
      if (state.page !== 'attendance') return;
      state.attendanceAbsentIds = new Set((roster.data || []).filter((student) => student.status === 'غایب').map((student) => student.id));
      state.attendanceDirty = false;
      content.innerHTML = attendanceWorkspaceHeader(roster);
      bindAttendanceWorkspace(roster);
    } catch (error) {
      if (state.page !== 'attendance') return;
      content.innerHTML = `<div class=\"page-heading\"><div><h1>حضور و غیاب کلاس</h1><p>${esc(error.message)}</p></div></div>${renderEmpty('attendance', 'دریافت فهرست کلاس ممکن نشد', 'دسترسی کلاس را بررسی و دوباره تلاش کنید.', '<button type=\"button\" class=\"button button-outline\" id=\"attendance-retry\">تلاش دوباره</button>')}`;
      $('#attendance-retry')?.addEventListener('click', loadAttendanceWorkspace);
    }
  }

  function updateAttendanceWorkspace(roster) {
    const absentCount = state.attendanceAbsentIds.size;
    const total = Number(roster?.total || 0);
    const absentLabel = $('#attendance-absent-count');
    const presentLabel = $('#attendance-present-count');
    if (absentLabel) absentLabel.textContent = faNumber(absentCount);
    if (presentLabel) presentLabel.textContent = faNumber(Math.max(0, total - absentCount));
    const saveState = $('#attendance-save-state');
    if (saveState) saveState.textContent = state.attendanceDirty ? 'تغییرات هنوز ثبت نشده است.' : `آخرین ثبت این روز: ${faNumber(roster?.summary?.recorded || 0)} از ${faNumber(total)} دانش‌آموز`;
  }

  function bindAttendanceWorkspace(roster) {
    const content = $('#page-content');
    $('#attendance-history-view')?.addEventListener('click', () => { state.attendanceMode = 'history'; navigate('attendance'); });
    $('#attendance-class')?.addEventListener('change', async (event) => {
      if (state.attendanceDirty && !window.confirm('تغییرات غیبت هنوز ثبت نشده‌اند. کلاس را عوض کنید و از دست بدهید؟')) { event.target.value = state.attendanceClassId; return; }
      state.attendanceClassId = event.target.value;
      state.attendanceDirty = false;
      await loadAttendanceWorkspace();
    });
    $('#attendance-date')?.addEventListener('change', async (event) => {
      if (state.attendanceDirty && !window.confirm('تغییرات غیبت هنوز ثبت نشده‌اند. تاریخ را عوض کنید و از دست بدهید؟')) { event.target.value = state.attendanceDate; return; }
      state.attendanceDate = event.target.value || schoolDateISO();
      state.attendanceDirty = false;
      await loadAttendanceWorkspace();
    });
    $('#attendance-search')?.addEventListener('input', (event) => {
      state.attendanceSearch = event.target.value;
      const query = state.attendanceSearch.trim().toLocaleLowerCase('fa');
      content.querySelectorAll('[data-attendance-student]').forEach((row) => { row.hidden = Boolean(query && !row.dataset.searchText.includes(query)); });
    });
    content.onclick = (event) => {
      const toggle = event.target.closest('[data-attendance-toggle]');
      if (toggle) {
        const studentId = toggle.dataset.attendanceToggle;
        if (state.attendanceAbsentIds.has(studentId)) state.attendanceAbsentIds.delete(studentId);
        else state.attendanceAbsentIds.add(studentId);
        const absent = state.attendanceAbsentIds.has(studentId);
        toggle.classList.toggle('is-on', absent);
        toggle.setAttribute('aria-checked', String(absent));
        toggle.querySelector('b').textContent = absent ? 'غایب' : 'حاضر';
        const row = toggle.closest('[data-attendance-student]');
        row?.classList.toggle('is-marked-absent', absent);
        const status = row?.querySelector('[data-attendance-status]');
        if (status) { status.textContent = absent ? 'غایب' : roster?.data.find((student) => student.id === studentId)?.status && roster.data.find((student) => student.id === studentId).status !== 'غایب' ? roster.data.find((student) => student.id === studentId).status : 'ثبت‌نشده · حاضر فرض می‌شود'; status.classList.toggle('is-absent', absent); }
        state.attendanceDirty = true;
        updateAttendanceWorkspace(roster);
        return;
      }
      if (event.target.closest('#attendance-mark-all-present')) {
        state.attendanceAbsentIds.clear();
        state.attendanceDirty = true;
        content.querySelectorAll('[data-attendance-toggle]').forEach((button) => {
          button.classList.remove('is-on'); button.setAttribute('aria-checked', 'false'); button.querySelector('b').textContent = 'حاضر';
          button.closest('[data-attendance-student]')?.classList.remove('is-marked-absent');
          const status = button.closest('[data-attendance-student]')?.querySelector('[data-attendance-status]');
          if (status) { const student = roster?.data.find((item) => item.id === button.dataset.attendanceToggle); status.textContent = student?.status && student.status !== 'غایب' ? student.status : 'ثبت‌نشده · حاضر فرض می‌شود'; status.classList.remove('is-absent'); }
        });
        updateAttendanceWorkspace(roster);
        return;
      }
      if (event.target.closest('#attendance-save')) saveAttendanceWorkspace(roster);
    };
  }

  async function saveAttendanceWorkspace(roster) {
    const button = $('#attendance-save');
    if (!button || !roster) return;
    button.disabled = true;
    button.classList.add('is-loading');
    try {
      const result = await request(`/api/attendance/class/${encodeURIComponent(state.attendanceClassId)}`, {
        method: 'POST', body: JSON.stringify({ date: state.attendanceDate, absentIds: [...state.attendanceAbsentIds] })
      });
      state.attendanceDirty = false;
      delete state.cache.attendance;
      await refreshBootstrap(false);
      toast(result.message || 'حضور و غیاب ثبت شد.');
      await loadAttendanceWorkspace();
    } catch (error) {
      toast(error.message, 'error');
      button.disabled = false;
      button.classList.remove('is-loading');
    }
  }

  function sparkline(seed = 1) {
    const sets = [
      '1,19 8,14 16,17 24,8 31,11 39,4 48,7',
      '1,17 9,18 16,11 24,14 31,7 39,9 48,3',
      '1,7 8,12 16,8 24,18 31,13 39,18 48,12'
    ];
    const points = sets[seed % sets.length];
    return `<svg class="stat-spark" viewBox="0 0 50 25" aria-hidden="true"><polygon class="spark-fill" points="${points} 48,25 1,25"></polygon><polyline points="${points}"></polyline></svg>`;
  }

  function renderDashboard() {
    const counts = state.dashboard.counts || {};
    const role = state.user.role;
    const who = esc(state.user.name.split(' ')[0]);
    const now = new Date();
    const dateLabel = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long', day: 'numeric', month: 'long', timeZone: state.settings.timezone || 'Asia/Tehran' }).format(now);
    const year = esc(state.settings.academicYear || 'سال تحصیلی جاری');
    const hour = Number(new Intl.DateTimeFormat('en-US', { hour: '2-digit', hourCycle: 'h23', timeZone: state.settings.timezone || 'Asia/Tehran' }).format(now));
    const greeting = hour < 11 ? 'صبح بخیر' : hour < 17 ? 'وقت بخیر' : 'عصر بخیر';
    let cards;
    if (role === 'admin') {
      cards = [
        statCard('تعداد دانش‌آموزان', faNumber(counts.students), 'نفر', 'student', 'blue', 'در پرونده‌های مدرسه', 0),
        statCard('کادر آموزشی', faNumber(counts.teachers), 'معلم', 'teacher', 'green', 'معلمان فعال مدرسه', 1),
        statCard('کلاس‌های فعال', faNumber(counts.classes), 'کلاس', 'classes', 'orange', 'با معلم مسئول مشخص', 2),
        statCard('حضور امروز', `${faNumber(counts.attendanceRate)}٪`, '', 'attendance', 'pink', `${faNumber(counts.present)} حاضر · ${faNumber(counts.absent)} غایب`, 3)
      ].join('');
    } else if (role === 'teacher') {
      cards = [
        statCard('دانش‌آموزان کلاس من', faNumber(counts.students), 'نفر', 'student', 'blue', 'پرونده‌های در دسترس', 0),
        statCard('کلاس‌های من', faNumber(counts.classes), 'کلاس', 'classes', 'green', 'کلاس‌های واگذارشده', 1),
        statCard('ثبت حضور امروز', faNumber(counts.present + counts.late + counts.absent), 'مورد', 'attendance', 'orange', 'حاضر، غایب و با تأخیر', 2),
        statCard('تکالیف فعال', faNumber(counts.assignments), 'مورد', 'assignments', 'pink', 'در کلاس‌های شما', 3)
      ].join('');
    } else {
      const grades = state.cache.grades?.data || [];
      const avg = grades.length ? (grades.reduce((sum, row) => sum + Number(row.score || 0), 0) / grades.length).toFixed(1) : '—';
      cards = [
        statCard(role === 'parent' ? 'وضعیت فرزندم' : 'میانگین نمرات', role === 'parent' ? 'فعال' : avg, role === 'parent' ? '' : 'از ۲۰', 'grades', 'blue', 'بر اساس کارنامه ثبت‌شده', 0),
        statCard('حضور و غیاب', `${faNumber(counts.attendanceRate)}٪`, '', 'attendance', 'green', 'درصد حضور ثبت‌شده', 1),
        statCard('تکالیف پیش‌رو', faNumber(counts.assignments), 'مورد', 'assignments', 'orange', 'برای کلاس من', 2),
        statCard('گفت‌وگوهای باز', faNumber(counts.openTickets), 'تیکت', 'tickets', 'pink', 'ارتباط با مدرسه', 3)
      ].join('');
    }
    const callToAction = role === 'admin' ? 'ثبت حضور و غیاب' : role === 'teacher' ? 'ثبت حضور کلاس' : 'مشاهده پرونده من';
    const ctaTarget = role === 'student' || role === 'parent' ? 'students' : 'attendance';
    const tickets = state.dashboard.recentTickets || [];
    const notices = state.dashboard.recentNotices || [];
    const schedule = state.dashboard.upcoming || [];
    const primaryAction = moduleAvailable(ctaTarget) ? `<button class="button button-white" data-quick-nav="${ctaTarget}">${icon(role === 'student' || role === 'parent' ? 'student' : 'attendance', 14)} <span>${callToAction}</span></button>` : '';
    const ticketAction = moduleAvailable('tickets') ? `<button class="button button-banner-ghost" data-quick-nav="tickets">${icon('tickets', 14)} <span>ارتباط با مدرسه</span></button>` : '';
    const attendancePanel = moduleAvailable('attendance')
      ? `<section class="panel attendance-panel"><div class="panel-header"><div class="panel-title"><span class="panel-title-icon">${icon('attendance', 16)}</span><span><h2>روند حضور و غیاب</h2><p>مقایسه ثبت‌های حضور در هفت روز اخیر</p></span></div><div class="chart-legend"><span><i></i>حضور ثبت‌شده</span><span><i></i>نرخ حضور</span></div></div>${renderAttendanceChart(state.dashboard.weeklyAttendance || [])}<div class="chart-total"><span>ثبت امروز <b>${faNumber(counts.present + counts.late + counts.absent)} مورد</b></span><span>درصد حضور <b>${faNumber(counts.attendanceRate)}٪</b></span></div></section>`
      : `<section class="panel attendance-panel">${renderEmpty('attendance', 'حضور و غیاب غیرفعال است', 'برای نمایش این گزارش، ماژول حضور و غیاب را فعال کنید.')}</section>`;
    const ticketsPanel = moduleAvailable('tickets')
      ? `<section class="panel tickets-panel"><div class="panel-header"><div class="panel-title"><span class="panel-title-icon">${icon('tickets', 16)}</span><span><h2>آخرین درخواست‌ها</h2><p>${faNumber(counts.openTickets)} تیکت نیازمند پیگیری</p></span></div><button class="panel-link" data-quick-nav="tickets">همه تیکت‌ها ${icon('chevron-left', 13)}</button></div><div class="ticket-list">${tickets.length ? tickets.slice(0, 4).map((ticket) => renderTicketRow(ticket)).join('') : `<div class="empty-state"><span class="empty-state-icon">${icon('message-check', 22)}</span><h3>درخواست بازی ندارید</h3><p>همه گفت‌وگوها پیگیری شده‌اند.</p></div>`}</div></section>`
      : '';
    const noticesPanel = moduleAvailable('notices')
      ? `<section class="panel"><div class="panel-header"><div class="panel-title"><span class="panel-title-icon">${icon('notices', 16)}</span><span><h2>اطلاعیه‌های مدرسه</h2><p>آخرین خبرها و به‌روزرسانی‌ها</p></span></div><button class="panel-link" data-quick-nav="notices">مشاهده همه ${icon('chevron-left', 13)}</button></div><div class="notice-list">${notices.length ? notices.slice(0, 3).map((notice, index) => `<div class="notice-item"><span class="notice-icon">${icon(index === 0 ? 'events' : 'notices', 15)}</span><div class="notice-item-copy"><b>${esc(notice.title)}</b><small>${esc(notice.body || notice.audience || '')}</small></div><span class="notice-date">${esc(notice.publishDate || '')}</span></div>`).join('') : '<div class="empty-state"><h3>اطلاعیه‌ای ثبت نشده است</h3></div>'}</div></section>`
      : '';
    const schedulePanel = moduleAvailable('timetable')
      ? `<section class="panel"><div class="panel-header"><div class="panel-title"><span class="panel-title-icon">${icon('timetable', 16)}</span><span><h2>برنامه کلاس‌ها</h2><p>نمایش بخشی از برنامه هفتگی</p></span></div><button class="panel-link" data-quick-nav="timetable">برنامه کامل ${icon('chevron-left', 13)}</button></div><div class="schedule-list">${schedule.length ? schedule.slice(0, 4).map((item) => `<div class="schedule-item"><span class="schedule-time">${esc(item.startTime || item.day || '—')}</span><span class="schedule-line"></span><span class="schedule-item-copy"><b>${esc(item.subject || item.title || 'کلاس')}</b><small>${esc(item.day || '')} · ${esc(className(item.classId))}${item.teacherId ? ` · ${esc(teacherName(item.teacherId))}` : ''}</small></span><span class="schedule-room">${item.room ? `اتاق ${esc(item.room)}` : ''}</span></div>`).join('') : '<div class="empty-state"><h3>برنامه‌ای ثبت نشده است</h3></div>'}</div></section>`
      : '';
    return `
      <div class="page-heading dashboard-heading"><div class="page-heading-main"><div class="year-chip">${icon('calendar', 12)} سال تحصیلی ${year}</div><div class="dashboard-title-row"><h1>${greeting}، ${who}</h1><span class="greeting-emoji">🌿</span></div><p>این هم خلاصه‌ای از وضعیت مدرسه در امروز.</p></div><span class="dashboard-date">${icon('calendar', 14)} ${esc(dateLabel)}</span></div>
      <section class="welcome-banner"><div class="welcome-copy"><span class="banner-eyebrow">${icon('sparkles', 13)} ${role === 'admin' ? 'پنل مدیریت مدرسه' : role === 'teacher' ? 'پنل آموزشی معلم' : 'پنل دانش‌آموزی شما'}</span><h2>${role === 'student' ? 'مسیر یادگیری‌ات را دنبال کن' : role === 'parent' ? 'در جریان مسیر تحصیلی فرزندتان باشید' : 'مدرسه‌ای منظم‌تر، ارتباطی نزدیک‌تر'}</h2><p>${role === 'admin' ? 'از اینجا حضور و غیاب، پرونده‌ها و ارتباطات مدرسه را سریع مدیریت کنید.' : role === 'teacher' ? 'کلاس‌ها، تکالیف و وضعیت دانش‌آموزان را در یک نگاه پیگیری کنید.' : 'برنامه کلاس‌ها، تکالیف و خبرهای مدرسه همیشه همراه شماست.'}</p><div class="welcome-actions">${primaryAction}${ticketAction}</div></div><div class="banner-art" aria-hidden="true"><div class="banner-art-card"><div class="banner-art-check">${icon('check', 15)}</div><div class="banner-art-lines"><i></i><i></i><i></i></div></div><div class="banner-art-book"></div><div class="banner-art-pencil"></div></div></section>
      <section class="stats-grid">${cards}</section>
      <div class="dashboard-grid ${moduleAvailable('tickets') ? '' : 'dashboard-grid-single'}">${attendancePanel}${ticketsPanel}</div>
      <div class="dashboard-bottom-grid">${noticesPanel}${schedulePanel}</div>`;
  }

  function statCard(label, value, unit, iconName, color, meta, seed) {
    const target = iconName === 'teacher' ? 'teachers' : iconName === 'classes' ? 'classes' : iconName === 'student' ? 'students' : iconName === 'attendance' ? 'attendance' : iconName === 'tickets' ? 'tickets' : iconName;
    const canNavigate = moduleAvailable(target);
    const tag = canNavigate ? 'button' : 'div';
    const attributes = canNavigate ? `type="button" data-stat-nav="${target}"` : 'aria-disabled="true"';
    return `<${tag} class="stat-card ${canNavigate ? '' : 'is-static'}" ${attributes}><span class="stat-icon stat-icon-${color}">${icon(iconName, 19)}</span><span class="stat-card-copy"><small class="stat-label">${esc(label)}</small><span class="stat-value-row"><b class="stat-value">${esc(value)}</b>${unit ? `<small class="stat-unit">${esc(unit)}</small>` : ''}</span><span class="stat-meta">${icon(seed === 3 ? 'arrow-up' : 'check', 11)} ${esc(meta)}</span></span>${sparkline(seed)}</${tag}>`;
  }

  function renderAttendanceChart(items) {
    const width = 680, height = 165, baseline = 127, chartTop = 12;
    const max = Math.max(5, ...items.map((item) => Number(item.count || 0)));
    const gap = 26, barWidth = Math.min(46, Math.floor((width - 50 - gap * 6) / 7));
    const start = (width - (items.length * barWidth + Math.max(0, items.length - 1) * gap)) / 2;
    const bars = items.map((item, index) => {
      const count = Number(item.count || 0);
      const barHeight = Math.max(7, (count / max) * 87);
      const x = start + index * (barWidth + gap);
      const y = baseline - barHeight;
      const isLast = index === items.length - 1;
      return `<rect class="chart-bar-bg" x="${x}" y="${chartTop}" width="${barWidth}" height="${baseline - chartTop}" rx="7"/><rect class="chart-bar ${isLast ? 'today' : ''}" x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="7"/><text class="chart-value" x="${x + barWidth / 2}" y="${y - 7}" text-anchor="middle">${faNumber(count)}</text><text class="chart-label" x="${x + barWidth / 2}" y="${baseline + 19}" text-anchor="middle">${esc(item.name || '')}</text>`;
    }).join('');
    return `<div class="chart-wrap"><svg class="attendance-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="نمودار حضور هفتگی">${[34,65,96,127].map((y) => `<line class="chart-grid-line" x1="20" y1="${y}" x2="660" y2="${y}"/>`).join('')}${bars}</svg></div>`;
  }

  function renderTicketRow(ticket) {
    return `<button class="ticket-row" type="button" data-ticket-id="${esc(ticket.id)}"><span class="ticket-avatar">${esc(firstGlyph(ticket.studentName || 'م'))}</span><span class="ticket-row-copy"><b>${esc(ticket.subject)}</b><small>${esc(ticket.studentName || 'گفت‌وگوی مدرسه')} · ${esc(ticket.category || 'درخواست')}</small></span><span class="ticket-row-side">${statusBadge(ticket.status)}<small>${esc(fmtDateTime(ticket.lastReplyAt || ticket.createdAt))}</small></span></button>`;
  }

  function renderEmpty(iconName, title, subtitle, button = '') {
    return `<div class="empty-state"><span class="empty-state-icon">${icon(iconName, 23)}</span><h3>${esc(title)}</h3><p>${esc(subtitle)}</p>${button}</div>`;
  }

  function renderPageHeading(resource, meta, actions = '') {
    const title = pageTitle(resource);
    return `<header class="page-heading"><div class="page-heading-with-icon"><span class="page-hero-icon">${icon(meta.icon, 20)}</span><div class="page-heading-copy"><div class="page-kicker">${icon('sparkles', 12)} پنل مدرسه</div><h1>${esc(title)}</h1><p>${esc(meta.description)}</p></div></div><div class="page-heading-actions">${actions}</div></header>`;
  }

  function renderRecordsPage(resource, result) {
    const data = result.data || [];
    const total = Number(result.total ?? data.length);
    const page = Number(result.page || 1);
    const limit = Number(result.limit || 100);
    const pageCount = Math.max(1, Math.ceil(total / limit));
    const meta = PAGE_META[resource] || { title: pageTitle(resource), singular: 'رکورد', icon: 'documents', description: 'اطلاعات این بخش را مدیریت کنید.', columns: [{ key: 'name', label: 'عنوان', primary: true }] };
    const mayCreate = Boolean(getModule(resource)?.permissions?.canCreate && FORM_FIELDS[resource]);
    const addLabel = resource === 'tickets' && ['student', 'parent'].includes(state.user.role) ? 'ثبت درخواست جدید' : `افزودن ${meta.singular || 'مورد جدید'}`;
    const addButton = mayCreate ? `<button class="button button-primary" type="button" id="add-record">${icon('plus', 16)} <span class="button-label">${esc(addLabel)}</span></button>` : '';
    const attendanceQuickAction = resource === 'attendance' && ['admin', 'teacher'].includes(state.user.role) ? `<button class="button button-outline" type="button" id="attendance-quick-view">${icon('attendance', 15)} <span class="button-label">ثبت سریع کلاسی</span></button>` : '';
    const headingActions = `${attendanceQuickAction}${addButton}`;
    const stats = total <= limit ? renderListStats(resource, data) : '';
    const filterStatuses = [...new Set(data.map((item) => item.status).filter(Boolean))];
    const searchPlaceholder = resource === 'students' ? 'جست‌وجوی نام یا شماره دانش‌آموزی…' : `جست‌وجو در ${meta.title}…`;
    const columns = meta.columns || [];
    const tableHeader = `${columns.map((column) => `<th>${esc(column.label)}</th>`).join('')}<th class="action-column"></th>`;
    return `${renderPageHeading(resource, meta, headingActions)}${stats ? `<div class="list-page-stats">${stats}</div>` : ''}<section class="panel data-list-panel"><div class="list-toolbar"><div class="list-toolbar-left"><label class="table-search">${icon('search', 15)}<input id="table-search" type="search" placeholder="${esc(searchPlaceholder)}" autocomplete="off"></label>${filterStatuses.length > 1 ? `<select class="filter-select" id="status-filter"><option value="">همه وضعیت‌ها</option>${filterStatuses.map((status) => `<option value="${esc(status)}">${esc(status)}</option>`).join('')}</select>` : ''}${resource === 'attendance' ? `<label class="date-filter"><span>از</span><input id="attendance-filter-from" type="date" aria-label="از تاریخ"></label><label class="date-filter"><span>تا</span><input id="attendance-filter-to" type="date" aria-label="تا تاریخ"></label><select class="filter-select" id="attendance-filter-class"><option value="">همه کلاس‌ها</option>${(state.cache.classes?.data || []).map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('')}</select>` : ''}</div><div class="list-toolbar-right"><span class="list-count">نمایش <b id="visible-count">${faNumber(data.length)}</b> از <span id="total-count">${faNumber(total)}</span> مورد</span><button class="toolbar-icon-button" id="export-csv" title="خروجی CSV">${icon('download', 16)}</button><button class="toolbar-icon-button" id="refresh-list" title="به‌روزرسانی">${icon('audit', 16)}</button></div></div><div class="data-table-wrap"><table class="data-table"><thead><tr>${tableHeader}</tr></thead><tbody id="data-table-body">${renderTableRows(resource, data, columns)}</tbody></table></div><div class="table-footer"><span id="table-footer-count">${faNumber(total)} ${esc(meta.singular || 'مورد')} در این بخش</span><div class="pagination"><button type="button" data-page-action="prev" aria-label="صفحه قبل" ${page <= 1 ? 'disabled' : ''}>${icon('chevron-right', 14)}</button><span class="pagination-label" id="pagination-label">صفحه ${faNumber(page)} از ${faNumber(pageCount)}</span><button type="button" data-page-action="next" aria-label="صفحه بعد" ${page >= pageCount ? 'disabled' : ''}>${icon('chevron-left', 14)}</button></div></div></section>`;
  }

  function renderListStats(resource, data) {
    const stats = [];
    if (resource === 'students') {
      stats.push(['student', 'پرونده فعال', data.filter((item) => item.status === 'فعال').length]);
      stats.push(['classes', 'کلاس‌ها', new Set(data.map((item) => item.classId)).size]);
      stats.push(['phone', 'دارای شماره ولی', data.filter((item) => item.guardianPhone).length]);
    } else if (resource === 'teachers') {
      stats.push(['teacher', 'معلم فعال', data.filter((item) => item.status === 'فعال').length]);
      stats.push(['classes', 'کلاس واگذارشده', data.reduce((sum, item) => sum + (item.classIds?.length || 0), 0)]);
    } else if (resource === 'classes') {
      stats.push(['classes', 'کلاس فعال', data.filter((item) => item.status === 'فعال').length]);
      stats.push(['student', 'ظرفیت کل', data.reduce((sum, item) => sum + Number(item.capacity || 0), 0)]);
      stats.push(['attendance', 'دانش‌آموزان', data.reduce((sum, item) => sum + Number(item.studentCount || 0), 0)]);
    } else if (resource === 'attendance') {
      stats.push(['check', 'حاضر', data.filter((item) => item.status === 'حاضر').length]);
      stats.push(['clock', 'با تأخیر', data.filter((item) => item.status === 'با تأخیر').length]);
      stats.push(['close', 'غایب', data.filter((item) => item.status === 'غایب').length]);
    } else if (resource === 'tickets') {
      stats.push(['tickets', 'در انتظار پاسخ', data.filter((item) => item.status !== 'بسته').length]);
      stats.push(['check', 'پاسخ‌داده‌شده', data.filter((item) => item.status === 'بسته').length]);
    } else return '';
    return stats.map(([iconName, label, value]) => `<div class="list-stat-chip"><span>${icon(iconName, 14)}</span><span><small>${esc(label)}</small><b>${faNumber(value)}</b></span></div>`).join('');
  }

  function renderTableRows(resource, data, columns) {
    if (!data.length) return `<tr><td colspan="${columns.length + 1}" class="table-empty">${icon('empty-box', 22)}<div>موردی برای نمایش پیدا نشد.</div></td></tr>`;
    const permissions = getModule(resource)?.permissions || {};
    const canEdit = Boolean(permissions.canUpdate && FORM_FIELDS[resource] && resource !== 'tickets');
    const canDelete = Boolean(permissions.canDelete && FORM_FIELDS[resource]);
    return data.map((record) => {
      const actions = [];
      if (canEdit) actions.push(`<button class="row-action" type="button" data-action="edit" data-id="${esc(record.id)}" title="ویرایش">${icon('edit', 14)}</button>`);
      if (canDelete) actions.push(`<button class="row-action" type="button" data-action="delete" data-id="${esc(record.id)}" title="حذف">${icon('trash', 14)}</button>`);
      if (!actions.length) actions.push(`<button class="row-action" type="button" data-action="more" data-id="${esc(record.id)}" title="جزئیات">${icon('more', 16)}</button>`);
      return `<tr data-row-id="${esc(record.id)}">${columns.map((column) => `<td>${renderCell(resource, record, column)}</td>`).join('')}<td>${actions.join('')}</td></tr>`;
    }).join('');
  }

  function renderCell(resource, record, column) {
    const key = column.key;
    let value = record[key];
    if (column.primary) {
      let secondaryValue = record[column.secondary] || '';
      if (column.secondary === 'classId') secondaryValue = className(secondaryValue);
      if (column.secondary === 'teacherId') secondaryValue = teacherName(secondaryValue);
      if (column.secondary === 'role') secondaryValue = roleName(secondaryValue);
      if (column.secondary === 'date' || column.secondary === 'createdAt') secondaryValue = fmtDate(secondaryValue);
      if (column.secondary === 'studentId') secondaryValue = `شماره ${secondaryValue}`;
      if (Array.isArray(secondaryValue)) secondaryValue = secondaryValue.join('، ');
      const colors = ['','green','orange','pink','teal','gray'];
      const color = colors[(String(record.id || '').length + String(record.name || '').length) % colors.length];
      return `<span class="table-primary-cell"><span class="table-avatar ${color}">${esc(firstGlyph(value))}</span><span class="table-primary-copy"><b>${esc(value || '—')}</b><small>${esc(secondaryValue || RESOURCE_NAMES[resource] || '')}</small></span></span>`;
    }
    if (key === 'classId') value = className(value);
    if (key === 'teacherId') value = teacherName(value);
    if (key === 'studentId') value = studentName(value);
    if (key === 'studentIds') value = Array.isArray(value) ? value.map(studentName).join('، ') : '';
    if (key === 'classIds') value = Array.isArray(value) ? value.map(className).join('، ') : '';
    if (key === 'role') value = record.roleName || roleName(value);
    if (key === 'at' || key === 'createdAt' || key === 'lastReplyAt') value = fmtDateTime(value);
    if (['date','dueDate','publishDate','paidAt','updatedAt','sentAt'].includes(key)) value = fmtDate(value);
    if (['amount'].includes(key)) value = money(value);
    if (key === 'score' || key === 'maxScore') value = value === undefined ? '' : new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 }).format(value);
    if (key === 'status') return statusBadge(value);
    if (key === 'phone' || key === 'guardianPhone') {
      if (!value) return '<span class="table-subtle">—</span>';
      const latinPhone = String(value).replace(/[۰-۹]/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)).replace(/[^+\d]/g, '');
      return `<a class="table-link" href="tel:${esc(latinPhone)}" onclick="event.stopPropagation()">${esc(value)}</a>`;
    }
    if (Array.isArray(value)) value = value.join('، ');
    if (typeof value === 'number') value = faNumber(value);
    if (value === null || value === undefined || value === '') return '<span class="table-subtle">—</span>';
    const text = String(value);
    if (text.length > 72) return `<span title="${esc(text)}">${esc(text.slice(0, 69))}…</span>`;
    return `<span>${esc(text)}</span>`;
  }

  function bindRecordsPage(resource, initialResult) {
    const meta = PAGE_META[resource] || { columns: [] };
    const search = $('#table-search');
    const statusSelect = $('#status-filter');
    const dateFromInput = $('#attendance-filter-from');
    const dateToInput = $('#attendance-filter-to');
    const classFilter = $('#attendance-filter-class');
    const filtersNow = () => ({ q: search?.value || '', status: statusSelect?.value || '', from: dateFromInput?.value || '', to: dateToInput?.value || '', classId: classFilter?.value || '' });
    let displayedResult = initialResult;
    let requestSequence = 0;
    let searchTimer;
    const updateRows = () => {
      const rows = displayedResult.data || [];
      const page = Number(displayedResult.page || 1);
      const limit = Number(displayedResult.limit || 100);
      const total = Number(displayedResult.total ?? rows.length);
      const pageCount = Math.max(1, Math.ceil(total / limit));
      $('#data-table-body').innerHTML = renderTableRows(resource, rows, meta.columns);
      $('#visible-count').textContent = faNumber(rows.length);
      $('#total-count').textContent = faNumber(total);
      $('#table-footer-count').textContent = `${faNumber(total)} ${meta.singular || 'مورد'}${search?.value.trim() ? ' پیدا شد' : ' در این بخش'}`;
      const statsPanel = $('.list-page-stats');
      if (statsPanel) {
        statsPanel.hidden = total > limit || page > 1 || Boolean(search?.value.trim()) || Boolean(statusSelect?.value);
        if (!statsPanel.hidden) statsPanel.innerHTML = renderListStats(resource, rows);
      }
      $('#pagination-label').textContent = `صفحه ${faNumber(page)} از ${faNumber(pageCount)}`;
      const previous = $('[data-page-action="prev"]');
      const next = $('[data-page-action="next"]');
      if (previous) previous.disabled = page <= 1;
      if (next) next.disabled = page >= pageCount;
    };
    const loadPage = async (page) => {
      const sequence = ++requestSequence;
      try {
        const fresh = await loadRecords(resource, true, page, filtersNow());
        if (sequence !== requestSequence || state.page !== resource) return;
        displayedResult = fresh;
        updateRows();
      } catch (error) {
        if (sequence === requestSequence) toast(error.message, 'error');
      }
    };
    search?.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => loadPage(1), 220);
    });
    statusSelect?.addEventListener('change', () => loadPage(1));
    for (const filter of [dateFromInput, dateToInput, classFilter]) filter?.addEventListener('change', () => loadPage(1));
    $('#attendance-quick-view')?.addEventListener('click', () => { state.attendanceMode = 'quick'; navigate('attendance'); });
    $('.pagination')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-page-action]');
      if (!button || button.disabled) return;
      const page = Number(displayedResult.page || 1) + (button.dataset.pageAction === 'next' ? 1 : -1);
      loadPage(Math.max(1, page));
    });
    $('#add-record')?.addEventListener('click', () => openRecordForm(resource));
    $('#export-csv')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.classList.add('is-loading');
      button.disabled = true;
      try {
        const totalPages = Math.max(1, Math.ceil(Number(displayedResult.total || 0) / Number(displayedResult.limit || 100)));
        const filters = filtersNow();
        const pages = await Promise.all(Array.from({ length: totalPages }, (_, index) => loadRecords(resource, true, index + 1, filters)));
        exportCsv(resource, pages.flatMap((page) => page.data || []), meta.columns);
      } catch (error) { toast(error.message, 'error'); }
      finally { button.classList.remove('is-loading'); button.disabled = false; }
    });
    $('#refresh-list')?.addEventListener('click', async () => {
      const button = $('#refresh-list'); button.classList.add('is-loading');
      const page = Number(displayedResult.page || 1);
      try { displayedResult = await loadRecords(resource, true, page, filtersNow()); updateRows(); toast('اطلاعات به‌روز شد.'); }
      catch (error) { toast(error.message, 'error'); }
      finally { button.classList.remove('is-loading'); }
    });
    $('#data-table-body')?.addEventListener('click', (event) => {
      const actionButton = event.target.closest('[data-action]');
      const row = event.target.closest('[data-row-id]');
      if (!row) return;
      const record = (displayedResult.data || []).find((item) => item.id === row.dataset.rowId);
      if (!record) return;
      if (actionButton?.dataset.action === 'delete') return confirmDelete(resource, record);
      if (actionButton?.dataset.action === 'edit') return openRecordForm(resource, record);
      if (resource === 'tickets') return openTicketDetail(record);
      openRecordDetail(resource, record);
    });
  }

  function exportCsv(resource, data, columns) {
    if (!data.length) return toast('موردی برای دریافت خروجی وجود ندارد.', 'warning');
    const lines = [columns.map((column) => csvEscape(column.label)).join(',')];
    data.forEach((record) => lines.push(columns.map((column) => {
      let value = record[column.key];
      if (column.key === 'classId') value = className(value);
      if (column.key === 'teacherId') value = teacherName(value);
      if (column.key === 'studentId') value = studentName(value);
      if (column.key === 'role') value = record.roleName || roleName(value);
      if (Array.isArray(value)) value = value.join('، ');
      return csvEscape(value ?? '');
    }).join(',')));
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${resource}-${new Date().toISOString().slice(0,10)}.csv`; link.click(); URL.revokeObjectURL(link.href);
    toast('خروجی CSV آماده شد.');
  }
  function csvEscape(value) { return `"${String(value).replace(/"/g, '""')}"`; }

  function renderSettings() {
    const settings = state.settings;
    const databaseText = document.documentElement.dataset.database || 'پیکربندی‌شده';
    const fields = [
      ['schoolName', 'نام رسمی مدرسه', settings.schoolName, true], ['schoolNameEn', 'نام لاتین مدرسه', settings.schoolNameEn, false],
      ['academicYear', 'سال تحصیلی جاری', settings.academicYear, false], ['phone', 'شماره تماس مدرسه', settings.phone, false],
      ['email', 'ایمیل مدرسه', settings.email, false], ['currency', 'واحد پول', settings.currency, false],
      ['address', 'نشانی مدرسه', settings.address, true], ['timezone', 'منطقهٔ زمانی IANA', settings.timezone || 'Asia/Tehran', false]
    ];
    return `<header class="page-heading"><div class="page-heading-with-icon"><span class="page-hero-icon">${icon('settings', 20)}</span><div class="page-heading-copy"><div class="page-kicker">${icon('sparkles', 12)} پیکربندی</div><h1>تنظیمات مدرسه</h1><p>اطلاعات پایه و مشخصات نمایش‌داده‌شده در سامانه را مدیریت کنید.</p></div></div></header><div class="settings-layout"><section class="panel settings-card"><div class="settings-card-header"><span class="panel-title-icon">${icon('school', 16)}</span><span><h2>مشخصات مدرسه</h2><p>این اطلاعات در سربرگ پنل و مکاتبات مدرسه استفاده می‌شود.</p></span></div><form id="settings-form"><div class="settings-form-grid">${fields.map(([name,label,value,wide]) => `<div class="form-field ${wide ? 'field-wide' : ''}"><label for="setting-${name}">${label}</label><input id="setting-${name}" name="${name}" value="${esc(value || '')}" ${name === 'email' ? 'type="email"' : ''} maxlength="${name === 'address' ? 240 : name === 'timezone' ? 80 : 120}" placeholder="${name === 'timezone' ? 'مثال: Asia/Tehran' : ''}"></div>`).join('')}</div><div class="form-actions"><span class="form-hint">تغییرات بلافاصله در پنل اعمال می‌شود.</span><button class="button button-primary" type="submit">${icon('check', 15)} ذخیره تغییرات</button></div></form></section><aside class="panel settings-aside-card"><div class="settings-card-header"><span class="panel-title-icon">${icon('shield-check', 16)}</span><span><h2>وضعیت سامانه</h2><p>اطلاعات نصب و نسخه فعلی</p></span></div><div class="settings-info-list"><div class="settings-info-row"><span>وضعیت نصب</span><b>${settings.installed ? 'راه‌اندازی شده' : 'حالت نمایشی'}</b></div><div class="settings-info-row"><span>نسخه سامانه</span><b>${esc(state.appVersion || APP_VERSION)}</b></div><div class="settings-info-row"><span>زبان و جهت</span><b>فارسی · راست‌چین</b></div><div class="settings-info-row"><span>فونت رابط کاربری</span><b>Vazirmatn</b></div><div class="settings-info-row"><span>حساب فعلی</span><b>${esc(roleName(state.user.role))}</b></div></div><div class="system-health">${icon('check', 17)}<span><b>همه سرویس‌ها فعال هستند</b><small>آخرین بررسی: همین لحظه</small></span></div></aside><section class="panel settings-aside-card"><div class="settings-card-header"><span class="panel-title-icon">${icon('modules', 16)}</span><span><h2>سامانه ماژولار</h2><p>بخش‌های موردنیاز مدرسه را فعال نگه دارید.</p></span></div><p class="form-hint">از بخش «مدیریت ماژول‌ها» می‌توانید قابلیت‌های مدرسه را روشن یا خاموش کنید؛ اطلاعات هر ماژول در فایل یا پایگاه داده سامانه باقی می‌ماند.</p><button class="button button-outline" type="button" data-quick-nav="modules" style="margin-top:14px">مدیریت ماژول‌ها ${icon('arrow-left', 14)}</button></section></div><section class="panel backup-management-card"><div class="settings-card-header"><span class="panel-title-icon">${icon('shield-check', 16)}</span><span><h2>پشتیبان‌گیری و بازیابی</h2><p>نسخهٔ امن خارج از پوشهٔ عمومی هاست نگهداری می‌شود.</p></span></div><div class="backup-management-grid"><div class="backup-action-block"><h3>ساخت / دریافت نسخهٔ پشتیبان</h3><p>پشتیبان شامل اطلاعات مدرسه و هش گذرواژه‌هاست؛ فایل را محرمانه نگه دارید.</p><div class="backup-controls"><button class="button button-primary" type="button" id="backup-create">${icon('plus', 14)} ساخت نسخهٔ جدید</button><select id="backup-select" aria-label="انتخاب نسخهٔ پشتیبان"><option value="">در حال دریافت فهرست…</option></select><button class="button button-outline" type="button" id="backup-download">${icon('download', 14)} دانلود</button></div></div><div class="backup-action-block backup-restore-block"><h3>بازیابی از فایل JSON</h3><p>بازیابی داده‌های فعلی را جایگزین می‌کند و نشست همهٔ کاربران را می‌بندد؛ پیش از آن نسخهٔ ایمنی ساخته می‌شود.</p><div class="backup-controls backup-restore-controls"><input id="backup-upload" type="file" accept=".json,application/json" aria-label="انتخاب فایل پشتیبان"><input id="backup-password" type="password" autocomplete="current-password" placeholder="گذرواژه فعلی مدیر" aria-label="گذرواژه فعلی مدیر"><button class="button button-danger" type="button" id="backup-restore">${icon('audit', 14)} بازیابی</button></div></div></div><small class="backup-security-note">پشتیبان‌گیری خودکار روزانه روی سرور فعال است؛ نسخه‌های ۱۴ روز اخیر نگهداری می‌شوند. برای حفاظت در برابر خرابی کامل هاست، نسخه‌ای را نیز خارج از هاست نگه دارید.</small></section>`;
  }

  function bindSettings() {
    $('#settings-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const payload = Object.fromEntries(form.entries());
      const button = event.currentTarget.querySelector('button[type=submit]');
      button.disabled = true;
      try {
        const result = await request('/api/settings', { method: 'PATCH', body: JSON.stringify(payload) });
        state.settings = result.settings;
        $('#school-name-side').textContent = result.settings.schoolName;
        $('#school-avatar').textContent = firstGlyph(result.settings.schoolName);
        $('#school-year-side').textContent = result.settings.academicYear;
        toast(result.message || 'تنظیمات ذخیره شد.');
      } catch (error) { toast(error.message, 'error'); }
      finally { button.disabled = false; }
    });
    const backupSelect = $('#backup-select');
    const loadBackups = async () => {
      if (!backupSelect) return;
      const result = await request('/api/admin/backups');
      backupSelect.innerHTML = result.data.length
        ? `<option value=\"\">انتخاب نسخهٔ پشتیبان…</option>${result.data.map((item) => `<option value=\"${esc(item.filename)}\">${esc(fmtDateTime(item.createdAt))} · ${esc(item.reason)} · ${faNumber(Math.ceil(item.bytes / 1024))} کیلوبایت</option>`).join('')}`
        : '<option value=\"\">هنوز نسخه‌ای ساخته نشده است</option>';
    };
    loadBackups().catch((error) => { if (backupSelect) backupSelect.innerHTML = '<option value=\"\">دریافت فهرست ناموفق بود</option>'; toast(error.message, 'error'); });
    $('#backup-create')?.addEventListener('click', async (event) => {
      const button = event.currentTarget; button.disabled = true;
      try { const result = await request('/api/admin/backups', { method: 'POST', body: '{}' }); toast(result.message); await loadBackups(); if (backupSelect) backupSelect.value = result.data.filename; }
      catch (error) { toast(error.message, 'error'); }
      finally { button.disabled = false; }
    });
    $('#backup-download')?.addEventListener('click', async (event) => {
      const filename = backupSelect?.value;
      if (!filename) return toast('ابتدا یک نسخهٔ پشتیبان انتخاب کنید.', 'warning');
      const button = event.currentTarget; button.disabled = true;
      try {
        const response = await fetch(`/api/admin/backups/${encodeURIComponent(filename)}`, { headers: state.demoSessionToken ? { 'X-Demo-Session': state.demoSessionToken } : {}, credentials: 'same-origin', cache: 'no-store' });
        if (!response.ok) { let data = {}; try { data = await response.json(); } catch {} throw new Error(data.error || 'دریافت فایل پشتیبان ناموفق بود.'); }
        const blob = await response.blob();
        const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = filename; link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      } catch (error) { toast(error.message, 'error'); }
      finally { button.disabled = false; }
    });
    $('#backup-restore')?.addEventListener('click', async (event) => {
      const file = $('#backup-upload')?.files?.[0];
      const currentPassword = $('#backup-password')?.value || '';
      if (!file) return toast('فایل پشتیبان JSON را انتخاب کنید.', 'warning');
      if (file.size > 25 * 1024 * 1024) return toast('حجم فایل پشتیبان بیشتر از ۲۵ مگابایت است.', 'warning');
      if (!currentPassword) return toast('برای تأیید هویت، گذرواژه فعلی مدیر را وارد کنید.', 'warning');
      if (!window.confirm('با بازیابی، اطلاعات فعلی جایگزین می‌شود. ادامه می‌دهید؟')) return;
      const button = event.currentTarget; button.disabled = true;
      try {
        const backup = JSON.parse(await file.text());
        const result = await request('/api/admin/restore', { method: 'POST', body: JSON.stringify({ currentPassword, backup }) });
        toast(result.message || 'اطلاعات بازیابی شد.');
        setDemoSessionToken('');
        await boot();
      } catch (error) { toast(error.message.includes('JSON') ? 'فایل انتخاب‌شده JSON معتبر نیست.' : error.message, 'error'); }
      finally { button.disabled = false; }
    });
  }

  function renderRolePermissions(roles) {
    const editableRoles = (roles || []).filter((role) => role.id !== 'admin' && (['teacher', 'student', 'parent'].includes(role.id) || role.isCustom));
    const cards = editableRoles.map((role) => {
      const availableModules = state.modules.filter((module) => role.isCustom
        ? !CUSTOM_ROLE_RESERVED_MODULES.has(module.id)
        : module.roles.includes(role.id));
      const groups = new Map();
      for (const module of availableModules) {
        if (!groups.has(module.group)) groups.set(module.group, []);
        groups.get(module.group).push(module);
      }
      const rows = GROUP_ORDER.filter((group) => groups.has(group)).map((group) => `<section class="role-module-group"><h3>${esc(group)}</h3>${groups.get(group).map((module) => {
        const mayConfigureResource = Boolean(PAGE_META[module.id] && (role.isCustom ? !CUSTOM_ROLE_RESERVED_MODULES.has(module.id) : (ROLE_READABLE[role.id] || []).includes(module.id)));
        const mayConfigureWrite = role.isCustom ? (role.scope === 'classes' ? CUSTOM_ROLE_CLASS_WRITABLE.includes(module.id) : CUSTOM_ROLE_WRITABLE.includes(module.id)) : (ROLE_WRITABLE[role.id] || []).includes(module.id);
        const canRead = (role.readResources || []).includes(module.id);
        const canWrite = (role.writeResources || []).includes(module.id);
        return `<div class="role-permission-row"><span class="role-permission-title"><b>${esc(module.title)}</b><small>${esc(module.description)}</small></span><label class="role-checkbox"><input type="checkbox" data-role-module="${esc(module.id)}" ${role.moduleIds?.includes(module.id) ? 'checked' : ''} ${module.id === 'dashboard' ? 'disabled' : ''}><span>نمایش در منو</span></label>${mayConfigureResource ? `<label class="role-checkbox"><input type="checkbox" data-role-read="${esc(module.id)}" ${canRead ? 'checked' : ''}><span>مشاهدهٔ داده</span></label>` : `<span class="role-permission-locked">بدون داده</span>`}${mayConfigureWrite ? `<label class="role-checkbox"><input type="checkbox" data-role-write="${esc(module.id)}" ${canWrite ? 'checked' : ''}><span>ثبت / ویرایش</span></label>` : `<span class="role-permission-locked">فقط مشاهده</span>`}</div>`;
      }).join('')}</section>`).join('');
      const customEditor = role.isCustom ? `<div class="role-custom-meta"><label>نام نقش<input type="text" maxlength="80" data-role-name value="${esc(role.name)}"></label><label>محدودهٔ داده<select data-role-scope><option value="school" ${role.scope === 'school' ? 'selected' : ''}>کل مدرسه</option><option value="classes" ${role.scope === 'classes' ? 'selected' : ''}>فقط کلاس‌های واگذارشده</option></select></label></div>` : '';
      return `<article class="panel role-permission-card" data-role-card="${esc(role.id)}"><header class="role-card-heading"><span class="role-card-icon">${icon(role.id === 'teacher' ? 'teacher' : role.id === 'student' ? 'student' : role.id === 'parent' ? 'parents' : 'roles', 18)}</span><span class="role-card-heading-copy"><h2>${esc(role.name)}</h2><p>${esc(role.description || 'دسترسی پایه را برای این نقش تنظیم کنید.')} · ${faNumber(role.users || 0)} حساب</p></span>${role.isCustom ? `<button type="button" class="button button-outline button-small role-delete-button" data-role-delete="${esc(role.id)}">حذف نقش</button>` : ''}<button type="button" class="button button-primary button-small role-save-button" data-role-save="${esc(role.id)}">${icon('check', 14)} ذخیرهٔ دسترسی</button></header>${customEditor}<div class="role-permission-legend"><span>منو</span><span>مجوز مشاهده</span><span>مجوز نوشتن</span></div>${rows}</article>`;
    }).join('');
    return `<header class="page-heading"><div class="page-heading-with-icon"><span class="page-hero-icon">${icon('roles', 20)}</span><div class="page-heading-copy"><div class="page-kicker">${icon('shield-check', 12)} کنترل دسترسی</div><h1>نقش‌ها و دسترسی‌ها</h1><p>نقش‌های پیش‌فرض را تنظیم کنید یا برای مسئولیت‌های تازه، نقش سفارشی و محدودیت داده تعریف کنید.</p></div></div><div class="page-heading-actions"><button type="button" class="button button-primary" data-role-create>${icon('plus', 15)} تعریف نقش سفارشی</button></div></div></header><div class="role-admin-notice">${icon('shield-check', 16)}<span>مدیر و بخش‌های حساس سیستم قفل هستند. نقش سفارشی فقط به ماژول‌ها و داده‌هایی دسترسی می‌گیرد که مدیر صریحاً مجاز کند؛ محدودهٔ آن می‌تواند کل مدرسه یا کلاس‌های واگذارشده باشد.</span></div>${cards || renderEmpty('roles', 'نقشی برای تنظیم وجود ندارد', 'فهرست نقش‌های پیش‌فرض را در تنظیمات سامانه بررسی کنید.')}`;
  }

  function bindRolePermissions() {
    const content = $('#page-content');
    content.onchange = (event) => {
      const card = event.target.closest('[data-role-card]');
      if (!card) return;
      const moduleId = event.target.dataset.roleWrite || event.target.dataset.roleRead || event.target.dataset.roleModule;
      if (!moduleId) return;
      const read = card.querySelector(`[data-role-read="${CSS.escape(moduleId)}"]`);
      const write = card.querySelector(`[data-role-write="${CSS.escape(moduleId)}"]`);
      const module = card.querySelector(`[data-role-module="${CSS.escape(moduleId)}"]`);
      if (event.target.matches('[data-role-write]') && event.target.checked) {
        if (read) read.checked = true;
        if (module) module.checked = true;
      }
      if (event.target.matches('[data-role-read]') && !event.target.checked && write) write.checked = false;
      if (event.target.matches('[data-role-module]') && !event.target.checked) {
        if (read) read.checked = false;
        if (write) write.checked = false;
      }
    };
    content.onclick = async (event) => {
      const createButton = event.target.closest('[data-role-create]');
      if (createButton) return openCustomRoleForm();
      const deleteButton = event.target.closest('[data-role-delete]');
      if (deleteButton) {
        const roleId = deleteButton.dataset.roleDelete;
        if (!window.confirm('این نقش حذف شود؟ نقش دارای حساب کاربری حذف نمی‌شود.')) return;
        deleteButton.disabled = true;
        try {
          const result = await request(`/api/roles/${encodeURIComponent(roleId)}`, { method: 'DELETE' });
          delete state.cache.roles;
          toast(result.message || 'نقش حذف شد.');
          const refreshed = await loadAllRecords('roles', true);
          $('#page-content').innerHTML = renderRolePermissions(refreshed.data || []);
          bindRolePermissions();
        } catch (error) { toast(error.message, 'error'); deleteButton.disabled = false; }
        return;
      }
      const button = event.target.closest('[data-role-save]');
      if (!button) return;
      const card = button.closest('[data-role-card]');
      const roleId = button.dataset.roleSave;
      const moduleIds = [...card.querySelectorAll('[data-role-module]:checked')].map((input) => input.dataset.roleModule);
      const readResources = [...card.querySelectorAll('[data-role-read]:checked')].map((input) => input.dataset.roleRead);
      let writeResources = [...card.querySelectorAll('[data-role-write]:checked')].map((input) => input.dataset.roleWrite);
      const payload = { moduleIds, readResources, writeResources };
      if (card.querySelector('[data-role-name]')) {
        payload.name = card.querySelector('[data-role-name]').value.trim();
        payload.description = (state.cache.roles?.data || []).find((role) => role.id === roleId)?.description || '';
        payload.scope = card.querySelector('[data-role-scope]').value;
        if (payload.scope === 'classes') {
          const scoped = writeResources.filter((resource) => CUSTOM_ROLE_CLASS_WRITABLE.includes(resource));
          if (scoped.length !== writeResources.length) toast('با محدودکردن نقش به کلاس‌ها، مجوزهای سراسری حذف می‌شوند.', 'warning');
          writeResources = scoped;
          payload.writeResources = scoped;
        }
      }
      button.disabled = true;
      try {
        const result = await request(`/api/roles/${encodeURIComponent(roleId)}`, { method: 'PATCH', body: JSON.stringify(payload) });
        const cached = state.cache.roles;
        if (cached) cached.data = cached.data.map((role) => role.id === roleId ? result.data : role);
        toast(result.message || 'دسترسی‌ها ذخیره شد.');
        await refreshBootstrap(false);
        const refreshed = await loadAllRecords('roles', true);
        $('#page-content').innerHTML = renderRolePermissions(refreshed.data || []);
        bindRolePermissions();
      } catch (error) { toast(error.message, 'error'); button.disabled = false; }
    };
  }

  function openCustomRoleForm() {
    openModal(`<form id="custom-role-form"><div class="modal-head"><div class="modal-head-main"><span class="modal-head-icon">${icon('roles', 18)}</span><span><h2>تعریف نقش سفارشی</h2><p>مثل معاون، مسئول ثبت‌نام یا حسابدار؛ دسترسی‌ها بعداً دقیق تنظیم می‌شوند.</p></span></div><button type="button" class="modal-close" data-close-modal aria-label="بستن">${icon('close', 16)}</button></div><div class="modal-body"><div class="modal-form-grid"><div class="modal-field"><label for="custom-role-name">نام نقش <i>*</i></label><input id="custom-role-name" name="name" maxlength="80" required placeholder="مثلاً مسئول ثبت‌نام"></div><div class="modal-field"><label for="custom-role-description">توضیح</label><input id="custom-role-description" name="description" maxlength="240" placeholder="مسئولیت‌ها و حدود دسترسی"></div><div class="modal-field field-wide"><label for="custom-role-scope">محدودهٔ اطلاعات</label><select id="custom-role-scope" name="scope"><option value="school">کل مدرسه (فقط ماژول‌های انتخاب‌شده)</option><option value="classes">فقط کلاس‌هایی که به حساب کاربر واگذار می‌شوند</option></select><small class="field-help">نقش جدید در ابتدا فقط داشبورد را می‌بیند؛ مدیر باید دسترسی داده و ماژول‌ها را جداگانه فعال کند.</small></div></div></div><div class="modal-foot"><span class="modal-note">دسترسی مدیر و ابزارهای حساس قابل واگذاری نیست.</span><div class="modal-foot-right"><button type="button" class="button button-outline" data-close-modal>انصراف</button><button type="submit" class="button button-primary">${icon('plus', 14)} ساخت نقش</button></div></div></form>`, 'modal-wide');
    $('#custom-role-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const submit = form.querySelector('[type=submit]');
      submit.disabled = true;
      const payload = { name: form.elements.name.value.trim(), description: form.elements.description.value.trim(), scope: form.elements.scope.value, moduleIds: ['dashboard'], readResources: [], writeResources: [] };
      try {
        const result = await request('/api/roles', { method: 'POST', body: JSON.stringify(payload) });
        closeModal();
        toast(result.message || 'نقش سفارشی ساخته شد.');
        delete state.cache.roles;
        const refreshed = await loadAllRecords('roles', true);
        $('#page-content').innerHTML = renderRolePermissions(refreshed.data || []);
        bindRolePermissions();
      } catch (error) { toast(error.message, 'error'); submit.disabled = false; }
    });
  }

  function renderModules() {
    const groups = new Map();
    state.modules.forEach((module) => { if (!groups.has(module.group)) groups.set(module.group, []); groups.get(module.group).push(module); });
    const enabledCount = state.modules.filter((item) => item.enabled !== false).length;
    return `<header class="page-heading"><div class="page-heading-with-icon"><span class="page-hero-icon">${icon('modules', 20)}</span><div class="page-heading-copy"><div class="page-kicker">${icon('sparkles', 12)} تنظیم تجربه مدرسه</div><h1>مدیریت ماژول‌ها</h1><p>قابلیت‌های موردنیاز مدرسه را فعال یا غیرفعال کنید؛ بخش‌های اصلی سامانه همیشه در دسترس هستند.</p></div></div></header><div class="module-summary"><span class="module-summary-icon">${icon('modules', 21)}</span><div class="module-summary-copy"><b>یک سامانه، متناسب با مدرسه شما</b><p>ماژول‌های خاموش از منو پنهان می‌شوند و هر زمان بخواهید می‌توانید دوباره آن‌ها را فعال کنید.</p></div><span class="module-summary-count"><b>${faNumber(enabledCount)}</b><small>ماژول فعال</small></span></div>${GROUP_ORDER.filter((group) => groups.has(group)).map((group) => `<section class="feature-group"><h2 class="feature-group-heading">${esc(group)}</h2><div class="feature-grid">${groups.get(group).map((module) => `<article class="feature-card"><span class="feature-icon">${icon(module.icon, 19)}</span><span class="feature-card-copy"><b>${esc(module.title)}</b><small>${esc(module.description)}</small></span><span class="feature-card-status"><button class="switch ${module.enabled !== false ? 'is-on' : ''}" type="button" role="switch" aria-checked="${module.enabled !== false}" aria-label="${module.enabled === false ? 'فعال کردن' : 'غیرفعال کردن'} ${esc(module.title)}" data-module-toggle="${esc(module.id)}" ${module.locked ? 'disabled' : ''}><i></i></button><span>${module.locked ? 'اصلی' : module.enabled !== false ? 'فعال' : 'خاموش'}</span></span></article>`).join('')}</div></section>`).join('')}`;
  }

  function bindModules() {
    $('#page-content').onclick = async (event) => {
      const button = event.target.closest('[data-module-toggle]');
      if (!button || button.disabled) return;
      const id = button.dataset.moduleToggle;
      const module = getModule(id);
      try {
        const result = await request(`/api/modules/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ enabled: module.enabled === false }) });
        module.enabled = result.module.enabled;
        toast(result.message);
        await refreshBootstrap(false);
        $('#page-content').innerHTML = renderModules();
      } catch (error) { toast(error.message, 'error'); }
    };
  }

  function renderReports() {
    const d = state.dashboard;
    const counts = d.counts || {};
    const classRows = d.classDistribution || [];
    const ticketRows = state.cache.tickets?.data || [];
    const financeRows = state.cache.finance?.data || [];
    const paidFinance = financeRows.filter((row) => row.status === 'پرداخت‌شده');
    const ticketTotal = Number(counts.ticketTotal ?? ticketRows.length);
    const financeTotal = Number(counts.financeTotal ?? financeRows.length);
    const financePaid = Number(counts.financePaid ?? paidFinance.length);
    const totalCapacity = classRows.reduce((sum, item) => {
      const record = (state.cache.classes?.data || []).find((row) => row.id === item.id);
      return sum + Number(item.capacity ?? record?.capacity ?? 0);
    }, 0);
    const items = [
      { module: 'students', title: 'پرونده دانش‌آموزان', desc: 'وضعیت ثبت‌نام و کلاس‌بندی', value: counts.students || 0, unit: 'دانش‌آموز', percent: totalCapacity ? Math.round((counts.students || 0) * 100 / totalCapacity) : 0, icon: 'student', foot: 'کلاس‌های فعال', footValue: faNumber(counts.classes || 0) },
      { module: 'attendance', title: 'حضور و غیاب روزانه', desc: 'درصد حضور امروز در مدرسه', value: `${counts.attendanceRate || 0}٪`, unit: 'نرخ حضور', percent: counts.attendanceRate || 0, icon: 'attendance', foot: 'حاضر امروز', footValue: faNumber(counts.present || 0) },
      { module: 'tickets', title: 'درخواست‌های ارتباطی', desc: 'تیکت‌های نیازمند پیگیری', value: counts.openTickets || 0, unit: 'تیکت باز', percent: ticketTotal ? Math.round((counts.openTickets || 0) * 100 / ticketTotal) : 0, icon: 'tickets', foot: 'کل تیکت‌ها', footValue: faNumber(ticketTotal) },
      { module: 'finance', title: 'پیگیری امور مالی', desc: 'اقساط شهریه و پرداخت‌ها', value: counts.financePending || 0, unit: 'پرداخت معوق', percent: financeTotal ? Math.round(financePaid * 100 / financeTotal) : 0, icon: 'finance', foot: 'پرداخت‌شده', footValue: `${faNumber(financePaid)} از ${faNumber(financeTotal)}` }
    ].filter((item) => moduleAvailable(item.module));
    return `<header class="page-heading"><div class="page-heading-with-icon"><span class="page-hero-icon">${icon('reports', 20)}</span><div class="page-heading-copy"><div class="page-kicker">${icon('sparkles', 12)} نمای مدیریتی</div><h1>گزارش‌های مدرسه</h1><p>خلاصه شاخص‌های مهم آموزشی و اجرایی برای تصمیم‌گیری سریع.</p></div></div><div class="page-heading-actions"><button class="button button-outline" id="reports-refresh">${icon('audit', 15)} <span class="button-label">به‌روزرسانی گزارش</span></button></div></header><div class="report-grid">${items.map((item) => `<article class="panel report-card"><div class="report-card-head"><span><h3>${esc(item.title)}</h3><p>${esc(item.desc)}</p></span><span class="report-icon">${icon(item.icon, 17)}</span></div><div class="report-kpi"><b>${typeof item.value === 'number' ? faNumber(item.value) : esc(item.value)}</b><small>${esc(item.unit)}</small></div><div class="report-progress"><i style="width:${Math.min(100,Math.max(4,item.percent))}%"></i></div><div class="report-footer"><span>${esc(item.foot)}</span><b>${esc(item.footValue)}</b></div></article>`).join('')}</div><section class="panel" style="margin-top:14px"><div class="panel-header"><div class="panel-title"><span class="panel-title-icon">${icon('classes', 16)}</span><span><h2>توزیع دانش‌آموزان در کلاس‌ها</h2><p>ظرفیت و تعداد دانش‌آموز هر کلاس</p></span></div></div><div class="data-table-wrap"><table class="data-table"><thead><tr><th>نام کلاس</th><th>پایه</th><th>دانش‌آموزان</th><th>ظرفیت</th><th>میزان تکمیل ظرفیت</th></tr></thead><tbody>${classRows.map((item) => { const record = (state.cache.classes?.data || []).find((row) => row.id === item.id) || {}; const count = Number(item.count || 0); const capacity = Number(item.capacity ?? record.capacity ?? Math.max(30,count)); const rate = Math.min(100, Math.round(count * 100 / Math.max(1,capacity))); return `<tr><td>${esc(item.name)}</td><td>${esc(item.grade)}</td><td>${faNumber(count)}</td><td>${faNumber(capacity)}</td><td><span class="report-progress" style="display:inline-block;width:120px;vertical-align:middle;margin:0 0 0 8px"><i style="width:${rate}%"></i></span>${faNumber(rate)}٪</td></tr>`; }).join('')}</tbody></table></div></section>`;
  }

  function bindReports() {
    $('#reports-refresh')?.addEventListener('click', async () => {
      const resources = ['classes', 'tickets', ...(moduleAvailable('finance') ? ['finance'] : [])];
      await refreshBootstrap(false);
      await Promise.all(resources.map((resource) => loadRecords(resource, true).catch(() => null)));
      await navigate('reports');
      toast('گزارش‌ها به‌روز شدند.');
    });
  }

  async function refreshBootstrap(redraw = true) {
    const result = await request('/api/bootstrap');
    Object.assign(state, { user: result.user, settings: result.settings, modules: result.modules, dashboard: result.dashboard, demoMode: result.demoMode });
    updateNotificationState(result.unreadTickets);
    buildSidebar();
    if (redraw) await navigate(state.page);
    return result;
  }

  function bindDashboard() {
    $('#page-content').onclick = async (event) => {
      const stat = event.target.closest('[data-stat-nav]');
      if (stat && getModule(stat.dataset.statNav)) return navigate(stat.dataset.statNav);
      const ticket = event.target.closest('[data-ticket-id]');
      if (ticket) {
        try { const data = await loadRecords('tickets', true); const row = data.data.find((item) => item.id === ticket.dataset.ticketId); if (row) openTicketDetail(row); }
        catch (error) { toast(error.message, 'error'); }
      }
    };
  }

  function getOptions(field) {
    if (field.options) return field.options.map((option) => typeof option === 'string' ? { value: option, label: option } : option);
    const records = state.cache[field.source]?.data || [];
    if (field.source === 'classes') return records.map((item) => ({ value: item.id, label: `${item.name}${item.grade ? ` · ${item.grade}` : ''}` }));
    if (field.source === 'teachers') return records.map((item) => ({ value: item.id, label: item.name }));
    if (field.source === 'students') return records.map((item) => ({ value: item.id, label: `${item.name}${item.studentNo ? ` · ${item.studentNo}` : ''}` }));
    return records.map((item) => ({ value: item.id, label: item.name || item.title || item.id }));
  }

  function buildFormField(resource, field, record = {}) {
    if (field.adminOnly && state.user.role !== 'admin') return '';
    const value = record[field.name] ?? (field.name === 'status' ? ({ students: 'فعال', teachers: 'فعال', classes: 'فعال', attendance: 'حاضر', tickets: 'باز' }[resource] || '') : field.name === 'date' && field.type === 'date' ? schoolDateISO() : '');
    const required = field.required ? 'required' : '';
    let control;
    if (field.type === 'select' || field.type === 'select-multiple') {
      const options = getOptions(field);
      const selected = Array.isArray(value) ? value.map(String) : [String(value || '')];
      const multiple = field.type === 'select-multiple';
      control = `<select name="${esc(field.name)}" ${multiple ? 'multiple size="4"' : ''} ${required}><option value="">${multiple ? 'برای انتخاب چند مورد، کلید Ctrl را نگه دارید' : 'انتخاب کنید'}</option>${options.map((option) => `<option value="${esc(option.value)}" ${selected.includes(String(option.value)) ? 'selected' : ''}>${esc(option.label)}</option>`).join('')}</select>`;
    } else if (field.type === 'textarea') {
      control = `<textarea name="${esc(field.name)}" placeholder="${esc(field.placeholder || '')}" ${required}>${esc(value)}</textarea>`;
    } else {
      const type = field.type || 'text';
      const val = type === 'password' ? '' : value;
      control = `<input type="${esc(type)}" name="${esc(field.name)}" value="${esc(val)}" placeholder="${esc(field.placeholder || '')}" ${field.direction === 'ltr' ? 'dir="ltr"' : ''} ${required} ${type === 'number' ? 'step="any"' : ''}>`;
    }
    const associationClass = field.roleAssociation ? ` role-association-field role-association-${esc(field.roleAssociation)}` : '';
    return `<div class="modal-field ${field.wide ? 'field-wide' : ''}${associationClass}"><label for="field-${esc(field.name)}">${esc(field.label)}${field.required ? ' <i>*</i>' : ''}</label>${control}</div>`;
  }

  async function ensureSourceData(fields) {
    const sources = [...new Set(fields.filter((item) => item.source).map((item) => item.source))];
    await Promise.all(sources.map((resource) => loadAllRecords(resource, true).catch(() => ({ data: [] }))));
  }

  async function openRecordForm(resource, record = null) {
    let fields = FORM_FIELDS[resource];
    if (!fields) return toast('فرم این بخش آماده نیست.', 'warning');
    const modulePermissions = getModule(resource)?.permissions || {};
    if (record && !modulePermissions.canUpdate) return toast('اجازه ویرایش این بخش را ندارید.', 'warning');
    if (!record && !modulePermissions.canCreate) return toast('اجازه افزودن در این بخش را ندارید.', 'warning');
    if (resource === 'tickets' && (state.user.role === 'student' || state.user.role === 'parent')) fields = fields.filter((field) => !field.adminOnly);
    if (record && ['students', 'teachers'].includes(resource)) fields = fields.filter((field) => !['accountUsername', 'accountPassword'].includes(field.name));
    if (record && state.user.role === 'teacher') {
      const teacherFields = {
        attendance: ['status', 'time', 'note'], assignments: ['title', 'subject', 'dueDate', 'status', 'description'],
        exams: ['title', 'subject', 'date', 'time', 'room', 'status'], grades: ['subject', 'exam', 'score', 'maxScore', 'date'],
        notices: ['title', 'category', 'audience', 'publishDate', 'status', 'body'], messages: ['title', 'to', 'channel', 'sentAt', 'status'],
        documents: ['title', 'category', 'audience', 'fileType', 'updatedAt', 'status']
      };
      if (teacherFields[resource]) fields = fields.filter((field) => teacherFields[resource].includes(field.name));
    }
    if (record && resource === 'users') fields = fields.filter((field) => field.name !== 'username').map((field) => field.name === 'password' ? { ...field, required: false, label: 'گذرواژه جدید (اختیاری)', placeholder: 'برای حفظ گذرواژه خالی بگذارید' } : field);
    await ensureSourceData(fields);
    const title = record ? `ویرایش ${PAGE_META[resource]?.singular || 'مورد'}` : `افزودن ${PAGE_META[resource]?.singular || 'مورد جدید'}`;
    const help = resource === 'students' && !record ? 'در صورت تکمیل هر دو فیلد حساب، دسترسی پنل دانش‌آموز نیز ساخته می‌شود.' : resource === 'teachers' && !record ? 'می‌توانید هم‌زمان حساب معلم را ایجاد و کلاس‌های مسئولیت را مشخص کنید.' : 'فیلدهای ستاره‌دار ضروری هستند.';
    const formBody = `<form id="record-form" data-resource="${esc(resource)}" data-record-id="${record ? esc(record.id) : ''}"><div class="modal-head"><div class="modal-head-main"><span class="modal-head-icon">${icon(PAGE_META[resource]?.icon || 'documents', 18)}</span><span><h2 id="modal-title">${esc(title)}</h2><p>${record ? 'تغییرات پرونده را بررسی و ذخیره کنید.' : 'اطلاعات موردنیاز را در فرم زیر وارد کنید.'}</p></span></div><button type="button" class="modal-close" data-close-modal aria-label="بستن">${icon('close', 16)}</button></div><div class="modal-body"><div class="modal-form-grid">${fields.map((field) => buildFormField(resource, field, record || {})).join('')}</div></div><div class="modal-foot"><span class="modal-note">${esc(help)}</span><div class="modal-foot-right"><button type="button" class="button button-outline" data-close-modal>انصراف</button><button type="submit" class="button button-primary">${icon('check', 15)} ذخیره اطلاعات</button></div></div></form>`;
    openModal(formBody, 'modal-wide');
    if (resource === 'users') {
      const userForm = $('#record-form');
      const roleSelect = userForm.elements.namedItem('role');
      const updateRoleAssociations = () => {
        for (const role of ['student', 'teacher', 'parent']) {
          const field = $(`.role-association-${role}`, userForm);
          const select = field?.querySelector('select');
          if (!field || !select) continue;
          field.hidden = roleSelect.value !== role;
          select.required = roleSelect.value === role;
        }
        const customField = $('.role-association-custom', userForm);
        const customSelect = customField?.querySelector('select');
        const customRole = (state.cache.roles?.data || []).find((entry) => entry.id === roleSelect.value && entry.isCustom);
        const needsClasses = Boolean(customRole && customRole.scope === 'classes');
        if (customField && customSelect) {
          customField.hidden = !needsClasses;
          customSelect.required = needsClasses;
          if (!needsClasses) [...customSelect.options].forEach((option) => { option.selected = false; });
        }
      };
      roleSelect?.addEventListener('change', updateRoleAssociations);
      updateRoleAssociations();
    }
    $('#record-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const submit = form.querySelector('button[type=submit]');
      const payload = {};
      for (const field of fields) {
        const input = form.elements.namedItem(field.name);
        if (!input) continue;
        if (field.type === 'select-multiple') payload[field.name] = [...input.selectedOptions].map((option) => option.value).filter(Boolean);
        else if (field.type === 'number') payload[field.name] = input.value ? Number(input.value) : '';
        else payload[field.name] = input.value.trim();
      }
      if (resource === 'attendance' && payload.studentId) {
        const student = (state.cache.students?.data || []).find((item) => item.id === payload.studentId);
        if (student) { payload.studentName = student.name; if (!payload.classId) payload.classId = student.classId; }
      }
      if (resource === 'grades' && payload.studentId) {
        const student = (state.cache.students?.data || []).find((item) => item.id === payload.studentId);
        if (student) { payload.studentName = student.name; payload.classId ||= student.classId; }
      }
      if (resource === 'finance' && payload.studentId) payload.studentName = studentName(payload.studentId);
      submit.disabled = true;
      try {
        const id = form.dataset.recordId;
        const result = await request(id ? `/api/records/${resource}/${encodeURIComponent(id)}` : `/api/records/${resource}`, { method: id ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
        closeModal();
        toast(result.message || 'اطلاعات ذخیره شد.');
        delete state.cache[resource];
        await refreshBootstrap(false);
        await navigate(resource);
      } catch (error) { toast(error.message, 'error'); submit.disabled = false; }
    });
  }

  function openModal(content, widthClass = '') {
    const card = $('#modal-card');
    card.onclick = null;
    card.className = `modal-card ${widthClass}`;
    card.innerHTML = content;
    $('#modal-layer').hidden = false;
    document.body.classList.add('modal-open');
    window.hydrateIcons(card);
    const first = $('input:not([type=hidden]),select,textarea,button', card);
    setTimeout(() => first?.focus({ preventScroll: true }), 30);
  }
  function closeModal() {
    $('#modal-layer').hidden = true;
    $('#modal-card').innerHTML = '';
    document.body.classList.remove('modal-open');
  }

  function openRecordDetail(resource, record) {
    if (resource === 'tickets') return openTicketDetail(record);
    const fieldsByResource = {
      students: [
        ['شماره دانش‌آموزی', 'studentNo'], ['پایه و کلاس', 'classId'], ['تاریخ تولد', 'birthDate'], ['جنسیت', 'gender'], ['شماره تماس دانش‌آموز', 'phone'], ['تاریخ ثبت‌نام', 'enrollmentDate'],
        ['نام ولی / سرپرست', 'guardianName'], ['نسبت با دانش‌آموز', 'guardianRelation'], ['شماره تماس ولی', 'guardianPhone'], ['شماره تماس اضطراری', 'emergencyContact'], ['نشانی محل سکونت', 'address'], ['نکات سلامت', 'healthNotes']
      ],
      teachers: [['کد پرسنلی', 'teacherNo'], ['تخصص', 'subject'], ['مدرک تحصیلی', 'degree'], ['شماره تماس', 'phone'], ['ایمیل', 'email'], ['کلاس‌های مسئولیت', 'classIds'], ['وضعیت', 'status']],
      classes: [['پایه تحصیلی', 'grade'], ['معلم مسئول', 'teacherId'], ['شماره اتاق', 'room'], ['ظرفیت', 'capacity'], ['تعداد دانش‌آموز فعلی', 'studentCount'], ['نوبت آموزشی', 'shift'], ['وضعیت کلاس', 'status']],
      parents: [['نسبت', 'relation'], ['شماره تماس', 'phone'], ['ایمیل', 'email'], ['دانش‌آموزان مرتبط', 'studentIds'], ['وضعیت', 'status']],
      attendance: [['دانش‌آموز', 'studentName'], ['کلاس', 'classId'], ['تاریخ', 'date'], ['ساعت ورود', 'time'], ['وضعیت', 'status'], ['توضیحات', 'note']],
      grades: [['دانش‌آموز', 'studentName'], ['کلاس', 'classId'], ['درس', 'subject'], ['عنوان ارزشیابی', 'exam'], ['نمره', 'score'], ['از', 'maxScore'], ['تاریخ', 'date']],
      assignments: [['درس', 'subject'], ['کلاس', 'classId'], ['مهلت تحویل', 'dueDate'], ['وضعیت', 'status'], ['شرح تکلیف', 'description']],
      exams: [['درس', 'subject'], ['کلاس', 'classId'], ['تاریخ', 'date'], ['ساعت', 'time'], ['اتاق', 'room'], ['وضعیت', 'status']],
      tickets: [['موضوع', 'subject'], ['دانش‌آموز', 'studentName'], ['دسته‌بندی', 'category'], ['اولویت', 'priority'], ['وضعیت', 'status']],
      users: [['نام کاربری', 'username'], ['نقش', 'role'], ['شماره تماس', 'phone'], ['وضعیت حساب', 'status'], ['تاریخ ایجاد', 'createdAt']],
      finance: [['دانش‌آموز', 'studentName'], ['عنوان', 'title'], ['مبلغ', 'amount'], ['سررسید', 'dueDate'], ['تاریخ پرداخت', 'paidAt'], ['روش', 'method'], ['وضعیت', 'status']],
      subjects: [['کد درس', 'code'], ['پایه', 'grade'], ['معلم', 'teacherId'], ['ساعت هفتگی', 'weeklyHours'], ['وضعیت', 'status']],
      events: [['نوع رویداد', 'category'], ['تاریخ', 'date'], ['ساعت', 'time'], ['مکان', 'location'], ['مخاطبان', 'audience']]
    };
    const fields = fieldsByResource[resource] || Object.keys(record).filter((key) => !['id','isDemo','createdAt','updatedAt','messages','passwordHash'].includes(key)).slice(0, 12).map((key) => [key, key]);
    const profileName = record.name || record.title || record.subject || record.route || record.studentName || record.description || 'جزئیات';
    const meta = PAGE_META[resource] || { icon: 'documents', title: pageTitle(resource) };
    const phone = record.guardianPhone || record.phone;
    const sections = resource === 'students' ? [
      { title: 'اطلاعات پرونده', keys: fields.slice(0, 6) },
      { title: 'اطلاعات اولیا و راه‌های تماس', keys: fields.slice(6, 12) }
    ] : [{ title: 'جزئیات', keys: fields }];
    const content = `<div class="modal-head"><div class="modal-head-main"><span class="modal-head-icon">${icon(meta.icon,18)}</span><span><h2 id="modal-title">پرونده ${esc(meta.title === 'دانش‌آموزان' ? 'دانش‌آموز' : meta.title)}</h2><p>اطلاعات ثبت‌شده در سامانه مدرسه</p></span></div><button type="button" class="modal-close" data-close-modal>${icon('close',16)}</button></div><div class="modal-body"><div class="detail-profile"><span class="detail-avatar">${esc(firstGlyph(profileName))}</span><span class="detail-profile-copy"><h3>${esc(profileName)}</h3><p>${esc(resource === 'students' ? `${record.studentNo || ''} · ${className(record.classId)}` : record.subject || record.grade || record.username || meta.title)}</p></span><span class="detail-profile-actions">${phone ? `<a class="toolbar-icon-button" href="tel:${esc(String(phone).replace(/[^\d+]/g,''))}" title="تماس">${icon('phone',15)}</a>` : ''}</span></div>${sections.map((section) => `<h3 class="detail-section-title">${icon(resource === 'students' && section.title.includes('اولیا') ? 'parents' : 'documents',14)} ${esc(section.title)}</h3><div class="detail-fields-grid">${section.keys.map(([label,key]) => {
      let value = record[key];
      if (key === 'classId') value = className(value);
      if (key === 'teacherId') value = teacherName(value);
      if (key === 'classIds') value = Array.isArray(value) ? value.map(className).join('، ') : '';
      if (key === 'studentIds') value = Array.isArray(value) ? value.map(studentName).join('، ') : '';
      if (key === 'role') value = roleName(value);
      if (key === 'amount') value = money(value);
      if (key === 'createdAt') value = fmtDateTime(value);
      if (value === '') value = '—';
      const isPhone = key.toLowerCase().includes('phone') && value && value !== '—';
      const tel = isPhone ? String(value).replace(/[۰-۹]/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)).replace(/[^+\d]/g, '') : '';
      return `<div class="detail-field"><small>${esc(label)}</small><b>${isPhone ? `<a class="detail-call-link" href="tel:${esc(tel)}">${icon('phone',12)} ${esc(value)}</a>` : esc(Array.isArray(value) ? value.join('، ') : value ?? '—')}</b></div>`;
    }).join('')}</div>`).join('')}${resource === 'students' ? renderStudentSummary(record) : ''}</div><div class="modal-foot"><span class="modal-note">شناسه پرونده: ${esc(record.id)}</span><div class="modal-foot-right"><button type="button" class="button button-outline" data-close-modal>بستن</button>${getModule(resource)?.permissions?.canUpdate && FORM_FIELDS[resource] && resource !== 'tickets' ? `<button type="button" class="button button-primary" data-edit-record="${esc(record.id)}" data-edit-resource="${esc(resource)}">${icon('edit',14)} ویرایش پرونده</button>` : ''}</div></div>`;
    openModal(content, 'modal-wide');
    $('[data-edit-record]', $('#modal-card'))?.addEventListener('click', () => { closeModal(); openRecordForm(resource, record); });
  }

  function renderStudentSummary(record) {
    const attendances = (state.cache.attendance?.data || []).filter((item) => item.studentId === record.id);
    const grades = (state.cache.grades?.data || []).filter((item) => item.studentId === record.id);
    const rate = attendances.length ? Math.round(attendances.filter((item) => item.status !== 'غایب').length * 100 / attendances.length) : 100;
    const avg = grades.length ? (grades.reduce((sum, item) => sum + Number(item.score || 0), 0) / grades.length).toFixed(1) : '—';
    return `<h3 class="detail-section-title">${icon('reports',14)} خلاصه آموزشی</h3><div class="student-summary-grid"><div><small>درصد حضور ثبت‌شده</small><b>${faNumber(rate)}٪</b></div><div><small>میانگین نمره</small><b>${esc(avg)}${avg === '—' ? '' : ' از ۲۰'}</b></div><div><small>تعداد ارزشیابی‌ها</small><b>${faNumber(grades.length)} مورد</b></div></div>`;
  }

  function openTicketDetail(ticket) {
    const messages = ticket.messages || [];
    const content = `<div class="modal-head"><div class="modal-head-main"><span class="modal-head-icon">${icon('tickets',18)}</span><span><h2 id="modal-title">${esc(ticket.subject)}</h2><p>${esc(ticket.studentName || 'درخواست مدرسه')} · ${esc(ticket.category || 'گفت‌وگو')} · ${statusBadge(ticket.status)}</p></span></div><button type="button" class="modal-close" data-close-modal>${icon('close',16)}</button></div><div class="modal-body"><div class="ticket-meta-strip"><span>${icon('calendar',13)} ثبت ${esc(fmtDateTime(ticket.createdAt))}</span><span>${icon('clock',13)} آخرین پاسخ ${esc(fmtDateTime(ticket.lastReplyAt))}</span><span>اولویت: <b>${esc(ticket.priority || 'عادی')}</b></span></div><div class="ticket-thread">${messages.map((message) => `<div class="ticket-message ${message.sender === state.user.name ? 'is-own' : ''}"><div class="ticket-message-head"><b>${esc(message.sender || roleName(message.role))}</b><small>${esc(roleName(message.role))} · ${esc(fmtDateTime(message.at))}</small></div><p>${esc(message.text)}</p></div>`).join('')}</div>${ticket.status === 'بسته' ? `<div class="ticket-closed-note">${icon('check',14)} این گفت‌وگو بسته شده است.</div>` : `<form class="ticket-reply-box" id="ticket-reply-form"><textarea name="reply" required maxlength="3000" placeholder="پاسخ خود را بنویسید…"></textarea><button class="button button-primary" type="submit">${icon('messages',15)} ارسال پاسخ</button></form>`}</div><div class="modal-foot"><span class="modal-note">کد پیگیری: ${esc(ticket.id)}</span><div class="modal-foot-right"><button type="button" class="button button-outline" data-close-modal>بستن</button>${state.user.role === 'admin' && ticket.status !== 'بسته' ? `<button type="button" class="button button-outline" id="close-ticket">${icon('check',14)} بستن تیکت</button>` : ''}</div></div>`;
    openModal(content, 'modal-wide');
    $('#ticket-reply-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const reply = new FormData(event.currentTarget).get('reply').trim();
      if (!reply) return;
      const button = event.currentTarget.querySelector('button[type=submit]'); button.disabled = true;
      try {
        const result = await request(`/api/records/tickets/${encodeURIComponent(ticket.id)}`, { method: 'PATCH', body: JSON.stringify({ reply }) });
        delete state.cache.tickets;
        closeModal();
        toast(result.message || 'پاسخ ارسال شد.');
        await refreshBootstrap(false);
        if (state.page === 'tickets') await navigate('tickets');
      } catch (error) { toast(error.message, 'error'); button.disabled = false; }
    });
    $('#close-ticket')?.addEventListener('click', async () => {
      try {
        const result = await request(`/api/records/tickets/${encodeURIComponent(ticket.id)}`, { method: 'PATCH', body: JSON.stringify({ status: 'بسته' }) });
        delete state.cache.tickets; closeModal(); toast('تیکت بسته شد.'); await refreshBootstrap(false); if (state.page === 'tickets') await navigate('tickets');
      } catch (error) { toast(error.message, 'error'); }
    });
  }

  function confirmDelete(resource, record) {
    const title = record.name || record.title || record.subject || 'این مورد';
    const content = `<div class="modal-head"><div class="modal-head-main"><span class="modal-head-icon delete-icon">${icon('trash',18)}</span><span><h2 id="modal-title">حذف ${esc(PAGE_META[resource]?.singular || 'رکورد')}</h2><p>این عملیات قابل بازگشت نیست.</p></span></div><button class="modal-close" data-close-modal>${icon('close',16)}</button></div><div class="modal-body"><p class="delete-confirm-text">آیا از حذف «<b>${esc(title)}</b>» اطمینان دارید؟</p></div><div class="modal-foot"><span></span><div class="modal-foot-right"><button class="button button-outline" data-close-modal>انصراف</button><button class="button button-danger" id="confirm-delete">${icon('trash',14)} حذف دائمی</button></div></div>`;
    openModal(content);
    $('#confirm-delete').addEventListener('click', async (event) => {
      event.currentTarget.disabled = true;
      try { const result = await request(`/api/records/${resource}/${encodeURIComponent(record.id)}`, { method: 'DELETE' }); closeModal(); delete state.cache[resource]; toast(result.message); await refreshBootstrap(false); await navigate(resource); }
      catch (error) { toast(error.message, 'error'); event.currentTarget.disabled = false; }
    });
  }

  async function runGlobalSearch(query) {
    query = query.trim();
    if (query.length < 2) return toast('برای جست‌وجو دست‌کم دو نویسه وارد کنید.', 'warning');
    const resources = state.modules.filter((item) => item.enabled !== false && PAGE_META[item.id]).map((item) => item.id);
    const responses = await Promise.all(resources.map(async (resource) => {
      try { const result = await request(`/api/records/${resource}?q=${encodeURIComponent(query)}&limit=20`); return result.data.map((record) => ({ resource, record })); }
      catch { return []; }
    }));
    const results = responses.flat();
    state.page = 'search';
    buildSidebar();
    $('#breadcrumb-current').textContent = 'نتایج جست‌وجو';
    $('#page-content').innerHTML = `<header class="page-heading"><div class="page-heading-with-icon"><span class="page-hero-icon">${icon('search',20)}</span><div class="page-heading-copy"><div class="page-kicker">جست‌وجوی سراسری</div><h1>نتایج جست‌وجو</h1><p>نتایج مرتبط با «${esc(query)}» در اطلاعات مدرسه</p></div></div></header>${results.length ? `<section class="panel"><div class="list-toolbar"><span class="list-count">${faNumber(results.length)} نتیجه پیدا شد</span></div><div class="data-table-wrap"><table class="data-table"><thead><tr><th>بخش</th><th>عنوان</th><th>خلاصه</th><th></th></tr></thead><tbody>${results.map(({ resource, record }) => `<tr data-search-resource="${esc(resource)}" data-search-id="${esc(record.id)}"><td><span class="badge badge-blue">${esc(pageTitle(resource))}</span></td><td><b class="table-link">${esc(record.name || record.title || record.subject || record.studentName || record.route || 'رکورد')}</b></td><td>${esc(record.classId ? className(record.classId) : record.guardianName || record.category || record.status || record.phone || '')}</td><td>${icon('chevron-left',15)}</td></tr>`).join('')}</tbody></table></div></section>` : renderEmpty('search', 'نتیجه‌ای پیدا نشد', 'عبارت جست‌وجو را تغییر دهید و دوباره امتحان کنید.')}`;
    $('#page-content').onclick = (event) => {
      const row = event.target.closest('[data-search-resource]'); if (!row) return;
      const { searchResource: resource, searchId: id } = row.dataset;
      navigate(resource).then(async () => { const records = await loadRecords(resource); const found = records.data.find((item) => item.id === id); if (found) openRecordDetail(resource, found); });
    };
  }

  async function showNotifications() {
    try {
      const result = await loadRecords('tickets', true);
      const tickets = result.data.filter((ticket) => ['باز', 'در انتظار پاسخ', 'در حال پیگیری'].includes(ticket.status)).slice(0, 5);
      const content = `<div class="modal-head"><div class="modal-head-main"><span class="modal-head-icon">${icon('bell',18)}</span><span><h2 id="modal-title">اعلان‌ها</h2><p>درخواست‌هایی که نیازمند پیگیری هستند</p></span></div><button class="modal-close" data-close-modal>${icon('close',16)}</button></div><div class="modal-body notification-list">${tickets.length ? tickets.map((ticket) => `<button type="button" class="notification-item" data-notification-ticket="${esc(ticket.id)}"><span class="notification-item-icon">${icon('tickets',16)}</span><span><b>${esc(ticket.subject)}</b><small>${esc(ticket.studentName || 'مدرسه')} · ${esc(fmtDateTime(ticket.lastReplyAt || ticket.createdAt))}</small></span>${statusBadge(ticket.status)}</button>`).join('') : renderEmpty('message-check', 'همه‌چیز پیگیری شده', 'اعلان جدیدی ندارید.')}</div><div class="modal-foot"><span class="modal-note">${faNumber(tickets.length)} مورد برای پیگیری</span><div class="modal-foot-right"><button type="button" class="button button-primary" data-go-tickets>رفتن به تیکت‌ها ${icon('arrow-left',14)}</button></div></div>`;
      openModal(content);
      $('#modal-card').onclick = (event) => {
        const ticketButton = event.target.closest('[data-notification-ticket]');
        if (ticketButton) { const ticket = tickets.find((item) => item.id === ticketButton.dataset.notificationTicket); if (ticket) openTicketDetail(ticket); }
        if (event.target.closest('[data-go-tickets]')) { closeModal(); navigate('tickets'); }
      };
    } catch (error) { toast(error.message, 'error'); }
  }

  function showHelp() {
    const content = `<div class="modal-head"><div class="modal-head-main"><span class="modal-head-icon">${icon('help',18)}</span><span><h2 id="modal-title">راهنمای سریع مدرسه‌یار</h2><p>چطور با بخش‌های اصلی شروع کنید؟</p></span></div><button class="modal-close" data-close-modal>${icon('close',16)}</button></div><div class="modal-body help-modal-body"><div class="help-step"><span>۱</span><div><b>ساخت کلاس و تعیین معلم</b><p>ابتدا از بخش «معلمان» حساب معلم بسازید و سپس کلاس را با معلم مسئول تعریف کنید.</p></div></div><div class="help-step"><span>۲</span><div><b>تکمیل پرونده دانش‌آموز</b><p>در فرم دانش‌آموز، کلاس، شماره تماس ولی و اطلاعات اضطراری را وارد کنید؛ با ساخت حساب، دانش‌آموز می‌تواند وارد پنل خودش شود.</p></div></div><div class="help-step"><span>۳</span><div><b>ثبت حضور و ارتباط</b><p>حضور روزانه را از بخش حضور و غیاب ثبت کنید و درخواست‌های مدرسه را از طریق تیکت پیگیری کنید.</p></div></div><div class="help-callout">${icon('shield-check',16)} برای نصب روی cPanel، راهنمای کامل را در <a href="/install" target="_blank">ویزارد نصب</a> ببینید.</div></div><div class="modal-foot"><span></span><div class="modal-foot-right"><button type="button" class="button button-primary" data-close-modal>متوجه شدم</button></div></div>`;
    openModal(content);
  }

  function toast(message, type = 'success') {
    const region = $('#toast-region');
    const node = document.createElement('div');
    node.className = `toast ${type === 'error' ? 'is-error' : type === 'warning' ? 'is-warning' : ''}`;
    node.innerHTML = `${icon(type === 'error' ? 'close' : type === 'warning' ? 'help' : 'check', 17)}<span>${esc(message)}</span>`;
    region.appendChild(node);
    setTimeout(() => { node.style.opacity = '0'; node.style.transform = 'translateX(-10px)'; setTimeout(() => node.remove(), 220); }, 3300);
  }

  function closeProfileMenu() {
    $('#profile-menu').hidden = true;
    $('#profile-menu-button').setAttribute('aria-expanded', 'false');
  }
  async function switchAccount(username, password) {
    if (!state.demoMode || state.switchingAccount) return;
    state.switchingAccount = true;
    const profileButton = $('#profile-menu-button');
    profileButton.disabled = true;
    profileButton.setAttribute('aria-busy', 'true');
    const switchButton = [...$('#profile-menu').querySelectorAll('[data-switch-account]')].find((button) => button.dataset.switchAccount === username);
    if (switchButton) { switchButton.disabled = true; switchButton.setAttribute('aria-busy', 'true'); }
    toast('در حال تغییر پنل نمایشی…', 'warning');
    try {
      const result = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
      if (!result.user?.id) throw new Error('ورود نمایشی تأیید نشد؛ دوباره تلاش کنید.');
      setDemoSessionToken(result.demoSessionToken || '');
      state.user = result.user;
      state.settings = result.settings;
      state.openNavGroup = '';
      closeProfileMenu();
      state.cache = {};
      const loaded = await loadApp(result.user.id);
      if (loaded) toast(`به پنل ${roleName(result.user.role)} وارد شدید.`);
    } catch (error) {
      toast(error.message || 'تغییر پنل انجام نشد؛ دوباره تلاش کنید.', 'error');
    } finally {
      state.switchingAccount = false;
      profileButton.disabled = false;
      profileButton.removeAttribute('aria-busy');
      if (switchButton?.isConnected) { switchButton.disabled = false; switchButton.removeAttribute('aria-busy'); }
    }
  }

  function bindGlobalEvents() {
    $('#login-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const errorBox = $('#login-error');
      const button = event.currentTarget.querySelector('button[type=submit]');
      errorBox.textContent = '';
      button.disabled = true;
      try {
        const result = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: form.get('username'), password: form.get('password') }) });
        setDemoSessionToken(result.demoSessionToken || '');
        state.user = result.user; state.settings = result.settings; state.cache = {};
        await loadApp(result.user?.id || '');
      } catch (error) { errorBox.textContent = error.message || 'ورود انجام نشد.'; }
      finally { button.disabled = false; }
    });
    $('#demo-accounts').addEventListener('click', (event) => {
      const account = event.target.closest('[data-demo-login]'); if (account) switchAccount(account.dataset.demoLogin, account.dataset.demoPassword);
    });
    $('[data-toggle-password]')?.addEventListener('click', (event) => {
      const input = document.getElementById(event.currentTarget.dataset.togglePassword);
      input.type = input.type === 'password' ? 'text' : 'password';
      event.currentTarget.classList.toggle('is-shown', input.type === 'text');
    });
    $('#sidebar-nav').addEventListener('click', (event) => {
      const link = event.target.closest('[data-nav]');
      if (link) {
        state.openNavGroup = link.closest('[data-nav-group]')?.dataset.navGroup || state.openNavGroup;
        navigate(link.dataset.nav);
        closeMobileNav();
      }
    });
    $('#mobile-menu').addEventListener('click', () => { $('#sidebar').classList.add('is-open'); $('#mobile-backdrop').classList.add('is-visible'); });
    $('#sidebar-close').addEventListener('click', closeMobileNav);
    $('#mobile-backdrop').addEventListener('click', closeMobileNav);
    function closeMobileNav() { $('#sidebar').classList.remove('is-open'); $('#mobile-backdrop').classList.remove('is-visible'); }
    $('#profile-menu-button').addEventListener('click', () => {
      const menu = $('#profile-menu'); menu.hidden = !menu.hidden; $('#profile-menu-button').setAttribute('aria-expanded', String(!menu.hidden));
    });
    $('#profile-menu').addEventListener('click', (event) => {
      const switchButton = event.target.closest('[data-switch-account]');
      if (switchButton) return switchAccount(switchButton.dataset.switchAccount, switchButton.dataset.password);
      if (event.target.closest('[data-logout]')) {
        request('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
        setDemoSessionToken('');
        showLogin(state.demoMode);
      }
      if (event.target.closest('[data-go-settings]')) navigate('settings');
    });
    document.addEventListener('click', (event) => {
      if (!event.target.closest('#profile-menu') && !event.target.closest('#profile-menu-button')) closeProfileMenu();
      if (event.target.closest('[data-close-modal]')) closeModal();
    });
    $('#modal-layer').addEventListener('click', (event) => { if (event.target.classList.contains('modal-backdrop')) closeModal(); });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { closeModal(); closeProfileMenu(); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('.global-search').classList.add('is-open'); $('#global-search').focus(); }
      if (event.key === '/' && !['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) { event.preventDefault(); $('.global-search').classList.add('is-open'); $('#global-search').focus(); }
    });
    $('#global-search').addEventListener('focus', () => $('.global-search').classList.add('is-open'));
    $('#global-search').addEventListener('blur', (event) => { if (!event.currentTarget.value) $('.global-search').classList.remove('is-open'); });
    $('#global-search').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); runGlobalSearch(event.currentTarget.value).catch((error) => toast(error.message,'error')); event.currentTarget.blur(); } });
    $('#notification-button').addEventListener('click', showNotifications);
    $('#topbar-help').addEventListener('click', showHelp);
    $('#page-content').addEventListener('click', (event) => {
      const quick = event.target.closest('[data-quick-nav]');
      if (quick) {
        const target = quick.dataset.quickNav;
        if (!moduleAvailable(target)) return toast('این بخش برای حساب شما در دسترس نیست یا غیرفعال شده است.', 'warning');
        navigate(target);
      }
    });
  }

  bindGlobalEvents();
  boot();
})();
