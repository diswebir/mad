'use strict';

const modules = [
  { id: 'dashboard', title: 'داشبورد', description: 'نمای کلی وضعیت مدرسه و کارهای روزانه', icon: 'dashboard', group: 'نمای کلی', roles: ['admin', 'teacher', 'student', 'parent'], locked: true },
  { id: 'students', title: 'دانش‌آموزان', description: 'پرونده تحصیلی، مشخصات فردی و اطلاعات اولیا', icon: 'student', group: 'مدرسه', roles: ['admin', 'teacher', 'student', 'parent'], locked: true },
  { id: 'teachers', title: 'معلمان', description: 'مدیریت کادر آموزشی و کلاس‌های واگذارشده', icon: 'teacher', group: 'مدرسه', roles: ['admin'], locked: true },
  { id: 'classes', title: 'کلاس‌ها', description: 'پایه‌ها، ظرفیت، اتاق و معلم هر کلاس', icon: 'classes', group: 'مدرسه', roles: ['admin', 'teacher', 'student', 'parent'], locked: true },
  { id: 'parents', title: 'اولیا', description: 'راه‌های تماس و ارتباط خانواده‌ها با مدرسه', icon: 'parents', group: 'مدرسه', roles: ['admin', 'teacher', 'parent'] },
  { id: 'attendance', title: 'حضور و غیاب', description: 'ثبت روزانه حضور، تأخیر و غیبت دانش‌آموزان', icon: 'attendance', group: 'آموزش', roles: ['admin', 'teacher', 'student', 'parent'] },
  { id: 'subjects', title: 'درس‌ها', description: 'درس‌ها، پایه‌های ارائه و ساعت آموزشی', icon: 'subjects', group: 'آموزش', roles: ['admin', 'teacher', 'student'] },
  { id: 'timetable', title: 'برنامه هفتگی', description: 'زمان‌بندی کلاس‌ها، دبیران و اتاق‌ها', icon: 'timetable', group: 'آموزش', roles: ['admin', 'teacher', 'student', 'parent'] },
  { id: 'assignments', title: 'تکالیف', description: 'تکالیف هر کلاس، مهلت تحویل و پیگیری', icon: 'assignments', group: 'آموزش', roles: ['admin', 'teacher', 'student', 'parent'] },
  { id: 'exams', title: 'آزمون‌ها', description: 'تقویم آزمون‌ها و برنامه‌ریزی ارزشیابی‌ها', icon: 'exams', group: 'آموزش', roles: ['admin', 'teacher', 'student', 'parent'] },
  { id: 'grades', title: 'نمرات و کارنامه', description: 'ثبت نمره، روند پیشرفت و کارنامه تحصیلی', icon: 'grades', group: 'آموزش', roles: ['admin', 'teacher', 'student', 'parent'] },
  { id: 'tickets', title: 'تیکت‌ها', description: 'گفت‌وگوی امن دانش‌آموز، ولی، معلم و مدیر', icon: 'tickets', group: 'ارتباطات', roles: ['admin', 'teacher', 'student', 'parent'] },
  { id: 'notices', title: 'اطلاعیه‌ها', description: 'انتشار خبر و اعلان هدفمند برای کلاس‌ها', icon: 'notices', group: 'ارتباطات', roles: ['admin', 'teacher', 'student', 'parent'] },
  { id: 'events', title: 'تقویم مدرسه', description: 'رویدادها، جلسه‌ها، اردوها و مناسبت‌ها', icon: 'events', group: 'ارتباطات', roles: ['admin', 'teacher', 'student', 'parent'] },
  { id: 'messages', title: 'پیام‌رسانی', description: 'سوابق پیامک‌ها و اعلان‌های ارسال‌شده', icon: 'messages', group: 'ارتباطات', roles: ['admin', 'teacher'] },
  { id: 'finance', title: 'شهریه و مالی', description: 'دریافت‌ها، اقساط و پیگیری پرداخت‌ها', icon: 'finance', group: 'امور اجرایی', roles: ['admin', 'parent'] },
  { id: 'library', title: 'کتابخانه', description: 'فهرست منابع، امانت و موجودی کتاب‌ها', icon: 'library', group: 'امور اجرایی', roles: ['admin', 'teacher', 'student'] },
  { id: 'transport', title: 'سرویس مدرسه', description: 'مسیرها، رانندگان و ظرفیت سرویس‌ها', icon: 'transport', group: 'امور اجرایی', roles: ['admin', 'parent'] },
  { id: 'documents', title: 'اسناد و فایل‌ها', description: 'دسترسی به فرم‌ها، راهنماها و اسناد مدرسه', icon: 'documents', group: 'امور اجرایی', roles: ['admin', 'teacher', 'student', 'parent'] },
  { id: 'reports', title: 'گزارش‌ها', description: 'خلاصه‌های مدیریتی و خروجی‌های تحلیلی', icon: 'reports', group: 'مدیریت', roles: ['admin'] },
  { id: 'users', title: 'کاربران', description: 'حساب‌های کاربری مدیر، معلم و دانش‌آموز', icon: 'users', group: 'مدیریت', roles: ['admin'] },
  { id: 'roles', title: 'نقش‌ها و دسترسی‌ها', description: 'مدیریت سطوح دسترسی و مسئولیت‌ها', icon: 'roles', group: 'مدیریت', roles: ['admin'] },
  { id: 'audit', title: 'گزارش فعالیت‌ها', description: 'ردیابی تغییرات و فعالیت کاربران سیستم', icon: 'audit', group: 'مدیریت', roles: ['admin'] },
  { id: 'settings', title: 'تنظیمات مدرسه', description: 'اطلاعات مدرسه و تنظیمات عمومی سامانه', icon: 'settings', group: 'سیستم', roles: ['admin'], locked: true },
  { id: 'modules', title: 'مدیریت ماژول‌ها', description: 'فعال یا غیرفعال کردن قابلیت‌های سامانه', icon: 'modules', group: 'سیستم', roles: ['admin'], locked: true }
];

const resourceByModule = Object.fromEntries(modules.map((item) => [item.id, item.id]));
const collectionNames = new Set([
  'students', 'teachers', 'classes', 'parents', 'attendance', 'subjects', 'timetable',
  'assignments', 'exams', 'grades', 'tickets', 'notices', 'events', 'messages',
  'finance', 'library', 'transport', 'documents'
]);

const roleResources = {
  admin: new Set(['*']),
  teacher: new Set(['students', 'classes', 'attendance', 'subjects', 'timetable', 'assignments', 'exams', 'grades', 'tickets', 'notices', 'events', 'messages', 'library', 'documents', 'parents', 'teachers']),
  student: new Set(['students', 'classes', 'attendance', 'subjects', 'timetable', 'assignments', 'exams', 'grades', 'tickets', 'notices', 'events', 'library', 'documents', 'parents', 'finance', 'transport']),
  parent: new Set(['students', 'classes', 'attendance', 'subjects', 'timetable', 'assignments', 'exams', 'grades', 'tickets', 'notices', 'events', 'documents', 'parents', 'finance', 'transport'])
};

module.exports = { modules, resourceByModule, collectionNames, roleResources };
