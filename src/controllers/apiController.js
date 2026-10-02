'use strict';

const crypto = require('node:crypto');
const net = require('node:net');
const { modules, collectionNames, roleResources } = require('../data/modules');
const { hashPassword, safeUser, verifyPassword, randomId } = require('../lib/security');
const { openMysqlStore } = require('../models/mysqlStore');
const { schoolDateISO, isISODate, isCalendarDate, calendarDateISO, latinDigits } = require('../lib/dates');
const { canonicalWeekday, parseClock, shiftKey, getSchoolSchedule, validateSchoolSchedule } = require('../lib/timetable');

const MAX_BODY = 1024 * 1024;
const MAX_BACKUP_BODY = 25 * 1024 * 1024;
const MAX_AUTH_SESSIONS = 10000;
const DUMMY_PASSWORD_HASH = `${'00'.repeat(16)}:${'00'.repeat(64)}`;
const PREFIXES = {
  students: 'std', teachers: 'tch', classes: 'cls', parents: 'par', attendance: 'att', subjects: 'sub',
  timetable: 'tt', assignments: 'asg', exams: 'exm', grades: 'grd', tickets: 'tic', notices: 'not',
  events: 'evt', messages: 'msg', finance: 'fin', library: 'lib', transport: 'bus', documents: 'doc', users: 'usr'
};
const REQUIRED_RECORD_FIELDS = {
  students: ['name', 'studentNo', 'classId', 'guardianName', 'guardianPhone'], teachers: ['name', 'teacherNo', 'subject', 'phone'],
  classes: ['name', 'grade'], parents: ['name', 'phone'], attendance: ['studentId', 'date', 'status'],
  subjects: ['name'], timetable: ['day', 'subject', 'classId'], assignments: ['title', 'subject', 'classId'],
  exams: ['title', 'subject', 'classId', 'date'], grades: ['studentId', 'subject', 'exam', 'score'],
  tickets: ['subject', 'firstMessage'], notices: ['title', 'body'], events: ['title', 'date'],
  finance: ['studentId', 'title', 'amount'], library: ['title'], transport: ['route', 'driver'], documents: ['title'], messages: ['title', 'to']
};
const NUMERIC_FIELDS = {
  classes: ['capacity'], subjects: ['weeklyHours'], grades: ['score', 'maxScore'],
  finance: ['amount'], library: ['copies', 'available'], transport: ['students']
};
const INTEGER_FIELDS = {
  classes: ['capacity'], finance: ['amount'], library: ['copies', 'available'], transport: ['students']
};
const POSITIVE_FIELDS = { grades: ['maxScore'] };
const DEFAULT_NUMERIC_FIELDS = { grades: { maxScore: 20 } };
const ENUM_FIELDS = {
  students: { gender: ['دختر', 'پسر'], status: ['فعال', 'غیرفعال', 'در انتظار تکمیل'] },
  teachers: { status: ['فعال', 'غیرفعال'] },
  classes: { grade: ['پایه هفتم', 'پایه هشتم', 'پایه نهم', 'پایه دهم', 'پایه یازدهم', 'پایه دوازدهم'], status: ['فعال', 'غیرفعال'] },
  parents: { relation: ['مادر', 'پدر', 'سرپرست'], status: ['فعال', 'غیرفعال'] },
  attendance: { status: ['حاضر', 'غایب', 'با تأخیر', 'مرخصی'] },
  subjects: { grade: ['پایه هفتم', 'پایه هشتم', 'پایه نهم', 'پایه دهم', 'پایه یازدهم', 'پایه دوازدهم'], status: ['فعال', 'غیرفعال'] },
  assignments: { status: ['در حال انجام', 'تحویل‌شده', 'بررسی‌شده'] },
  exams: { status: ['برنامه‌ریزی‌شده', 'برگزارشده', 'لغوشده'] },
  tickets: { category: ['آموزشی', 'حضور و غیاب', 'مالی', 'مشاوره', 'پشتیبانی'], priority: ['عادی', 'متوسط', 'بالا'], status: ['باز', 'در انتظار پاسخ', 'در حال پیگیری', 'بسته'] },
  notices: { category: ['اطلاعیه', 'مهم', 'جلسه', 'آموزشی'], audience: ['همه', 'اولیا', 'معلمان', 'دانش‌آموزان', 'پایه هفتم', 'پایه هشتم', 'پایه نهم', 'پایه دهم', 'پایه یازدهم', 'پایه دوازدهم'], status: ['منتشرشده', 'پیش‌نویس'] },
  events: { category: ['جلسه', 'اردو', 'ورزشی', 'فرهنگی', 'تعطیلی'], audience: ['همه', 'اولیا', 'معلمان', 'دانش‌آموزان', 'پایه هفتم', 'پایه هشتم', 'پایه نهم', 'پایه دهم', 'پایه یازدهم', 'پایه دوازدهم'] },
  messages: { channel: ['پیامک', 'اعلان پنل', 'ایمیل'], status: ['ارسال‌شده', 'در صف ارسال', 'ناموفق'] },
  finance: { status: ['در انتظار پرداخت', 'پرداخت‌شده', 'سررسید گذشته'] },
  library: { category: ['داستان', 'علمی', 'ادبیات', 'آموزشی', 'تاریخ'], status: ['موجود', 'امانت', 'خارج از دسترس'] },
  transport: { status: ['فعال', 'غیرفعال'] },
  documents: { category: ['راهنما', 'فرم', 'تقویم', 'آیین‌نامه', 'سایر'], audience: ['همه', 'اولیا', 'معلمان', 'دانش‌آموزان', 'پایه هفتم', 'پایه هشتم', 'پایه نهم', 'پایه دهم', 'پایه یازدهم', 'پایه دوازدهم'], fileType: ['PDF', 'DOCX', 'XLSX', 'تصویر'], status: ['منتشرشده', 'پیش‌نویس'] }
};
const DEFAULT_RECORD_STATUS = {
  students: 'فعال', teachers: 'فعال', classes: 'فعال', parents: 'فعال', subjects: 'فعال', assignments: 'در حال انجام',
  exams: 'برنامه‌ریزی‌شده', tickets: 'باز', notices: 'پیش‌نویس', messages: 'در صف ارسال', finance: 'در انتظار پرداخت',
  library: 'موجود', transport: 'فعال', documents: 'پیش‌نویس'
};
const WRITE_ROLES = {
  students: ['admin'], teachers: ['admin'], classes: ['admin'], parents: ['admin'], subjects: ['admin'],
  attendance: ['admin', 'teacher'], timetable: ['admin'], assignments: ['admin', 'teacher'],
  exams: ['admin', 'teacher'], grades: ['admin', 'teacher'], tickets: ['admin', 'teacher', 'student', 'parent'],
  notices: ['admin', 'teacher'], events: ['admin'], messages: ['admin', 'teacher'], finance: ['admin'],
  library: ['admin'], transport: ['admin'], documents: ['admin', 'teacher'], users: ['admin']
};
const CUSTOM_ROLE_RESERVED_MODULES = new Set(['users', 'roles', 'audit', 'reports', 'settings', 'modules']);
const CUSTOM_ROLE_READABLE_RESOURCES = new Set([...collectionNames].filter((resource) => resource !== 'users'));
const CUSTOM_ROLE_WRITABLE_RESOURCES = new Set(Object.keys(WRITE_ROLES).filter((resource) => resource !== 'users'));
const CUSTOM_ROLE_CLASS_WRITABLE_RESOURCES = new Set(['students', 'classes', 'parents', 'attendance', 'subjects', 'timetable', 'assignments', 'exams', 'grades', 'tickets', 'finance']);
const PATCH_FIELDS = {
  students: ['name', 'studentNo', 'classId', 'gender', 'birthDate', 'phone', 'guardianName', 'guardianRelation', 'guardianPhone', 'emergencyContact', 'status', 'address', 'healthNotes'],
  teachers: ['name', 'teacherNo', 'subject', 'degree', 'phone', 'email', 'classIds', 'status'],
  classes: ['name', 'grade', 'teacherId', 'room', 'capacity', 'shift', 'status'],
  parents: ['name', 'relation', 'phone', 'email', 'studentIds', 'status'],
  attendance: ['studentId', 'studentName', 'classId', 'date', 'time', 'status', 'note', 'teacherId'],
  subjects: ['name', 'code', 'grade', 'teacherId', 'weeklyHours', 'status'],
  timetable: ['day', 'subject', 'subjectId', 'classId', 'teacherId', 'periodId', 'periodName', 'academicYear', 'startTime', 'endTime', 'room'],
  assignments: ['title', 'subject', 'classId', 'teacherId', 'dueDate', 'status', 'description'],
  exams: ['title', 'subject', 'classId', 'teacherId', 'date', 'time', 'room', 'status'],
  grades: ['studentId', 'studentName', 'classId', 'subject', 'exam', 'score', 'maxScore', 'date', 'teacherId'],
  tickets: ['subject', 'category', 'priority', 'studentId', 'classId', 'teacherId', 'status', 'reply', 'firstMessage'],
  notices: ['title', 'category', 'audience', 'publishDate', 'status', 'body'],
  events: ['title', 'category', 'date', 'time', 'location', 'audience'],
  messages: ['title', 'to', 'channel', 'sentAt', 'status'],
  finance: ['studentId', 'studentName', 'title', 'amount', 'dueDate', 'paidAt', 'status', 'method'],
  library: ['title', 'author', 'category', 'copies', 'available', 'status'],
  transport: ['route', 'driver', 'phone', 'vehicle', 'students', 'departure', 'status'],
  documents: ['title', 'category', 'audience', 'fileType', 'updatedAt', 'status']
};
const TEACHER_PATCH_FIELDS = {
  attendance: ['status', 'time', 'note'],
  assignments: ['title', 'subject', 'dueDate', 'status', 'description'],
  exams: ['title', 'subject', 'date', 'time', 'room', 'status'],
  grades: ['subject', 'exam', 'score', 'maxScore', 'date'],
  tickets: ['reply'],
  notices: ['title', 'category', 'audience', 'publishDate', 'status', 'body'],
  messages: ['title', 'to', 'channel', 'sentAt', 'status'],
  documents: ['title', 'category', 'audience', 'fileType', 'updatedAt', 'status']
};
const POST_EXTRA_FIELDS = {
  students: ['accountUsername', 'accountPassword'],
  teachers: ['accountUsername', 'accountPassword'],
  attendance: ['studentName'],
  grades: ['studentName'],
  finance: ['studentName'],
  tickets: ['firstMessage']
};
const CALENDAR_DATE_FIELDS = {
  assignments: [{ name: 'dueDate', label: 'مهلت تحویل' }],
  exams: [{ name: 'date', label: 'تاریخ آزمون', required: true }],
  grades: [{ name: 'date', label: 'تاریخ ارزشیابی' }],
  notices: [{ name: 'publishDate', label: 'تاریخ انتشار' }],
  events: [{ name: 'date', label: 'تاریخ رویداد', required: true }],
  finance: [{ name: 'dueDate', label: 'سررسید' }, { name: 'paidAt', label: 'تاریخ پرداخت' }]
};

function validateCalendarDateFields(resource, record) {
  for (const field of CALENDAR_DATE_FIELDS[resource] || []) {
    const value = normalizeText(record[field.name], 24);
    if (!value && !field.required) continue;
    if (!isCalendarDate(value)) return `${field.label} معتبر نیست؛ تاریخ را به‌صورت میلادی مانند 2026-10-02 یا شمسی مانند ۱۴۰۵/۰۷/۱۰ وارد کنید.`;
  }
  return '';
}

function numericFieldError(resource, key, value) {
  if (typeof value !== 'number' && typeof value !== 'string') return `مقدار ${key} باید عددی باشد.`;
  const numeric = typeof value === 'string' ? Number(latinDigits(value.trim())) : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || !Number.isSafeInteger(numeric) && INTEGER_FIELDS[resource]?.includes(key)) {
    return INTEGER_FIELDS[resource]?.includes(key)
      ? `مقدار ${key} باید عدد صحیح و صفر یا بزرگ‌تر باشد.`
      : `مقدار ${key} باید عدد صفر یا بزرگ‌تر باشد.`;
  }
  if (POSITIVE_FIELDS[resource]?.includes(key) && numeric <= 0) return `مقدار ${key} باید بیشتر از صفر باشد.`;
  return '';
}

function enumFieldError(resource, record) {
  for (const [field, options] of Object.entries(ENUM_FIELDS[resource] || {})) {
    if (!Object.hasOwn(record, field)) continue;
    const value = normalizeText(record[field], 120);
    if (!value) { record[field] = ''; continue; }
    if (!options.includes(value)) return `مقدار «${field}» انتخاب معتبر ندارد.`;
    record[field] = value;
  }
  return '';
}

function json(res, status, value, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(JSON.stringify(value));
  return true;
}

function parseCookies(header = '') {
  const result = {};
  for (const part of header.split(';')) {
    const divider = part.indexOf('=');
    if (divider < 0) continue;
    const key = part.slice(0, divider).trim();
    try { result[key] = decodeURIComponent(part.slice(divider + 1).trim()); } catch { result[key] = ''; }
  }
  return result;
}

function isJsonRequest(req) {
  return /^application\/json(?:\s*;|$)/i.test(String(req.headers?.['content-type'] || ''));
}

async function readBody(req, maxBytes = MAX_BODY) {
  let length = 0;
  const chunks = [];
  for await (const chunk of req) {
    length += chunk.length;
    if (length > maxBytes) throw Object.assign(new Error('حجم اطلاعات ارسالی بیش از حد مجاز است.'), { statusCode: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const text = Buffer.concat(chunks).toString('utf8');
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('قالب اطلاعات معتبر نیست.');
    return parsed;
  } catch {
    throw Object.assign(new Error('اطلاعات ارسالی معتبر نیست.'), { statusCode: 400 });
  }
}

function normalizeText(value, max = 300) {
  return String(value ?? '').trim().slice(0, max);
}

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RATE_WINDOW_MS = 15 * 60 * 1000;
const OTP_PAIR_COOLDOWN_MS = 60 * 1000;
const OTP_RATE_LIMITS = { pair: 3, phone: 5, ip: 60 };
const OTP_MAX_STATE_ENTRIES = 10000;
const GENERIC_OTP_MESSAGE = 'اگر شمارهٔ واردشده به یک حساب فعال متصل باشد، کد ورود ارسال می‌شود.';
const LOGIN_MODES = new Set(['password', 'phone', 'both']);
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_USER_LIMIT = 7;
const LOGIN_IP_LIMIT = 60;
const LOGIN_MAX_ENTRIES = 10000;

function ensureLoginRateLimits(ctx, now = Date.now()) {
  if (!(ctx.loginAttempts instanceof Map)) ctx.loginAttempts = new Map();
  if (!(ctx.loginIpAttempts instanceof Map)) ctx.loginIpAttempts = new Map();
  for (const map of [ctx.loginAttempts, ctx.loginIpAttempts]) {
    for (const [key, attempt] of map) if (!attempt || attempt.until <= now) map.delete(key);
  }
}

function recordLoginFailure(map, key, now) {
  let attempt = map.get(key);
  if (!attempt || attempt.until <= now) attempt = { count: 0, until: now + LOGIN_WINDOW_MS, updatedAt: now };
  attempt.count += 1;
  attempt.updatedAt = now;
  if (!map.has(key) && map.size >= LOGIN_MAX_ENTRIES) {
    let oldestKey;
    let oldestAt = Infinity;
    for (const [candidate, value] of map) {
      if ((value.updatedAt || 0) < oldestAt) { oldestAt = value.updatedAt || 0; oldestKey = candidate; }
    }
    if (oldestKey !== undefined) map.delete(oldestKey);
  }
  map.set(key, attempt);
}

function loginRateLimit(ctx, ip, username, now = Date.now()) {
  ensureLoginRateLimits(ctx, now);
  const userAttempt = ctx.loginAttempts.get(`${ip}:${username}`);
  const ipAttempt = ctx.loginIpAttempts.get(ip);
  const blocked = userAttempt?.count >= LOGIN_USER_LIMIT ? userAttempt : ipAttempt?.count >= LOGIN_IP_LIMIT ? ipAttempt : null;
  return blocked ? Math.max(1, Math.ceil((blocked.until - now) / 1000)) : 0;
}

function normalizePhoneNumber(value) {
  const raw = latinDigits(String(value ?? '').replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')).trim();
  if (!raw || raw.length > 40 || /[\r\n]/.test(raw)) return '';
  const compact = raw.replace(/[\s().-]/g, '');
  if (!/^(?:\+|00)?\d+$/.test(compact)) return '';
  const international = compact.startsWith('+') || compact.startsWith('00');
  let digits = compact.replace(/[^0-9]/g, '');
  if (compact.startsWith('00')) digits = digits.slice(2);
  if (!international && /^09\d{9}$/.test(digits)) digits = `98${digits.slice(1)}`;
  else if (!international && /^9\d{9}$/.test(digits)) digits = `98${digits}`;
  else if (!international && !(digits.startsWith('98') && digits.length === 12)) return '';
  return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : '';
}

function normalizedLoginMode(settings = {}) {
  return LOGIN_MODES.has(settings.loginMode) ? settings.loginMode : 'password';
}

function smsConfigurationReady(sms = {}) {
  return Boolean(
    normalizeText(sms.apiKey, 512).length >= 8 &&
    normalizePhoneNumber(sms.fromNumber) &&
    normalizeText(sms.patternCode, 128) &&
    /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(String(sms.otpParam || 'code'))
  );
}

function publicSmsSettings(config = {}, managedFields = []) {
  const sms = config || {};
  return {
    configured: smsConfigurationReady(sms),
    apiKeyConfigured: normalizeText(sms.apiKey, 512).length >= 8,
    senderNumber: normalizeText(sms.fromNumber, 40),
    patternCode: normalizeText(sms.patternCode, 128),
    otpParam: normalizeText(sms.otpParam || 'code', 40),
    managedFields: [...new Set(managedFields)].filter((field) => ['apiKey', 'fromNumber', 'patternCode', 'otpParam'].includes(field))
  };
}

function ensureOtpState(ctx) {
  if (!(ctx.otpChallenges instanceof Map)) ctx.otpChallenges = new Map();
  if (!(ctx.otpRateLimits instanceof Map)) ctx.otpRateLimits = new Map();
  if (!Buffer.isBuffer(ctx.otpSecret) || ctx.otpSecret.length < 32) ctx.otpSecret = crypto.randomBytes(32);
  return { challenges: ctx.otpChallenges, rateLimits: ctx.otpRateLimits };
}

function pruneOtpState(ctx, now = Date.now()) {
  const { challenges, rateLimits } = ensureOtpState(ctx);
  for (const [id, challenge] of challenges) {
    if (challenge.expiresAt <= now || challenge.attempts >= OTP_MAX_ATTEMPTS) challenges.delete(id);
  }
  for (const [key, limit] of rateLimits) if (limit.resetAt <= now) rateLimits.delete(key);
  while (challenges.size > OTP_MAX_STATE_ENTRIES) challenges.delete(challenges.keys().next().value);
  while (rateLimits.size > OTP_MAX_STATE_ENTRIES) rateLimits.delete(rateLimits.keys().next().value);
  return { challenges, rateLimits };
}

function consumeOtpRateLimit(ctx, ip, phone, now = Date.now()) {
  const { rateLimits } = pruneOtpState(ctx, now);
  const policies = [
    { key: `pair:${ip}:${phone}`, limit: OTP_RATE_LIMITS.pair, cooldown: OTP_PAIR_COOLDOWN_MS },
    { key: `phone:${phone}`, limit: OTP_RATE_LIMITS.phone },
    { key: `ip:${ip}`, limit: OTP_RATE_LIMITS.ip }
  ];
  for (const policy of policies) {
    const current = rateLimits.get(policy.key);
    if (!current || current.resetAt <= now) continue;
    if (current.count >= policy.limit) return Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    if (policy.cooldown && now - current.lastAt < policy.cooldown) return Math.max(1, Math.ceil((policy.cooldown - (now - current.lastAt)) / 1000));
  }
  for (const policy of policies) {
    const current = rateLimits.get(policy.key);
    const next = current && current.resetAt > now ? current : { count: 0, resetAt: now + OTP_RATE_WINDOW_MS };
    next.count += 1;
    next.lastAt = now;
    rateLimits.set(policy.key, next);
  }
  return 0;
}

function otpDigest(ctx, challengeId, code) {
  return crypto.createHmac('sha256', ctx.otpSecret).update(`${challengeId}:${code}`).digest();
}

function requestUsesTrustedProxy(req, ctx = {}) {
  let remote = String(req.socket?.remoteAddress || 'local');
  if (remote.startsWith('::ffff:')) remote = remote.slice(7);
  return Boolean(ctx.trustProxy || remote === '127.0.0.1' || remote === '::1');
}

function clientIp(req, ctx) {
  let remote = String(req.socket?.remoteAddress || 'local');
  if (remote.startsWith('::ffff:')) remote = remote.slice(7);
  if (requestUsesTrustedProxy(req, ctx)) {
    const forwarded = String(req.headers?.['x-forwarded-for'] || '')
      .split(',').map((value) => value.trim()).filter((value) => net.isIP(value));
    const forwardedIp = forwarded.reverse().find((value) => value !== '127.0.0.1' && value !== '::1');
    if (forwardedIp) return forwardedIp;
  }
  return remote || 'local';
}

function isSecureRequest(req, ctx) {
  if (req.socket?.encrypted) return true;
  if (!requestUsesTrustedProxy(req, ctx)) return false;
  const forwardedProto = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  return forwardedProto === 'https';
}

function issueAuthSession(req, res, ctx, user, settings) {
  if (!(ctx.sessions instanceof Map)) ctx.sessions = new Map();
  const now = Date.now();
  for (const [existingToken, session] of ctx.sessions) if (!session || session.expiresAt <= now) ctx.sessions.delete(existingToken);
  while (ctx.sessions.size >= MAX_AUTH_SESSIONS) {
    const oldestToken = ctx.sessions.keys().next().value;
    if (oldestToken === undefined) break;
    ctx.sessions.delete(oldestToken);
  }
  const token = crypto.randomBytes(32).toString('hex');
  ctx.sessions.set(token, { userId: user.id, expiresAt: now + 8 * 60 * 60 * 1000 });
  const secure = isSecureRequest(req, ctx);
  const cookie = `mad_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800${secure ? '; Secure' : ''}`;
  return json(res, 200, { user: safeUser(user), settings: publicSettings(settings), ...(ctx.demoMode ? { demoSessionToken: token } : {}) }, { 'Set-Cookie': cookie });
}

async function sendIppanelOtp({ config, phone, code }) {
  const sms = config || {};
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch('https://edge.ippanel.com/v1/api/send', {
      method: 'POST',
      headers: { Authorization: normalizeText(sms.apiKey, 512), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sending_type: 'pattern',
        from_number: normalizePhoneNumber(sms.fromNumber),
        code: normalizeText(sms.patternCode, 128),
        recipients: [phone],
        params: { [sms.otpParam || 'code']: code }
      }),
      signal: controller.signal
    });
    let result = null;
    try { result = await response.json(); } catch { /* Treat non-JSON as a delivery failure. */ }
    if (!response.ok || !result || result.meta?.status !== true || result.success === false || result.errors) throw new Error('IPPanel delivery failed');
  } finally {
    clearTimeout(timeout);
  }
}

function faNumber(value) {
  return new Intl.NumberFormat('fa-IR').format(Number(value || 0));
}

function publicSettings(settings) {
  const schedule = getSchoolSchedule(settings);
  return {
    schoolName: settings.schoolName,
    schoolNameEn: settings.schoolNameEn,
    academicYear: settings.academicYear,
    phone: settings.phone,
    email: settings.email,
    address: settings.address,
    timezone: settings.timezone,
    currency: settings.currency,
    schoolDays: schedule.schoolDays,
    schoolPeriods: schedule.schoolPeriods,
    installed: Boolean(settings.installed),
    installedAt: settings.installedAt || null,
    loginMode: normalizedLoginMode(settings)
  };
}

function linkedAccountError(state, user) {
  if (!user || user.status === 'غیرفعال') return 'حساب کاربری فعال نیست.';
  const records = state.records || {};
  if (user.role === 'student') {
    const student = (records.students || []).find((entry) => entry.id === user.studentId);
    return student?.status === 'فعال' ? '' : 'پروندهٔ دانش‌آموزی این حساب فعال نیست.';
  }
  if (user.role === 'teacher') {
    const teacher = (records.teachers || []).find((entry) => entry.id === user.teacherId);
    return teacher?.status === 'فعال' ? '' : 'پروندهٔ معلم این حساب فعال نیست.';
  }
  if (user.role === 'parent') {
    const parent = (records.parents || []).find((entry) => entry.id === user.parentId);
    if (user.parentId && (!parent || parent.status !== 'فعال')) return 'پروندهٔ ولی این حساب فعال نیست.';
    const linkedIds = accountStudentIds(user);
    for (const id of parent?.studentIds || []) linkedIds.add(id);
    return (records.students || []).some((entry) => linkedIds.has(entry.id) && entry.status === 'فعال') ? '' : 'این حساب به دانش‌آموز فعالی متصل نیست.';
  }
  return '';
}

function linkedAccountIsActive(state, user) {
  return !linkedAccountError(state, user);
}

function revokeUserSessions(ctx, userId) {
  if (ctx.sessions instanceof Map) {
    for (const [token, session] of ctx.sessions) if (session.userId === userId) ctx.sessions.delete(token);
  }
  if (ctx.otpChallenges instanceof Map) {
    for (const [challengeId, challenge] of ctx.otpChallenges) if (challenge.userId === userId) ctx.otpChallenges.delete(challengeId);
  }
}

function syncLinkedAccountState(state, resource, record, previous = {}) {
  const invalidate = [];
  const listChanged = (left, right) => JSON.stringify(left || []) !== JSON.stringify(right || []);
  for (const account of state.users || []) {
    if (resource === 'students' && account.studentId === record.id) {
      if (record.status !== 'فعال') account.status = 'غیرفعال';
      if (record.status !== previous.status || record.classId !== previous.classId) invalidate.push(account.id);
    }
    if (resource === 'teachers' && account.teacherId === record.id) {
      if (record.status !== 'فعال') account.status = 'غیرفعال';
      if (record.status !== previous.status || listChanged(record.classIds, previous.classIds)) invalidate.push(account.id);
    }
    if (resource !== 'parents' || account.role !== 'parent' || account.parentId !== record.id) continue;
    const linkedIds = new Set(Array.isArray(record.studentIds) ? record.studentIds : []);
    if (Array.isArray(account.studentIds)) account.studentIds = account.studentIds.filter((id) => linkedIds.has(id));
    if (!linkedIds.size) {
      delete account.studentId;
      account.status = 'غیرفعال';
    } else if (!linkedIds.has(account.studentId)) {
      account.studentId = linkedIds.values().next().value;
    }
    if (record.status !== 'فعال') account.status = 'غیرفعال';
    if (record.status !== previous.status || listChanged(record.studentIds, previous.studentIds)) invalidate.push(account.id);
  }
  return invalidate;
}

function getSessionUser(req, state, ctx) {
  const cookieToken = parseCookies(req.headers.cookie).mad_session;
  const headerToken = ctx.demoMode ? normalizeText(req.headers['x-demo-session'], 64) : '';
  const token = /^[a-f0-9]{64}$/i.test(headerToken) ? headerToken : cookieToken;
  if (token) {
    const session = ctx.sessions.get(token);
    if (!session || session.expiresAt <= Date.now()) {
      if (session) ctx.sessions.delete(token);
      if (!ctx.demoMode) return null;
    } else {
      const sessionUser = state.users.find((entry) => entry.id === session.userId);
      if (!linkedAccountIsActive(state, sessionUser)) {
        ctx.sessions.delete(token);
        if (!ctx.demoMode) return null;
      } else return sessionUser;
    }
  }
  if (ctx.demoMode) {
    const user = state.users.find((entry) => entry.id === 'usr-demo-admin');
    return linkedAccountIsActive(state, user) ? user : null;
  }
  return null;
}

function moduleEnabled(state, id) {
  const item = state.modules.find((entry) => entry.id === id);
  return !item || item.enabled !== false || item.locked;
}

function rolePermissionDefaults(role) {
  const reads = roleResources[role];
  return {
    moduleIds: modules.filter((item) => item.roles.includes(role)).map((item) => item.id),
    readResources: reads ? [...reads].filter((resource) => resource !== '*') : [],
    writeResources: Object.keys(WRITE_ROLES).filter((resource) => (WRITE_ROLES[resource] || []).includes(role))
  };
}

function effectiveRolePermissions(state, role) {
  const defaults = rolePermissionDefaults(role);
  if (role === 'admin') return { moduleIds: defaults.moduleIds, readResources: ['*'], writeResources: ['*'] };
  const configured = (state.roles || []).find((entry) => entry.id === role) || {};
  if (configured.isCustom) {
    const allowedModules = modules.filter((item) => !CUSTOM_ROLE_RESERVED_MODULES.has(item.id)).map((item) => item.id);
    const moduleIds = Array.isArray(configured.moduleIds) ? configured.moduleIds.filter((id) => allowedModules.includes(id)) : ['dashboard'];
    const readResources = Array.isArray(configured.readResources) ? configured.readResources.filter((resource) => CUSTOM_ROLE_READABLE_RESOURCES.has(resource)) : [];
    const writeResources = (Array.isArray(configured.writeResources) ? configured.writeResources.filter((resource) => CUSTOM_ROLE_WRITABLE_RESOURCES.has(resource)) : []).filter((resource) => readResources.includes(resource));
    return { moduleIds: [...new Set(['dashboard', ...moduleIds])], readResources: [...new Set([...readResources, ...writeResources])], writeResources: [...new Set(writeResources)] };
  }
  const moduleIds = Array.isArray(configured.moduleIds)
    ? configured.moduleIds.filter((id) => defaults.moduleIds.includes(id))
    : defaults.moduleIds;
  const readResources = Array.isArray(configured.readResources)
    ? configured.readResources.filter((resource) => defaults.readResources.includes(resource))
    : defaults.readResources;
  const writeResources = (Array.isArray(configured.writeResources)
    ? configured.writeResources.filter((resource) => defaults.writeResources.includes(resource))
    : defaults.writeResources).filter((resource) => readResources.includes(resource));
  return { moduleIds: [...new Set(moduleIds)], readResources: [...new Set([...readResources, ...writeResources])], writeResources: [...new Set(writeResources)] };
}

function roleCanUseModule(user, id, state) {
  const definition = modules.find((entry) => entry.id === id);
  const roleConfig = (state.roles || []).find((entry) => entry.id === user.role);
  const isCustomRole = Boolean(roleConfig?.isCustom);
  if (!definition || (!isCustomRole && !definition.roles.includes(user.role)) || !moduleEnabled(state, id)) return false;
  const permissions = effectiveRolePermissions(state, user.role);
  if (!permissions.moduleIds.includes(id)) return false;
  return !collectionNames.has(id) || allowedResource(user, id, state);
}

function allowedResource(user, resource, state) {
  if (user.role === 'admin') return true;
  return effectiveRolePermissions(state, user.role).readResources.includes(resource);
}

function canWriteResource(user, resource, state) {
  if (user.role === 'admin') return true;
  return effectiveRolePermissions(state, user.role).writeResources.includes(resource);
}

function teacherClassIds(state, user) {
  const ids = new Set();
  const teacher = (state.records.teachers || []).find((entry) => entry.id === user.teacherId);
  for (const id of teacher?.classIds || []) ids.add(id);
  for (const classroom of state.records.classes || []) if (classroom.teacherId === user.teacherId) ids.add(classroom.id);
  for (const resource of ['timetable', 'assignments', 'exams']) {
    for (const row of state.records[resource] || []) if (row.teacherId === user.teacherId && row.classId) ids.add(row.classId);
  }
  return ids;
}

function customRoleConfig(state, userOrRole) {
  const role = typeof userOrRole === 'string' ? userOrRole : userOrRole?.role;
  return (state.roles || []).find((entry) => entry.id === role && entry.isCustom) || null;
}

function roleClassIds(state, user) {
  if (user.role === 'admin') return new Set((state.records.classes || []).map((entry) => entry.id));
  if (user.role === 'teacher') return teacherClassIds(state, user);
  const custom = customRoleConfig(state, user);
  if (!custom) return new Set();
  if (custom.scope === 'school') return new Set((state.records.classes || []).map((entry) => entry.id));
  return new Set((user.classIds || []).filter((id) => (state.records.classes || []).some((classroom) => classroom.id === id)));
}

function customRecordsForRole(state, user, resource, records) {
  const config = customRoleConfig(state, user);
  if (!config || ['users', 'roles', 'audit', 'modules', 'reports'].includes(resource)) return [];
  if (config.scope === 'school') {
    if (['notices', 'events', 'documents'].includes(resource)) return audienceVisibleRecords(state, user, resource, records, state.records.students || []);
    return [...records];
  }
  const classIds = roleClassIds(state, user);
  if (resource === 'classes') return records.filter((entry) => classIds.has(entry.id));
  const studentRows = (state.records.students || []).filter((entry) => classIds.has(entry.classId));
  const studentIds = new Set(studentRows.map((entry) => entry.id));
  if (resource === 'students') return studentRows;
  if (resource === 'parents') return records.filter((entry) => (entry.studentIds || []).some((id) => studentIds.has(id)));
  if (['attendance', 'grades', 'finance', 'tickets'].includes(resource)) return records.filter((entry) => classIds.has(entry.classId) || studentIds.has(entry.studentId));
  if (['assignments', 'exams', 'timetable'].includes(resource)) return records.filter((entry) => classIds.has(entry.classId));
  if (resource === 'subjects') {
    const grades = new Set(studentRows.map((student) => (state.records.classes || []).find((entry) => entry.id === student.classId)?.grade).filter(Boolean));
    return records.filter((entry) => grades.has(entry.grade));
  }
  if (['notices', 'events', 'documents'].includes(resource)) return audienceVisibleRecords(state, user, resource, records, studentRows);
  if (resource === 'teachers') {
    const teacherIds = new Set([...classIds].map((id) => (state.records.classes || []).find((entry) => entry.id === id)?.teacherId).filter(Boolean));
    return records.filter((entry) => teacherIds.has(entry.id));
  }
  return records.filter((entry) => entry.classId ? classIds.has(entry.classId) : false);
}

function customWriteAllowedByScope(state, user, resource, record) {
  const config = customRoleConfig(state, user);
  if (!config) return true;
  if (config.scope === 'school') return true;
  if (!CUSTOM_ROLE_CLASS_WRITABLE_RESOURCES.has(resource)) return false;
  const classIds = roleClassIds(state, user);
  const students = state.records.students || [];
  if (resource === 'students') return classIds.has(record.classId);
  if (resource === 'classes') return Boolean(record.id && classIds.has(record.id));
  if (resource === 'parents') return Array.isArray(record.studentIds) && record.studentIds.length > 0 && record.studentIds.every((id) => students.some((student) => student.id === id && classIds.has(student.classId)));
  if (resource === 'attendance') {
    const student = students.find((entry) => entry.id === record.studentId);
    return Boolean(student && classIds.has(record.classId || student.classId));
  }
  if (['grades', 'finance'].includes(resource)) {
    const student = students.find((entry) => entry.id === record.studentId);
    return Boolean(student && classIds.has(student.classId) && (!record.classId || record.classId === student.classId));
  }
  if (['tickets', 'assignments', 'exams', 'timetable'].includes(resource)) {
    if (record.classId) return classIds.has(record.classId);
    const student = students.find((entry) => entry.id === record.studentId);
    return Boolean(student && classIds.has(student.classId));
  }
  if (resource === 'subjects') {
    const grades = new Set([...classIds].map((id) => (state.records.classes || []).find((entry) => entry.id === id)?.grade).filter(Boolean));
    return grades.has(record.grade);
  }
  return false;
}

function academicYearKey(value) {
  return latinDigits(normalizeText(value, 64).normalize('NFKC'))
    .replace(/[–—−]/g, '-')
    .replace(/\s+/g, '')
    .toLocaleLowerCase('fa');
}

function academicYearOptions(records, configuredYear = '') {
  const years = new Map();
  const add = (value) => {
    const label = normalizeText(value, 64);
    const key = academicYearKey(label);
    if (key && !years.has(key)) years.set(key, label);
  };
  add(configuredYear);
  for (const record of records || []) add(record.academicYear || configuredYear);
  return [...years.values()].sort((a, b) => String(b).localeCompare(String(a), 'fa'));
}

function validateTimetableEntry(records, record, exceptId = '', settings = {}, classes = []) {
  const schedule = getSchoolSchedule(settings);
  const day = canonicalWeekday(record.day);
  if (!day || !schedule.schoolDays.includes(day)) return { status: 400, message: 'روز برنامه باید یکی از روزهای آموزشی تعریف‌شده در تنظیمات مدرسه باشد.' };

  const periods = schedule.schoolPeriods;
  let period = periods.find((item) => item.id === normalizeText(record.periodId, 40));
  if (!period && !record.periodId) {
    const legacyStart = parseClock(record.startTime);
    const legacyEnd = parseClock(record.endTime);
    if (legacyStart && legacyEnd) period = periods.find((item) => item.startTime === legacyStart.value && item.endTime === legacyEnd.value);
  }
  if (!period) return { status: 400, message: 'زنگ را از فهرست زنگ‌های تعریف‌شده در تنظیمات مدرسه انتخاب کنید.' };

  const classroom = (classes || []).find((item) => item.id === record.classId);
  const classShift = shiftKey(classroom?.shift);
  if (period.shift !== 'همه' && classShift && classShift !== 'همه' && period.shift !== classShift) {
    return { status: 400, message: `زنگ «${period.name}» با نوبت ${classroom?.shift || 'کلاس'} هم‌خوانی ندارد.` };
  }

  const start = parseClock(period.startTime);
  const end = parseClock(period.endTime);
  if (!start || !end || end.minutes <= start.minutes) return { status: 400, message: 'ساعت زنگ انتخاب‌شده در تنظیمات معتبر نیست.' };
  const academicYear = normalizeText(record.academicYear || settings.academicYear, 64);
  if (!academicYear) return { status: 400, message: 'سال تحصیلی برای برنامهٔ هفتگی الزامی است.' };
  record.day = day;
  record.periodId = period.id;
  record.periodName = period.name;
  record.startTime = start.value;
  record.endTime = end.value;
  record.academicYear = academicYear;

  const normalizeRoom = (value) => normalizeText(value, 80).normalize('NFKC').replace(/\s+/g, '').toLocaleLowerCase('fa');
  const room = normalizeRoom(record.room);
  const currentYear = academicYearKey(record.academicYear);
  for (const existing of records || []) {
    if (existing.id === exceptId || canonicalWeekday(existing.day) !== day) continue;
    if (academicYearKey(existing.academicYear || settings.academicYear) !== currentYear) continue;
    const existingPeriod = periods.find((item) => item.id === existing.periodId);
    const existingStart = parseClock(existingPeriod?.startTime || existing.startTime);
    const existingEnd = parseClock(existingPeriod?.endTime || existing.endTime);
    if (!existingStart || !existingEnd || existingEnd.minutes <= existingStart.minutes) continue;
    const overlaps = start.minutes < existingEnd.minutes && existingStart.minutes < end.minutes;
    if (!overlaps) continue;
    const sameClass = record.classId && record.classId === existing.classId;
    const sameTeacher = record.teacherId && existing.teacherId && record.teacherId === existing.teacherId;
    const existingRoom = normalizeRoom(existing.room);
    const sameRoom = room && existingRoom && room === existingRoom;
    if (sameClass || sameTeacher || sameRoom) {
      const reason = sameClass ? 'کلاس' : sameTeacher ? 'معلم' : 'اتاق';
      return { status: 409, message: `این زنگ با برنامهٔ دیگری در همان بازه برای ${reason} تداخل دارد (${existing.subject || 'درس ثبت‌شده'}، ${existing.startTime} تا ${existing.endTime}).` };
    }
  }
  return null;
}

function accountStudentIds(user) {
  const ids = new Set();
  if (user.studentId) ids.add(user.studentId);
  for (const id of user.studentIds || []) ids.add(id);
  return ids;
}

function normalizeAudience(value) {
  return normalizeText(value, 120).normalize('NFKC')
    .replace(/[\u200c\u200d]/g, ' ')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('fa');
}

function audienceMatches(record, user, studentRows, state) {
  const audience = normalizeAudience(record.audience);
  if (!audience || /^(همه|عمومی|همه مخاطبان|تمام کاربران)$/.test(audience)) return true;

  const gradeMatch = audience.match(/پایه\s+(هفتم|هشتم|نهم|دهم|یازدهم|دوازدهم|[۰-۹0-9]+)/);
  const targetGrade = gradeMatch ? normalizeAudience(gradeMatch[1]) : '';
  const grades = new Set(studentRows.map((student) => {
    const classroom = (state.records.classes || []).find((item) => item.id === student.classId);
    return classroom ? normalizeAudience(classroom.grade).replace(/^پایه\s*/, '') : '';
  }).filter(Boolean));
  if (targetGrade && !grades.has(targetGrade)) return false;

  const customRole = (state.roles || []).find((role) => role.id === user.role && role.isCustom);
  if (/(معلم|کارکنان|دبیر)/.test(audience)) return user.role === 'teacher' || Boolean(customRole);
  if (/(اولیا|والد|سرپرست)/.test(audience)) return user.role === 'parent' && (!targetGrade || grades.has(targetGrade));
  if (/(دانش ?آموز|شاگرد)/.test(audience)) return user.role === 'student' && (!targetGrade || grades.has(targetGrade));
  if (targetGrade) return ['student', 'parent', 'teacher'].includes(user.role) && grades.has(targetGrade) || Boolean(customRole && (customRole.scope === 'school' || grades.has(targetGrade)));
  return false;
}

function audienceVisibleRecords(state, user, resource, records, studentRows) {
  return (records || []).filter((record) => {
    if (!audienceMatches(record, user, studentRows, state)) return false;
    if (resource === 'notices' || resource === 'documents') {
      if (record.status !== 'منتشرشده') return false;
    }
    if (resource === 'notices' && record.publishDate) {
      const publishDate = calendarDateISO(String(record.publishDate));
      if (!publishDate || publishDate > schoolDateISO(state.settings?.timezone || 'Asia/Tehran')) return false;
    }
    return true;
  });
}

function recordsForRole(state, user, resource) {
  let records;
  if (collectionNames.has(resource)) records = state.records[resource] || [];
  else if (resource === 'users') records = state.users.map((entry) => ({ ...safeUser(entry), roleName: (state.roles || []).find((role) => role.id === entry.role)?.name || ({ admin: 'مدیر مدرسه', teacher: 'معلم', student: 'دانش‌آموز', parent: 'ولی دانش‌آموز' })[entry.role] || entry.role }));
  else if (resource === 'roles') records = (state.roles || []).map((entry) => ({ ...entry, ...effectiveRolePermissions(state, entry.id), users: (state.users || []).filter((user) => user.role === entry.id).length }));
  else if (resource === 'audit') records = state.auditLogs || [];
  else if (resource === 'modules') records = state.modules || [];
  else if (resource === 'reports') records = makeReports(state);
  else return null;

  if (!allowedResource(user, resource, state)) return [];
  if (user.role === 'admin') return [...records];
  if (user.role === 'teacher') {
    const ownClassIds = teacherClassIds(state, user);
    if (resource === 'classes') return records.filter((entry) => ownClassIds.has(entry.id));
    if (resource === 'teachers') return records.filter((entry) => entry.id === user.teacherId);
    if (resource === 'students' || resource === 'parents') {
      const ownStudentIds = new Set((state.records.students || []).filter((entry) => ownClassIds.has(entry.classId)).map((entry) => entry.id));
      return records.filter((entry) => resource === 'students' ? ownClassIds.has(entry.classId) : (entry.studentIds || []).some((id) => ownStudentIds.has(id)));
    }
    if (['attendance', 'assignments', 'exams', 'grades', 'timetable'].includes(resource)) return records.filter((entry) => ownClassIds.has(entry.classId));
    if (resource === 'tickets') return records.filter((entry) => entry.teacherId === user.teacherId || ownClassIds.has(entry.classId));
    if (['notices', 'events', 'documents'].includes(resource)) {
      const studentRows = (state.records.students || []).filter((entry) => ownClassIds.has(entry.classId));
      return audienceVisibleRecords(state, user, resource, records, studentRows);
    }
    if (resource === 'users') return [];
    if (resource === 'audit' || resource === 'roles' || resource === 'modules' || resource === 'reports') return [];
    return records;
  }
  if (customRoleConfig(state, user)) return customRecordsForRole(state, user, resource, records);
  const studentIds = accountStudentIds(user);
  if (user.role === 'parent' && user.parentId) {
    const parentRecord = (state.records.parents || []).find((entry) => entry.id === user.parentId);
    for (const id of parentRecord?.studentIds || []) studentIds.add(id);
  }
  const studentRows = (state.records.students || []).filter((entry) => studentIds.has(entry.id));
  if (['notices', 'events', 'documents'].includes(resource)) {
    records = audienceVisibleRecords(state, user, resource, records, studentRows);
  }
  const classIds = new Set(studentRows.map((entry) => entry.classId));
  const ownParent = user.parentId;
  if (resource === 'students') return records.filter((entry) => studentIds.has(entry.id));
  if (resource === 'parents') return records.filter((entry) => entry.id === ownParent || (entry.studentIds || []).some((id) => studentIds.has(id)));
  if (resource === 'attendance' || resource === 'grades' || resource === 'finance' || resource === 'tickets') return records.filter((entry) => studentIds.has(entry.studentId));
  if (['assignments', 'exams', 'timetable'].includes(resource)) return records.filter((entry) => classIds.has(entry.classId));
  if (resource === 'classes') return records.filter((entry) => classIds.has(entry.id));
  if (resource === 'subjects') {
    const grades = new Set(studentRows.map((student) => (state.records.classes || []).find((entry) => entry.id === student.classId)?.grade).filter(Boolean));
    return records.filter((entry) => grades.has(entry.grade));
  }
  if (resource === 'users' || resource === 'audit' || resource === 'roles' || resource === 'modules' || resource === 'reports') return [];
  return records;
}

function makeReports(state) {
  const records = state.records;
  const today = schoolDateISO(state.settings?.timezone || 'Asia/Tehran');
  const attendanceToday = (records.attendance || []).filter((item) => item.date === today);
  const paid = (records.finance || []).filter((item) => item.status === 'پرداخت‌شده');
  return [
    { id: 'report-students', name: 'آمار دانش‌آموزان', value: (records.students || []).length, detail: 'به تفکیک پایه و کلاس', category: 'آموزشی' },
    { id: 'report-attendance', name: 'حضور و غیاب امروز', value: attendanceToday.length, detail: 'ثبت‌های روز جاری', category: 'آموزشی' },
    { id: 'report-tickets', name: 'تیکت‌های باز', value: (records.tickets || []).filter((item) => item.status !== 'بسته').length, detail: 'نیازمند پیگیری', category: 'ارتباطات' },
    { id: 'report-finance', name: 'پرداخت‌های ثبت‌شده', value: paid.length, detail: 'تراکنش‌های موفق', category: 'مالی' }
  ];
}

function dashboardFor(state, user) {
  const today = schoolDateISO(state.settings?.timezone || 'Asia/Tehran');
  const visibleStudents = recordsForRole(state, user, 'students') || [];
  const visibleClasses = recordsForRole(state, user, 'classes') || [];
  const visibleAttendance = moduleEnabled(state, 'attendance') ? (recordsForRole(state, user, 'attendance') || []) : [];
  const visibleTickets = moduleEnabled(state, 'tickets') ? (recordsForRole(state, user, 'tickets') || []) : [];
  const financeRows = moduleEnabled(state, 'finance') && allowedResource(user, 'finance', state) ? (recordsForRole(state, user, 'finance') || []) : [];
  const todayAttendance = visibleAttendance.filter((entry) => entry.date === today);
  const present = todayAttendance.filter((entry) => entry.status === 'حاضر').length;
  const late = todayAttendance.filter((entry) => entry.status === 'با تأخیر').length;
  const absent = todayAttendance.filter((entry) => entry.status === 'غایب').length;
  const attendanceRateRows = todayAttendance.filter((entry) => ['حاضر', 'با تأخیر', 'غایب'].includes(entry.status));
  const openTickets = visibleTickets.filter((entry) => entry.status !== 'بسته');
  const recentTickets = [...visibleTickets].sort((a, b) => String(b.lastReplyAt || b.createdAt || '').localeCompare(String(a.lastReplyAt || a.createdAt || ''))).slice(0, 4);
  const upcoming = (recordsForRole(state, user, 'timetable') || []).slice(0, 4);
  const activeStudents = visibleStudents.filter((item) => item.status !== 'غیرفعال').length;
  return {
    counts: {
      students: user.role === 'admin' ? (state.records.students || []).length : activeStudents,
      teachers: user.role === 'admin' ? (state.records.teachers || []).length : user.role === 'teacher' ? 1 : allowedResource(user, 'teachers', state) ? (recordsForRole(state, user, 'teachers') || []).length : 0,
      classes: user.role === 'admin' ? (state.records.classes || []).length : visibleClasses.length,
      present, late, absent,
      attendanceRecorded: todayAttendance.length,
      attendanceRate: attendanceRateRows.length ? Math.round((present + late) * 100 / attendanceRateRows.length) : 0,
      openTickets: openTickets.length,
      ticketTotal: visibleTickets.length,
      assignments: moduleEnabled(state, 'assignments') ? (recordsForRole(state, user, 'assignments') || []).length : 0,
      financePending: financeRows.filter((entry) => entry.status !== 'پرداخت‌شده').length,
      financeTotal: financeRows.length,
      financePaid: financeRows.filter((entry) => entry.status === 'پرداخت‌شده').length
    },
    recentTickets,
    upcoming: moduleEnabled(state, 'timetable') ? upcoming : [],
    recentNotices: moduleEnabled(state, 'notices') ? (recordsForRole(state, user, 'notices') || []).slice(0, 3) : [],
    classDistribution: (recordsForRole(state, user, 'classes') || []).map((item) => ({ id: item.id, name: item.name, count: item.studentCount || 0, capacity: item.capacity || 0, grade: item.grade })),
    weeklyAttendance: moduleEnabled(state, 'attendance') ? makeWeeklyAttendance(state, user) : []
  };
}

function makeWeeklyAttendance(state, user) {
  const attendance = recordsForRole(state, user, 'attendance') || [];
  const names = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه', 'شنبه'];
  const result = [];
  const today = schoolDateISO(state.settings?.timezone || 'Asia/Tehran');
  const base = new Date(`${today}T12:00:00.000Z`);
  for (let offset = 6; offset >= 0; offset -= 1) {
    const day = new Date(base);
    day.setUTCDate(base.getUTCDate() - offset);
    const iso = day.toISOString().slice(0, 10);
    const count = attendance.filter((entry) => entry.date === iso && ['حاضر', 'با تأخیر'].includes(entry.status)).length;
    result.push({ date: iso, name: names[day.getUTCDay()], count });
  }
  return result;
}

function addAudit(state, user, action, resource, recordId, description) {
  if (!Array.isArray(state.auditLogs)) state.auditLogs = [];
  state.auditLogs.unshift({
    id: randomId('log'), userId: user.id, userName: user.name, role: user.role,
    action, resource, recordId: recordId || '', description: normalizeText(description, 250),
    at: new Date().toISOString()
  });
  state.auditLogs = state.auditLogs.slice(0, 10000);
}

function isValidUsername(username) {
  return /^[a-zA-Z0-9._-]{3,40}$/.test(username);
}

function ensureUniqueUsername(state, username, exceptId = '') {
  return !state.users.some((user) => String(user.username || '').toLowerCase() === username.toLowerCase() && user.id !== exceptId);
}

function hasDuplicateUserPhone(state, value, exceptId = '') {
  const phone = normalizePhoneNumber(value);
  return Boolean(phone && (state.users || []).some((user) => user.id !== exceptId && user.status !== 'غیرفعال' && normalizePhoneNumber(user.phone) === phone));
}

function otpAccountReadinessError(loginMode, users = []) {
  if (!['phone', 'both'].includes(loginMode)) return '';
  const phoneCounts = new Map();
  for (const account of users || []) {
    if (account.status === 'غیرفعال') continue;
    const phone = normalizePhoneNumber(account.phone);
    if (phone) phoneCounts.set(phone, (phoneCounts.get(phone) || 0) + 1);
  }
  const uniquePhoneUsers = (users || []).filter((account) => account.status !== 'غیرفعال' && phoneCounts.get(normalizePhoneNumber(account.phone)) === 1);
  if (!uniquePhoneUsers.length) return 'پیش از فعال‌سازی پیامک، دست‌کم یک حساب فعال با شمارهٔ موبایل معتبر و یکتا ثبت کنید.';
  if (loginMode === 'phone' && !uniquePhoneUsers.some((account) => account.role === 'admin')) {
    return 'برای جلوگیری از قفل‌شدن سامانه، حالت فقط پیامکی به شمارهٔ یکتای یک مدیر فعال نیاز دارد.';
  }
  return '';
}

function validateRoleAccess(user, resource, method, state) {
  if (!allowedResource(user, resource, state)) return `به بخش «${resource}» دسترسی ندارید.`;
  const write = method !== 'GET';
  if (write && !canWriteResource(user, resource, state)) return 'اجازه انجام این تغییر را ندارید.';
  return '';
}

function cloneInput(body) {
  const result = {};
  const excluded = new Set(['id', 'isDemo', 'passwordHash', 'password', 'createdAt', 'updatedAt', 'accountPassword', 'accountUsername', 'reply', 'firstMessage']);
  for (const [key, value] of Object.entries(body)) {
    if (excluded.has(key) || key.startsWith('_')) continue;
    if (typeof value === 'string') result[key] = normalizeText(value, 4000);
    else if (Array.isArray(value)) result[key] = value.slice(0, 100).map((item) => typeof item === 'string' ? normalizeText(item, 300) : item);
    else if (typeof value === 'number' || typeof value === 'boolean' || value === null) result[key] = value;
  }
  return result;
}

function hasRecord(state, resource, id) {
  return Boolean(id && (state.records[resource] || []).some((item) => item.id === id));
}

function validateRecordReferences(state, resource, record, { allowHistoricalAttendance = false } = {}) {
  const exists = (collection, id) => hasRecord(state, collection, id);
  if (resource === 'students' && !exists('classes', record.classId)) return 'کلاس انتخاب‌شده وجود ندارد.';
  if (resource === 'teachers') {
    if (!Array.isArray(record.classIds || [])) return 'کلاس‌های مسئولیت باید به‌صورت فهرست ارسال شوند.';
    if ((record.classIds || []).some((id) => !exists('classes', id))) return 'یکی از کلاس‌های انتخاب‌شده وجود ندارد.';
  }
  if (resource === 'parents' && (!Array.isArray(record.studentIds || []) || (record.studentIds || []).some((id) => !exists('students', id)))) return 'یکی از پرونده‌های دانش‌آموزی انتخاب‌شده وجود ندارد.';
  if (['classes', 'subjects', 'timetable'].includes(resource) && record.teacherId && !exists('teachers', record.teacherId)) return 'معلم انتخاب‌شده در پرونده‌ها پیدا نشد.';
  if (['timetable', 'assignments', 'exams'].includes(resource) && !exists('classes', record.classId)) return 'کلاس انتخاب‌شده وجود ندارد.';
  if (resource === 'timetable' && record.subjectId) {
    const subject = (state.records.subjects || []).find((item) => item.id === record.subjectId);
    if (!subject) return 'درس انتخاب‌شده در فهرست درس‌ها پیدا نشد.';
    record.subject = subject.name;
  }
  if (['attendance', 'grades', 'finance'].includes(resource)) {
    const student = (state.records.students || []).find((item) => item.id === record.studentId);
    if (!student) return 'دانش‌آموز انتخاب‌شده در پرونده‌ها پیدا نشد.';
    if (resource === 'finance') return '';
    if (record.classId && record.classId !== student.classId && !(resource === 'attendance' && allowHistoricalAttendance)) return 'کلاس انتخاب‌شده با پرونده دانش‌آموز هم‌خوانی ندارد.';
    if (record.classId && !exists('classes', record.classId)) return 'کلاس انتخاب‌شده وجود ندارد.';
  }
  if (resource === 'tickets' && record.studentId && !exists('students', record.studentId)) return 'دانش‌آموز مرتبط در پرونده‌ها پیدا نشد.';
  return '';
}

function sanitizeUserInput(body) {
  const username = normalizeText(body.accountUsername || body.username, 40).toLowerCase();
  const password = String(body.accountPassword || body.password || '');
  return { username, password };
}

function modulePayload(state, user) {
  return state.modules
    .filter((item) => roleCanUseModule(user, item.id, state))
    .map((item) => {
      const writable = canWriteResource(user, item.id, state);
      return {
        ...item,
        enabled: item.locked ? true : item.enabled !== false,
        permissions: {
          canCreate: writable,
          canUpdate: writable,
          canDelete: user.role === 'admin' && (collectionNames.has(item.id) || item.id === 'users')
        }
      };
    });
}

async function applyInstallation(state, fields, adminUser, preserveDemo) {
  if (!preserveDemo) {
    for (const [name, entries] of Object.entries(state.records)) state.records[name] = (entries || []).filter((entry) => !entry.isDemo);
  }
  state.users = (state.users || []).filter((user) => !user.isDemo);
  state.users.push(adminUser);
  state.settings = {
    ...state.settings,
    schoolName: fields.schoolName,
    schoolNameEn: fields.schoolNameEn || fields.schoolName,
    academicYear: fields.academicYear || state.settings.academicYear,
    phone: fields.phone || '',
    email: fields.email || '',
    address: fields.address || '',
    currency: fields.currency || 'تومان',
    installed: true,
    installedAt: new Date().toISOString()
  };
  addAudit(state, adminUser, 'install', 'system', '', 'تکمیل ویزارد نصب سامانه');
}

async function testMysqlConnection(config) {
  let mysql;
  try { mysql = require('mysql2/promise'); } catch { throw new Error('برای استفاده از MySQL، ابتدا npm install را اجرا کنید.'); }
  const connection = await mysql.createConnection({
    host: config.host, port: Number(config.port || 3306), user: config.user,
    password: config.password || '', database: config.database, charset: 'utf8mb4', connectTimeout: 10000
  });
  await connection.query('SELECT 1');
  await connection.end();
}

function isValidTimeZone(value) {
  if (typeof value !== 'string' || value.length > 80) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date()); return true; }
  catch { return false; }
}

function schoolClock(timeZone = 'Asia/Tehran') {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB-u-nu-latn', {
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone
  }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `${parts.hour}:${parts.minute}`;
}

function publicRolePermissions(state, role) {
  const current = (state.roles || []).find((entry) => entry.id === role) || {};
  return { ...current, ...effectiveRolePermissions(state, role), users: (state.users || []).filter((user) => user.role === role).length };
}

function customRoleAllowedModules() {
  return modules.filter((item) => !CUSTOM_ROLE_RESERVED_MODULES.has(item.id)).map((item) => item.id);
}

function normalizePermissionList(value, fieldName) {
  if (!Array.isArray(value)) return { error: `فهرست ${fieldName} معتبر نیست.` };
  return { value: [...new Set(value.map((entry) => normalizeText(entry, 80)))] };
}

function validateCustomRoleFields(state, body, current = null, creating = false) {
  const allowed = new Set(['name', 'description', 'scope', 'moduleIds', 'readResources', 'writeResources']);
  if (Object.keys(body).some((key) => !allowed.has(key))) return { status: 400, message: 'فیلد اضافی برای پیکربندی نقش سفارشی پذیرفته نیست.' };
  const name = normalizeText(Object.hasOwn(body, 'name') ? body.name : current?.name, 80);
  if (name.length < 2) return { status: 400, message: 'نام نقش باید دست‌کم ۲ نویسه باشد.' };
  const duplicateName = (state.roles || []).some((entry) => entry.id !== current?.id && normalizeAudience(entry.name) === normalizeAudience(name));
  if (duplicateName) return { status: 409, message: 'نقشی با این نام از قبل وجود دارد.' };
  const description = normalizeText(Object.hasOwn(body, 'description') ? body.description : current?.description, 240);
  const scope = Object.hasOwn(body, 'scope') ? body.scope : current?.scope || 'school';
  if (!['school', 'classes'].includes(scope)) return { status: 400, message: 'محدودهٔ دسترسی نقش معتبر نیست.' };
  const arrays = {};
  for (const [field, fallback] of [
    ['moduleIds', current?.moduleIds || ['dashboard']],
    ['readResources', current?.readResources || []],
    ['writeResources', current?.writeResources || []]
  ]) {
    const normalized = Object.hasOwn(body, field) ? normalizePermissionList(body[field], field) : { value: fallback };
    if (normalized.error) return { status: 400, message: normalized.error };
    arrays[field] = normalized.value;
  }
  const allowedModules = new Set(customRoleAllowedModules());
  if (arrays.moduleIds.some((id) => !allowedModules.has(id)) || !arrays.moduleIds.includes('dashboard')) {
    return { status: 400, message: 'نقش سفارشی فقط می‌تواند از ماژول‌های امن استفاده کند و داشبورد باید فعال بماند.' };
  }
  if (arrays.readResources.some((resource) => !CUSTOM_ROLE_READABLE_RESOURCES.has(resource))) return { status: 400, message: 'یکی از منابع مشاهده برای نقش سفارشی مجاز نیست.' };
  if (arrays.writeResources.some((resource) => !CUSTOM_ROLE_WRITABLE_RESOURCES.has(resource))) return { status: 400, message: 'یکی از منابع نوشتن برای نقش سفارشی مجاز نیست.' };
  if (scope === 'classes' && arrays.writeResources.some((resource) => !CUSTOM_ROLE_CLASS_WRITABLE_RESOURCES.has(resource))) return { status: 400, message: 'نقش محدود به کلاس فقط می‌تواند داده‌های وابسته به کلاس‌های واگذارشده را ویرایش کند.' };
  if (arrays.readResources.some((resource) => !arrays.moduleIds.includes(resource)) || arrays.writeResources.some((resource) => !arrays.readResources.includes(resource))) {
    return { status: 400, message: 'برای مشاهده/ویرایش داده، ماژول باید فعال باشد و نوشتن به مجوز مشاهده نیاز دارد.' };
  }
  return { name, description, scope, ...arrays, isCustom: true };
}

function validateRolePermissionUpdate(state, role, body) {
  const configured = (state.roles || []).find((entry) => entry.id === role);
  if (configured?.isCustom) return validateCustomRoleFields(state, body, configured);
  if (!['teacher', 'student', 'parent'].includes(role)) return { status: 400, message: 'فقط دسترسی نقش‌های استاندارد یا سفارشی قابل پیکربندی است؛ دسترسی مدیر تغییرناپذیر است.' };
  const defaults = rolePermissionDefaults(role);
  if (Object.keys(body).some((key) => !['moduleIds', 'readResources', 'writeResources'].includes(key))) return { status: 400, message: 'فیلد اضافی برای پیکربندی نقش پذیرفته نیست.' };
  for (const key of ['moduleIds', 'readResources', 'writeResources']) {
    if (!Array.isArray(body[key])) return { status: 400, message: 'ساختار مجوزهای نقش معتبر نیست.' };
  }
  const unique = (values) => [...new Set(values.map((value) => normalizeText(value, 80)))];
  const moduleIds = unique(body.moduleIds);
  const readResources = unique(body.readResources);
  const writeResources = unique(body.writeResources);
  if (moduleIds.some((id) => !defaults.moduleIds.includes(id)) || readResources.some((id) => !defaults.readResources.includes(id)) || writeResources.some((id) => !defaults.writeResources.includes(id))) {
    return { status: 400, message: 'مجوز ارسالی خارج از سطح پایهٔ مجاز برای این نقش است.' };
  }
  if (!moduleIds.includes('dashboard')) return { status: 400, message: 'داشبورد باید برای هر نقش فعال بماند.' };
  const readSet = new Set([...readResources, ...writeResources]);
  return { role, moduleIds, readResources: [...readSet], writeResources };
}

async function handleApi(req, res, url, ctx) {
  if (!url.pathname.startsWith('/api/')) return false;
  const method = req.method || 'GET';
  const path = url.pathname;
  const store = () => ctx.store;

  if (path === '/api/health') {
    if (method !== 'GET') return json(res, 405, { status: 'method-not-allowed' }, { Allow: 'GET' });
    try {
      if (typeof store()?.healthCheck === 'function') await store().healthCheck();
      else await store().read();
      return json(res, 200, { status: 'ok' });
    } catch {
      return json(res, 503, { status: 'unavailable' });
    }
  }

  if (['POST', 'PATCH', 'PUT'].includes(method) && path !== '/api/auth/logout' && !isJsonRequest(req)) {
    return json(res, 415, { error: 'درخواست باید با قالب application/json ارسال شود.' });
  }

  try {
    if (path === '/api/install/status' && method === 'GET') {
      const state = await store().read();
      return json(res, 200, { installed: Boolean(state.settings.installed), schoolName: state.settings.schoolName || '' });
    }

    if (path === '/api/auth/options' && method === 'GET') {
      const state = await store().read();
      const configuredMode = normalizedLoginMode(state.settings);
      const loginMode = ctx.demoMode && configuredMode === 'phone' ? 'both' : configuredMode;
      return json(res, 200, {
        installed: Boolean(state.settings.installed),
        loginMode,
        phoneOtpAvailable: smsConfigurationReady(ctx.config?.sms),
        passwordLoginAvailable: loginMode !== 'phone' || Boolean(ctx.demoMode)
      });
    }

    if (path === '/api/auth/me' && method === 'GET') {
      const state = await store().read();
      const user = getSessionUser(req, state, ctx);
      return json(res, 200, { installed: Boolean(state.settings.installed), user: safeUser(user), settings: publicSettings(state.settings), demoMode: ctx.demoMode });
    }

    if (path === '/api/auth/login' && method === 'POST') {
      const body = await readBody(req);
      const state = await store().read();
      if (!state.settings.installed && !ctx.demoMode) return json(res, 423, { error: 'پیش از ورود، ویزارد نصب را تکمیل کنید.' });
      if (normalizedLoginMode(state.settings) === 'phone' && !ctx.demoMode) return json(res, 403, { error: 'ورود با نام کاربری و گذرواژه غیرفعال است؛ از کد پیامکی استفاده کنید.' });
      const ip = clientIp(req, ctx);
      const username = normalizeText(body.username, 40).toLowerCase();
      const attemptKey = `${ip}:${username}`;
      const now = Date.now();
      const retryAfter = loginRateLimit(ctx, ip, username, now);
      if (retryAfter) return json(res, 429, { error: 'تعداد تلاش‌ها زیاد است؛ ۱۵ دقیقه دیگر دوباره امتحان کنید.' }, { 'Retry-After': String(retryAfter) });
      const user = state.users.find((item) => String(item.username || '').toLowerCase() === username && linkedAccountIsActive(state, item));
      const passwordValid = await verifyPassword(String(body.password || ''), user?.passwordHash || DUMMY_PASSWORD_HASH);
      const valid = Boolean(user && passwordValid);
      if (!valid) {
        recordLoginFailure(ctx.loginAttempts, attemptKey, now);
        recordLoginFailure(ctx.loginIpAttempts, ip, now);
        return json(res, 401, { error: 'نام کاربری یا گذرواژه درست نیست.' });
      }
      ctx.loginAttempts.delete(attemptKey);
      return issueAuthSession(req, res, ctx, user, state.settings);
    }

    if (path === '/api/auth/otp/request' && method === 'POST') {
      if (!isJsonRequest(req)) return json(res, 415, { error: 'درخواست معتبر نیست.' });
      const body = await readBody(req);
      const state = await store().read();
      if (!state.settings.installed && !ctx.demoMode) return json(res, 423, { error: 'پیش از ورود، ویزارد نصب را تکمیل کنید.' });
      const mode = normalizedLoginMode(state.settings);
      if (!['phone', 'both'].includes(mode)) return json(res, 403, { error: 'ورود با کد پیامکی در تنظیمات مدیر فعال نیست.' });
      if (!smsConfigurationReady(ctx.config?.sms)) return json(res, 503, { error: 'ورود پیامکی هنوز پیکربندی نشده است.' });
      const phone = normalizePhoneNumber(body.phone);
      if (!phone) return json(res, 400, { error: 'شماره موبایل معتبر وارد کنید؛ برای نمونه ۰۹۱۲۱۲۳۴۵۶۷ یا ‎+۹۸۹۱۲۱۲۳۴۵۶۷.' });
      const ip = clientIp(req, ctx);
      const retryAfter = consumeOtpRateLimit(ctx, ip, phone);
      if (retryAfter) return json(res, 429, { error: 'درخواست کد بیش از حد مجاز است؛ کمی بعد دوباره تلاش کنید.' }, { 'Retry-After': String(retryAfter) });

      const matchingUsers = (state.users || []).filter((candidate) => candidate.status !== 'غیرفعال' && normalizePhoneNumber(candidate.phone) === phone);
      const user = matchingUsers.length === 1 && linkedAccountIsActive(state, matchingUsers[0]) ? matchingUsers[0] : null;
      const challengeId = crypto.randomBytes(32).toString('hex');
      if (user) {
        const { challenges } = ensureOtpState(ctx);
        for (const [id, challenge] of challenges) if (challenge.userId === user.id) challenges.delete(id);
        const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
        challenges.set(challengeId, {
          userId: user.id,
          phone,
          digest: otpDigest(ctx, challengeId, code),
          attempts: 0,
          expiresAt: Date.now() + OTP_TTL_MS
        });
        const sender = typeof ctx.sendSmsOtp === 'function' ? ctx.sendSmsOtp : sendIppanelOtp;
        Promise.resolve().then(() => sender({ config: ctx.config.sms, phone, code })).catch(() => {
          const active = challenges.get(challengeId);
          if (active?.userId === user.id) challenges.delete(challengeId);
          console.error('[otp] IPPanel message delivery failed.');
        });
      }
      return json(res, 200, { challengeId, expiresIn: OTP_TTL_MS / 1000, resendAfter: OTP_PAIR_COOLDOWN_MS / 1000, message: GENERIC_OTP_MESSAGE });
    }

    if (path === '/api/auth/otp/verify' && method === 'POST') {
      if (!isJsonRequest(req)) return json(res, 415, { error: 'درخواست معتبر نیست.' });
      const body = await readBody(req);
      const state = await store().read();
      const genericError = 'کد واردشده معتبر نیست یا منقضی شده است؛ دوباره کد درخواست کنید.';
      const challengeId = normalizeText(body.challengeId, 64);
      const { challenges } = pruneOtpState(ctx);
      const challenge = /^[a-f0-9]{64}$/i.test(challengeId) ? challenges.get(challengeId) : null;
      if (!challenge || !state.settings.installed && !ctx.demoMode || !['phone', 'both'].includes(normalizedLoginMode(state.settings)) || !smsConfigurationReady(ctx.config?.sms)) {
        if (challenge) challenges.delete(challengeId);
        return json(res, 401, { error: genericError });
      }
      challenge.attempts += 1;
      const code = latinDigits(normalizeText(body.otp, 20));
      const receivedDigest = otpDigest(ctx, challengeId, code);
      const validShape = /^\d{6}$/.test(code);
      const validDigest = validShape && crypto.timingSafeEqual(receivedDigest, challenge.digest);
      if (!validDigest) {
        if (challenge.attempts >= OTP_MAX_ATTEMPTS) challenges.delete(challengeId);
        return json(res, 401, { error: genericError });
      }
      const matchingUsers = (state.users || []).filter((candidate) => candidate.status !== 'غیرفعال' && normalizePhoneNumber(candidate.phone) === challenge.phone);
      const user = matchingUsers.length === 1 && matchingUsers[0].id === challenge.userId && linkedAccountIsActive(state, matchingUsers[0]) ? matchingUsers[0] : null;
      challenges.delete(challengeId);
      if (!user) return json(res, 401, { error: genericError });
      if (ctx.loginAttempts instanceof Map) ctx.loginAttempts.delete(`${clientIp(req, ctx)}:${String(user.username || '').toLowerCase()}`);
      return issueAuthSession(req, res, ctx, user, state.settings);
    }

    if (path === '/api/auth/logout' && method === 'POST') {
      const cookieToken = parseCookies(req.headers.cookie).mad_session;
      const headerToken = ctx.demoMode ? normalizeText(req.headers['x-demo-session'], 64) : '';
      if (cookieToken) ctx.sessions.delete(cookieToken);
      if (/^[a-f0-9]{64}$/i.test(headerToken)) ctx.sessions.delete(headerToken);
      return json(res, 200, { ok: true }, { 'Set-Cookie': 'mad_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' });
    }

    if (path === '/api/install/test-db' && method === 'POST') {
      const installState = await store().read();
      if (installState.settings.installed || ctx.demoMode) return json(res, 409, { error: 'آزمون اتصال دیتابیس فقط پیش از نصب سامانه در دسترس است.' });
      const body = await readBody(req);
      const database = {
        host: normalizeText(body.host, 180), port: Number(body.port || 3306),
        database: normalizeText(body.database, 64), user: normalizeText(body.user, 64),
        password: String(body.password || '')
      };
      if (!database.host || !database.database || !database.user) return json(res, 400, { error: 'میزبان، نام دیتابیس و نام کاربری را وارد کنید.' });
      try {
        await testMysqlConnection(database);
        return json(res, 200, { ok: true, message: 'اتصال موفق بود؛ دیتابیس آماده استفاده است.' });
      } catch (error) {
        return json(res, 400, { error: normalizeText(error.message, 300) });
      }
    }

    if (path === '/api/install' && method === 'POST') {
      const body = await readBody(req);
      const currentState = await store().read();
      if (ctx.demoMode) return json(res, 409, { error: 'ویزارد نصب در حالت نمایشی غیرفعال است.' });
      if (currentState.settings.installed) return json(res, 409, { error: 'سامانه قبلاً نصب شده است.' });
      const schoolName = normalizeText(body.schoolName, 120);
      const adminName = normalizeText(body.adminName, 100);
      const adminPhone = normalizePhoneNumber(body.adminPhone);
      const username = normalizeText(body.username, 40).toLowerCase();
      const password = String(body.password || '');
      if (schoolName.length < 2 || adminName.length < 2) return json(res, 400, { error: 'نام مدرسه و نام مدیر را کامل وارد کنید.' });
      if (!adminPhone) return json(res, 400, { error: 'شمارهٔ موبایل مدیر را با قالب معتبر، مانند ۰۹۱۲۱۲۳۴۵۶۷، وارد کنید.' });
      if (!isValidUsername(username)) return json(res, 400, { error: 'نام کاربری باید ۳ تا ۴۰ نویسه انگلیسی، عدد، نقطه، خط تیره یا زیرخط باشد.' });
      if (password.length < 10) return json(res, 400, { error: 'گذرواژه مدیر باید دست‌کم ۱۰ نویسه باشد.' });
      const fields = {
        schoolName,
        schoolNameEn: normalizeText(body.schoolNameEn, 120),
        academicYear: normalizeText(body.academicYear, 30),
        phone: normalizeText(body.phone, 32),
        email: normalizeText(body.email, 120),
        address: normalizeText(body.address, 240),
        currency: normalizeText(body.currency, 20) || 'تومان'
      };
      const database = { driver: body.database?.driver === 'mysql' ? 'mysql' : 'json' };
      let targetStore = store();
      if (database.driver === 'mysql') {
        database.host = normalizeText(body.database.host, 180);
        database.port = Number(body.database.port || 3306);
        database.database = normalizeText(body.database.database, 64);
        database.user = normalizeText(body.database.user, 64);
        database.password = String(body.database.password || '');
        if (!database.host || !database.database || !database.user) return json(res, 400, { error: 'اطلاعات اتصال MySQL کامل نیست.' });
        try {
          await testMysqlConnection(database);
          targetStore = await openMysqlStore(database, currentState);
          const targetState = await targetStore.read();
          if (targetState.settings.installed) {
            await targetStore.close();
            return json(res, 409, { error: 'این پایگاه‌داده قبلاً برای یک سامانه نصب‌شده استفاده شده است. یک پایگاه‌داده خالی انتخاب کنید.' });
          }
        } catch (error) {
          if (targetStore !== store()) await targetStore.close().catch(() => undefined);
          return json(res, 400, { error: `اتصال به MySQL انجام نشد: ${normalizeText(error.message, 300)}` });
        }
      }
      const adminUser = {
        id: randomId('usr'), username, name: adminName, role: 'admin', status: 'فعال',
        phone: adminPhone, passwordHash: await hashPassword(password), isDemo: false,
        createdAt: new Date().toISOString()
      };
      const preserveDemo = body.preserveDemo !== false;
      try {
        await targetStore.transact(async (draft) => {
          if (draft.settings.installed) throw Object.assign(new Error('سامانه پیش از این نصب شده است.'), { statusCode: 409 });
          await applyInstallation(draft, fields, adminUser, preserveDemo);
        });
        await ctx.saveConfig({ database });
        if (targetStore !== store()) {
          const oldStore = store();
          ctx.store = targetStore;
          await oldStore.close().catch(() => undefined);
        }
        ctx.sessions.clear();
        ctx.demoMode = false;
        return json(res, 200, { ok: true, message: 'نصب با موفقیت انجام شد. اکنون با حساب مدیر وارد شوید.' });
      } catch (error) {
        if (targetStore !== store()) await targetStore.close().catch(() => undefined);
        const status = error.statusCode || 500;
        return json(res, status, { error: status === 409 ? error.message : `نصب کامل نشد: ${normalizeText(error.message, 250)}` });
      }
    }

    const state = await store().read();
    const user = getSessionUser(req, state, ctx);
    if (!user) return json(res, 401, { error: 'برای ادامه وارد حساب کاربری شوید.' });
    if (!state.settings.installed && !ctx.demoMode) return json(res, 423, { error: 'ویزارد نصب هنوز تکمیل نشده است.' });

    if (path === '/api/bootstrap' && method === 'GET') {
      const visibleModules = modulePayload(state, user);
      return json(res, 200, {
        user: { ...safeUser(user), roleName: (state.roles || []).find((entry) => entry.id === user.role)?.name || ({ admin: 'مدیر مدرسه', teacher: 'معلم', student: 'دانش‌آموز', parent: 'ولی دانش‌آموز' })[user.role] || user.role }, settings: publicSettings(state.settings), modules: visibleModules,
        dashboard: dashboardFor(state, user), role: user.role,
        demoMode: ctx.demoMode,
        appVersion: ctx.appVersion || '1.3.0',
        unreadTickets: (recordsForRole(state, user, 'tickets') || []).filter((entry) => entry.status === 'باز' || entry.status === 'در انتظار پاسخ').length
      });
    }

    if (path === '/api/settings' && (method === 'GET' || method === 'PATCH')) {
      if (user.role !== 'admin') return json(res, 403, { error: 'فقط مدیر سامانه به تنظیمات دسترسی دارد.' });
      if (method === 'GET') return json(res, 200, {
        settings: publicSettings(state.settings),
        sms: publicSmsSettings(ctx.config?.sms, ctx.config?.smsManagedFields)
      });
      const body = await readBody(req);
      let nextSchoolSchedule = null;
      if (Object.hasOwn(body, 'schoolDays') || Object.hasOwn(body, 'schoolPeriods')) {
        const checkedSchedule = validateSchoolSchedule({
          schoolDays: Object.hasOwn(body, 'schoolDays') ? body.schoolDays : state.settings.schoolDays,
          schoolPeriods: Object.hasOwn(body, 'schoolPeriods') ? body.schoolPeriods : state.settings.schoolPeriods
        });
        if (checkedSchedule.error) return json(res, 400, { error: checkedSchedule.error });
        nextSchoolSchedule = checkedSchedule.value;
        const proposedSettings = { ...state.settings, ...nextSchoolSchedule };
        for (const row of state.records.timetable || []) {
          const candidate = { ...row };
          const scheduleError = validateTimetableEntry(state.records.timetable || [], candidate, row.id, proposedSettings, state.records.classes || []);
          if (scheduleError) return json(res, 409, { error: `تنظیمات برنامه با زنگ «${row.subject || row.id}» سازگار نیست: ${scheduleError.message}` });
        }
      }
      const loginMode = Object.hasOwn(body, 'loginMode') ? body.loginMode : normalizedLoginMode(state.settings);
      if (!LOGIN_MODES.has(loginMode)) return json(res, 400, { error: 'روش ورود انتخاب‌شده معتبر نیست.' });
      const timezone = Object.hasOwn(body, 'timezone') ? normalizeText(body.timezone, 80) : undefined;
      if (Object.hasOwn(body, 'timezone') && !isValidTimeZone(timezone)) {
        return json(res, 400, { error: 'منطقهٔ زمانی باید یک شناسهٔ معتبر IANA مانند Asia/Tehran باشد.' });
      }
      const loginSettingsChanged = Object.hasOwn(body, 'loginMode') || Object.hasOwn(body, 'clearSmsCredentials') ||
        ['smsApiKey', 'smsFromNumber', 'smsPatternCode', 'smsOtpParam'].some((key) => Object.hasOwn(body, key));
      const managedFields = new Set(ctx.config?.smsManagedFields || []);
      const currentSms = {
        apiKey: String(ctx.config?.sms?.apiKey || ''),
        fromNumber: String(ctx.config?.sms?.fromNumber || ''),
        patternCode: String(ctx.config?.sms?.patternCode || ''),
        otpParam: String(ctx.config?.sms?.otpParam || 'code')
      };
      const nextSms = { ...currentSms };
      const smsPatch = {};
      if (Object.hasOwn(body, 'clearSmsCredentials') && typeof body.clearSmsCredentials !== 'boolean') return json(res, 400, { error: 'گزینهٔ پاک‌سازی تنظیمات پیامک معتبر نیست.' });
      if (body.clearSmsCredentials === true) {
        if (managedFields.size) return json(res, 400, { error: 'بخشی از تنظیمات پیامک از متغیرهای محیطی مدیریت می‌شود و از این صفحه قابل پاک‌سازی نیست.' });
        Object.assign(nextSms, { apiKey: '', fromNumber: '', patternCode: '', otpParam: 'code' });
        Object.assign(smsPatch, nextSms);
      } else {
        const smsFields = [
          { body: 'smsApiKey', field: 'apiKey', max: 512 },
          { body: 'smsFromNumber', field: 'fromNumber', max: 40 },
          { body: 'smsPatternCode', field: 'patternCode', max: 128 },
          { body: 'smsOtpParam', field: 'otpParam', max: 40 }
        ];
        for (const item of smsFields) {
          if (!Object.hasOwn(body, item.body)) continue;
          if (managedFields.has(item.field)) return json(res, 400, { error: 'این بخش از تنظیمات پیامک از متغیرهای محیطی سرور مدیریت می‌شود.' });
          if (typeof body[item.body] !== 'string') return json(res, 400, { error: 'مقدار یکی از تنظیمات پیامک باید متن باشد.' });
          const raw = body[item.body].trim();
          if (raw.length > item.max) return json(res, 400, { error: 'طول یکی از تنظیمات پیامک بیش از حد مجاز است.' });
          if (!raw) continue;
          if (item.field === 'apiKey') {
            if (raw.length < 8 || /[\r\n\u0000]/.test(raw)) return json(res, 400, { error: 'کلید API پیامک معتبر نیست.' });
            nextSms.apiKey = raw;
          } else if (item.field === 'fromNumber') {
            const senderNumber = normalizePhoneNumber(raw);
            if (!senderNumber) return json(res, 400, { error: 'شمارهٔ فرستنده باید با قالب E.164 مانند ‎+983000505 وارد شود.' });
            nextSms.fromNumber = senderNumber;
          } else if (item.field === 'patternCode') {
            if (/[\r\n\u0000]/.test(raw)) return json(res, 400, { error: 'شناسهٔ الگوی پیامک معتبر نیست.' });
            nextSms.patternCode = raw;
          } else {
            if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(raw)) return json(res, 400, { error: 'نام متغیر الگوی پیامک باید با حرف انگلیسی آغاز شود و فقط شامل حرف، عدد یا زیرخط باشد.' });
            nextSms.otpParam = raw;
          }
          smsPatch[item.field] = nextSms[item.field];
        }
      }
      if (loginSettingsChanged && ['phone', 'both'].includes(loginMode) && !smsConfigurationReady(nextSms)) {
        return json(res, 400, { error: 'برای فعال‌کردن ورود پیامکی، کلید API، شمارهٔ فرستنده، شناسهٔ الگو و نام متغیر الگوی IPPanel را کامل کنید.' });
      }
      const otpAccountError = loginSettingsChanged ? otpAccountReadinessError(loginMode, state.users) : '';
      if (otpAccountError) return json(res, 400, { error: otpAccountError });
      if (Object.keys(smsPatch).length) {
        if (typeof ctx.saveConfig === 'function') await ctx.saveConfig({ sms: smsPatch });
        ctx.config ||= {};
        ctx.config.sms = nextSms;
      }
      const saved = await store().transact((draft) => {
        for (const key of ['schoolName', 'schoolNameEn', 'academicYear', 'phone', 'email', 'address', 'currency']) {
          if (Object.hasOwn(body, key)) draft.settings[key] = normalizeText(body[key], key === 'address' ? 240 : 120);
        }
        if (Object.hasOwn(body, 'timezone')) draft.settings.timezone = timezone;
        if (Object.hasOwn(body, 'loginMode')) draft.settings.loginMode = loginMode;
        if (nextSchoolSchedule) {
          draft.settings.schoolDays = nextSchoolSchedule.schoolDays;
          draft.settings.schoolPeriods = nextSchoolSchedule.schoolPeriods;
          for (const row of draft.records.timetable || []) {
            const candidate = { ...row };
            const issue = validateTimetableEntry(draft.records.timetable || [], candidate, row.id, draft.settings, draft.records.classes || []);
            if (issue) throw Object.assign(new Error(`تنظیمات برنامه با زنگ «${row.subject || row.id}» سازگار نیست: ${issue.message}`), { statusCode: 409 });
            Object.assign(row, {
              day: candidate.day, periodId: candidate.periodId, periodName: candidate.periodName,
              startTime: candidate.startTime, endTime: candidate.endTime, academicYear: candidate.academicYear
            });
          }
        }
        const draftLoginMode = normalizedLoginMode(draft.settings);
        if (loginSettingsChanged && ['phone', 'both'].includes(draftLoginMode)) {
          if (!smsConfigurationReady(nextSms)) throw Object.assign(new Error('برای فعال‌کردن ورود پیامکی، کلید API، شمارهٔ فرستنده، شناسهٔ الگو و نام متغیر الگوی IPPanel را کامل کنید.'), { statusCode: 400 });
          const accountError = otpAccountReadinessError(draftLoginMode, draft.users);
          if (accountError) throw Object.assign(new Error(accountError), { statusCode: 400 });
        }
        addAudit(draft, user, 'update', 'settings', '', 'به‌روزرسانی تنظیمات مدرسه و روش ورود');
        return publicSettings(draft.settings);
      });
      return json(res, 200, {
        settings: saved,
        sms: publicSmsSettings(ctx.config?.sms, ctx.config?.smsManagedFields),
        message: 'تنظیمات با موفقیت ذخیره شد.'
      });
    }

    if (path === '/api/roles' && method === 'POST') {
      if (user.role !== 'admin') return json(res, 403, { error: 'فقط مدیر می‌تواند نقش سفارشی بسازد.' });
      const body = await readBody(req);
      const fields = validateCustomRoleFields(state, body, null, true);
      if (fields.status) return json(res, fields.status, { error: fields.message });
      const roleId = `custom-${crypto.randomBytes(6).toString('hex')}`;
      const created = await store().transact((draft) => {
        if ((draft.roles || []).some((entry) => entry.id === roleId)) throw Object.assign(new Error('شناسهٔ نقش تکراری است؛ دوباره تلاش کنید.'), { statusCode: 409 });
        if ((draft.roles || []).some((entry) => normalizeAudience(entry.name) === normalizeAudience(fields.name))) throw Object.assign(new Error('نقشی با این نام از قبل وجود دارد.'), { statusCode: 409 });
        const entry = { id: roleId, ...fields, users: 0 };
        draft.roles.push(entry);
        addAudit(draft, user, 'create', 'roles', roleId, `ساخت نقش ${entry.name}`);
        return publicRolePermissions(draft, roleId);
      });
      return json(res, 201, { data: created, message: `نقش «${created.name}» ساخته شد.` });
    }

    const rolePermissionMatch = path.match(/^\/api\/roles\/([a-z0-9-]+)$/);
    if (rolePermissionMatch && method === 'PATCH') {
      if (user.role !== 'admin') return json(res, 403, { error: 'فقط مدیر می‌تواند دسترسی نقش‌ها را تنظیم کند.' });
      const role = rolePermissionMatch[1];
      const body = await readBody(req);
      const update = validateRolePermissionUpdate(state, role, body);
      if (update.status) return json(res, update.status, { error: update.message });
      const saved = await store().transact((draft) => {
        let entry = draft.roles.find((item) => item.id === role);
        if (!entry && ['teacher', 'student', 'parent'].includes(role)) {
          entry = { id: role, name: ({ teacher: 'معلم', student: 'دانش‌آموز', parent: 'ولی دانش‌آموز' })[role], description: 'دسترسی قابل تنظیم مدیر مدرسه', users: 0 };
          draft.roles.push(entry);
        }
        if (!entry) throw Object.assign(new Error('نقش پیدا نشد.'), { statusCode: 404 });
        if (entry.isCustom) {
          entry.name = update.name;
          entry.description = update.description;
          entry.scope = update.scope;
        }
        entry.moduleIds = update.moduleIds;
        entry.readResources = update.readResources;
        entry.writeResources = update.writeResources;
        entry.users = draft.users.filter((item) => item.role === role).length;
        addAudit(draft, user, 'permissions', 'roles', role, `به‌روزرسانی دسترسی‌های نقش ${entry.name}`);
        return publicRolePermissions(draft, role);
      });
      return json(res, 200, { data: saved, message: `دسترسی‌های نقش ${saved.name} ذخیره شد.` });
    }

    if (rolePermissionMatch && method === 'DELETE') {
      if (user.role !== 'admin') return json(res, 403, { error: 'فقط مدیر می‌تواند نقش سفارشی را حذف کند.' });
      const role = rolePermissionMatch[1];
      const current = (state.roles || []).find((entry) => entry.id === role && entry.isCustom);
      if (!current) return json(res, 404, { error: 'نقش سفارشی پیدا نشد.' });
      if ((state.users || []).some((entry) => entry.role === role)) return json(res, 409, { error: 'ابتدا حساب‌های این نقش را به نقش دیگری منتقل کنید.' });
      await store().transact((draft) => {
        draft.roles = (draft.roles || []).filter((entry) => entry.id !== role);
        addAudit(draft, user, 'delete', 'roles', role, `حذف نقش ${current.name}`);
      });
      return json(res, 200, { ok: true, message: `نقش «${current.name}» حذف شد.` });
    }

    if (path === '/api/admin/backups' && (method === 'GET' || method === 'POST')) {
      if (user.role !== 'admin') return json(res, 403, { error: 'مدیریت نسخه‌های پشتیبان فقط برای مدیر مجاز است.' });
      if (!ctx.backups) return json(res, 503, { error: 'سرویس پشتیبان‌گیری پیکربندی نشده است.' });
      if (method === 'GET') return json(res, 200, { data: await ctx.backups.list() });
      const created = await ctx.backups.create('manual');
      await store().transact((draft) => addAudit(draft, user, 'backup', 'system', created.filename, 'تهیهٔ نسخهٔ پشتیبان دستی'));
      return json(res, 201, { data: created, message: 'نسخهٔ پشتیبان امن ساخته شد.' });
    }

    const backupDownloadMatch = path.match(/^\/api\/admin\/backups\/([^/]+)$/);
    if (backupDownloadMatch && method === 'GET') {
      if (user.role !== 'admin') return json(res, 403, { error: 'دریافت نسخهٔ پشتیبان فقط برای مدیر مجاز است.' });
      if (!ctx.backups) return json(res, 503, { error: 'سرویس پشتیبان‌گیری پیکربندی نشده است.' });
      const filename = decodeURIComponent(backupDownloadMatch[1]);
      const envelope = await ctx.backups.read(filename);
      const content = JSON.stringify(envelope, null, 2);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(content),
        'Content-Disposition': `attachment; filename=\"${filename}\"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      });
      res.end(content);
      return true;
    }

    if (path === '/api/admin/restore' && method === 'POST') {
      if (user.role !== 'admin') return json(res, 403, { error: 'بازیابی اطلاعات فقط برای مدیر مجاز است.' });
      if (!ctx.backups) return json(res, 503, { error: 'سرویس پشتیبان‌گیری پیکربندی نشده است.' });
      const body = await readBody(req, MAX_BACKUP_BODY);
      const account = state.users.find((entry) => entry.id === user.id);
      if (!account || !(await verifyPassword(String(body.currentPassword || ''), account.passwordHash))) return json(res, 403, { error: 'برای بازیابی، گذرواژهٔ فعلی مدیر را درست وارد کنید.' });
      if (!body.backup || typeof body.backup !== 'object') return json(res, 400, { error: 'فایل پشتیبان معتبر ارسال نشده است.' });
      const restoredSettings = body.backup.state?.settings || {};
      const restoredLoginMode = normalizedLoginMode(restoredSettings);
      if (['phone', 'both'].includes(restoredLoginMode)) {
        if (!smsConfigurationReady(ctx.config?.sms)) return json(res, 409, { error: 'فایل پشتیبان ورود پیامکی را فعال دارد؛ ابتدا IPPanel را روی این سرور پیکربندی کنید.' });
        const backupUsers = Array.isArray(body.backup.state?.users) ? body.backup.state.users : [];
        const phoneCounts = new Map();
        for (const account of backupUsers) {
          if (account?.status === 'غیرفعال') continue;
          const phone = normalizePhoneNumber(account?.phone);
          if (phone) phoneCounts.set(phone, (phoneCounts.get(phone) || 0) + 1);
        }
        const uniquePhoneUsers = backupUsers.filter((account) => account?.status !== 'غیرفعال' && phoneCounts.get(normalizePhoneNumber(account?.phone)) === 1);
        if (!uniquePhoneUsers.length || (restoredLoginMode === 'phone' && !uniquePhoneUsers.some((account) => account.role === 'admin'))) {
          return json(res, 409, { error: 'فایل پشتیبان شمارهٔ موبایل یکتای فعال، به‌ویژه برای مدیر، ندارد؛ ابتدا دسترسی ورود را اصلاح کنید.' });
        }
      }
      const safetyBackup = await ctx.backups.restore(body.backup);
      const restored = await store().read();
      ctx.sessions.clear();
      ctx.loginAttempts.clear();
      ctx.demoMode = Boolean(ctx.demoMode && !restored.settings.installed);
      return json(res, 200, { ok: true, safetyBackup: safetyBackup.filename, message: 'اطلاعات بازیابی شد. برای امنیت، دوباره وارد حساب شوید.' }, { 'Set-Cookie': 'mad_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' });
    }

    const attendanceClassMatch = path.match(/^\/api\/attendance\/class\/([^/]+)$/);
    if (attendanceClassMatch && (method === 'GET' || method === 'POST')) {
      if (!['admin', 'teacher'].includes(user.role) && !customRoleConfig(state, user)) return json(res, 403, { error: 'ثبت گروهی حضور و غیاب فقط برای نقش آموزشی مجاز است.' });
      if (!roleCanUseModule(user, 'attendance', state) || !allowedResource(user, 'attendance', state)) return json(res, 403, { error: 'ماژول حضور و غیاب برای این نقش فعال نیست.' });
      if (method === 'POST' && !canWriteResource(user, 'attendance', state)) return json(res, 403, { error: 'این نقش فقط امکان مشاهدهٔ حضور و غیاب را دارد.' });
      const classId = decodeURIComponent(attendanceClassMatch[1]);
      const classroom = (state.records.classes || []).find((entry) => entry.id === classId);
      if (!classroom) return json(res, 404, { error: 'کلاس پیدا نشد.' });
      const ownClassIds = user.role === 'admin' ? null : roleClassIds(state, user);
      if (user.role !== 'admin' && !ownClassIds.has(classId)) return json(res, 403, { error: 'فقط می‌توانید حضور و غیاب کلاس‌های واگذارشده به نقش شما را ببینید یا ثبت کنید.' });
      const date = method === 'GET' ? (normalizeText(url.searchParams.get('date'), 10) || schoolDateISO(state.settings?.timezone || 'Asia/Tehran')) : '';
      if (method === 'GET' && !isISODate(date)) return json(res, 400, { error: 'تاریخ باید با قالب معتبر سال-ماه-روز وارد شود.' });
      if (method === 'GET') {
        const students = (state.records.students || []).filter((entry) => entry.classId === classId && entry.status !== 'غیرفعال')
          .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'fa'));
        const attendance = (state.records.attendance || []).filter((entry) => entry.date === date);
        const byStudent = new Map(attendance.map((entry) => [entry.studentId, entry]));
        return json(res, 200, {
          class: { id: classroom.id, name: classroom.name, grade: classroom.grade, room: classroom.room || '' },
          date,
          data: students.map((student) => {
            const existing = byStudent.get(student.id);
            return { id: student.id, name: student.name, studentNo: student.studentNo, status: existing?.status || '', time: existing?.time || '', attendanceId: existing?.id || '' };
          }),
          total: students.length,
          summary: {
            present: students.filter((student) => byStudent.get(student.id)?.status === 'حاضر').length,
            late: students.filter((student) => byStudent.get(student.id)?.status === 'با تأخیر').length,
            absent: students.filter((student) => byStudent.get(student.id)?.status === 'غایب').length,
            leave: students.filter((student) => byStudent.get(student.id)?.status === 'مرخصی').length,
            recorded: students.filter((student) => byStudent.has(student.id)).length,
            total: students.length
          }
        });
      }
      if (!canWriteResource(user, 'attendance', state)) return json(res, 403, { error: 'اجازهٔ ثبت حضور و غیاب ندارید.' });
      const body = await readBody(req);
      if (Object.keys(body).some((key) => !['date', 'absentIds', 'statuses'].includes(key))) return json(res, 400, { error: 'فقط تاریخ و فهرست وضعیت حضور و غیاب پذیرفته می‌شود.' });
      const saveDate = normalizeText(body.date, 10);
      if (!isISODate(saveDate)) return json(res, 400, { error: 'تاریخ باید با قالب معتبر سال-ماه-روز وارد شود.' });
      const hasStatuses = Object.hasOwn(body, 'statuses');
      if (hasStatuses && Object.hasOwn(body, 'absentIds')) return json(res, 400, { error: 'فهرست وضعیت‌ها و فهرست غایبان را هم‌زمان ارسال نکنید.' });
      if (hasStatuses && (!Array.isArray(body.statuses) || body.statuses.length > 2000 || body.statuses.some((item) => !item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some((key) => !['studentId', 'status'].includes(key)) || typeof item.studentId !== 'string' || !['حاضر', 'غایب', 'با تأخیر', 'مرخصی'].includes(item.status)))) return json(res, 400, { error: 'فهرست وضعیت دانش‌آموزان نامعتبر است.' });
      if (!hasStatuses && (!Array.isArray(body.absentIds) || body.absentIds.length > 2000 || body.absentIds.some((id) => typeof id !== 'string'))) return json(res, 400, { error: 'فهرست غایبان معتبر نیست.' });
      const statusEntries = hasStatuses ? body.statuses.map((item) => ({ studentId: normalizeText(item.studentId, 96), status: item.status })) : [];
      const statusIds = statusEntries.map((item) => item.studentId);
      if (new Set(statusIds).size !== statusIds.length) return json(res, 400, { error: 'برای هر دانش‌آموز فقط یک وضعیت ارسال کنید.' });
      const statusMap = new Map(statusEntries.map((item) => [item.studentId, item.status]));
      const absentIds = hasStatuses ? [] : [...new Set(body.absentIds.map((id) => normalizeText(id, 96)))];
      const absentSet = new Set(absentIds);
      const saved = await store().transact((draft) => {
        const currentClass = (draft.records.classes || []).find((entry) => entry.id === classId);
        if (!currentClass) throw Object.assign(new Error('کلاس پیدا نشد.'), { statusCode: 404 });
        if (user.role !== 'admin' && !roleClassIds(draft, user).has(classId)) throw Object.assign(new Error('فقط می‌توانید حضور و غیاب کلاس‌های واگذارشده به نقش خود را ثبت کنید.'), { statusCode: 403 });
        const roster = (draft.records.students || []).filter((entry) => entry.classId === classId && entry.status !== 'غیرفعال');
        if (!roster.length) throw Object.assign(new Error('این کلاس دانش‌آموز فعال ندارد.'), { statusCode: 409 });
        const rosterIds = new Set(roster.map((student) => student.id));
        const suppliedIds = hasStatuses ? statusIds : absentIds;
        if (suppliedIds.some((id) => !rosterIds.has(id))) throw Object.assign(new Error('فهرست ارسالی شامل دانش‌آموزی خارج از این کلاس است.'), { statusCode: 400 });
        if (hasStatuses && (statusMap.size !== roster.length || roster.some((student) => !statusMap.has(student.id)))) throw Object.assign(new Error('برای همهٔ دانش‌آموزان فعال کلاس، یک وضعیت ارسال کنید.'), { statusCode: 400 });
        const stamp = new Date().toISOString();
        const counts = { present: 0, late: 0, absent: 0, leave: 0 };
        for (const student of roster) {
          if (!Array.isArray(draft.records.attendance)) draft.records.attendance = [];
          const sameDay = draft.records.attendance.find((entry) => entry.studentId === student.id && entry.date === saveDate);
          if (sameDay && sameDay.classId && sameDay.classId !== classId) throw Object.assign(new Error(`${student.name} در این تاریخ برای کلاس دیگری حضور و غیاب دارد؛ برای جلوگیری از دو ثبت، ابتدا همان ثبت را بررسی کنید.`), { statusCode: 409 });
          const status = hasStatuses
            ? statusMap.get(student.id)
            : absentSet.has(student.id) ? 'غایب' : sameDay?.status === 'غایب' ? 'حاضر' : sameDay?.status || 'حاضر';
          if (status === 'حاضر') counts.present += 1;
          else if (status === 'با تأخیر') counts.late += 1;
          else if (status === 'غایب') counts.absent += 1;
          else if (status === 'مرخصی') counts.leave += 1;
          const time = ['حاضر', 'با تأخیر'].includes(status) ? sameDay?.time || schoolClock(draft.settings?.timezone || 'Asia/Tehran') : '';
          if (sameDay) {
            sameDay.studentName = student.name;
            sameDay.classId = classId;
            sameDay.status = status;
            sameDay.teacherId = user.teacherId || sameDay.teacherId || '';
            sameDay.time = time;
            sameDay.updatedAt = stamp;
          } else {
            draft.records.attendance.unshift({
              id: randomId('att'), studentId: student.id, studentName: student.name, classId, date: saveDate,
              time, status, note: '', teacherId: user.teacherId || '', createdAt: stamp, isDemo: false
            });
          }
        }
        addAudit(draft, user, 'bulk-update', 'attendance', classId, `ثبت سریع حضور کلاس ${currentClass.name}؛ ${counts.absent} غایب، ${counts.late} با تأخیر و ${counts.leave} مرخصی از ${roster.length} دانش‌آموز · ${saveDate}`);
        return { ...counts, total: roster.length, recorded: roster.length, date: saveDate, classId };
      });
      return json(res, 200, { data: saved, message: `حضور و غیاب ${faNumber(saved.total)} دانش‌آموز ثبت شد؛ ${faNumber(saved.absent)} غایب، ${faNumber(saved.late)} با تأخیر و ${faNumber(saved.leave)} مرخصی.` });
    }

    const moduleMatch = path.match(/^\/api\/modules\/([a-z-]+)$/);
    if (moduleMatch && method === 'PATCH') {
      if (user.role !== 'admin') return json(res, 403, { error: 'فقط مدیر می‌تواند ماژول‌ها را مدیریت کند.' });
      const body = await readBody(req);
      const id = moduleMatch[1];
      const definition = modules.find((item) => item.id === id);
      if (!definition) return json(res, 404, { error: 'ماژول پیدا نشد.' });
      if (definition.locked) return json(res, 400, { error: 'این بخش اصلی سامانه قابل غیرفعال‌سازی نیست.' });
      if (typeof body.enabled !== 'boolean') return json(res, 400, { error: 'وضعیت فعال بودن ماژول نامعتبر است.' });
      const updated = await store().transact((draft) => {
        const feature = draft.modules.find((entry) => entry.id === id);
        feature.enabled = body.enabled;
        addAudit(draft, user, body.enabled ? 'enable' : 'disable', 'modules', id, `${feature.title} ${body.enabled ? 'فعال' : 'غیرفعال'} شد`);
        return { ...feature };
      });
      return json(res, 200, { module: updated, message: `ماژول ${updated.enabled ? 'فعال' : 'غیرفعال'} شد.` });
    }

    const recordsMatch = path.match(/^\/api\/records\/([a-z-]+)(?:\/([^/]+))?$/);
    if (recordsMatch) {
      const resource = recordsMatch[1];
      const recordId = recordsMatch[2] ? decodeURIComponent(recordsMatch[2]) : '';
      const moduleId = resource === 'audit' ? 'audit' : resource;
      const moduleDefinition = modules.find((entry) => entry.id === moduleId);
      if (!moduleDefinition || !roleCanUseModule(user, moduleId, state)) return json(res, 403, { error: 'این ماژول برای حساب شما فعال نیست.' });
      const permissionError = validateRoleAccess(user, resource, method, state);
      if (permissionError) return json(res, 403, { error: permissionError });

      if (method === 'GET' && !recordId) {
        const list = recordsForRole(state, user, resource);
        if (!list) return json(res, 404, { error: 'بخش موردنظر پیدا نشد.' });
        const query = normalizeText(url.searchParams.get('q'), 100).toLowerCase();
        const status = normalizeText(url.searchParams.get('status'), 40);
        const dateFrom = normalizeText(url.searchParams.get('from'), 10);
        const dateTo = normalizeText(url.searchParams.get('to'), 10);
        const classId = normalizeText(url.searchParams.get('classId'), 96);
        const studentId = normalizeText(url.searchParams.get('studentId'), 96);
        const teacherId = normalizeText(url.searchParams.get('teacherId'), 96);
        const periodId = normalizeText(url.searchParams.get('periodId'), 40);
        const academicYear = normalizeText(url.searchParams.get('academicYear'), 64);
        const dayInput = normalizeText(url.searchParams.get('day'), 40);
        const timetableDay = dayInput ? canonicalWeekday(dayInput) : '';
        const shift = url.searchParams.has('shift') ? shiftKey(url.searchParams.get('shift')) : '';
        if ((dateFrom && !isISODate(dateFrom)) || (dateTo && !isISODate(dateTo)) || (dateFrom && dateTo && dateFrom > dateTo)) return json(res, 400, { error: 'بازهٔ تاریخ معتبر نیست.' });
        if (resource === 'timetable' && dayInput && (!timetableDay || !getSchoolSchedule(state.settings).schoolDays.includes(timetableDay))) return json(res, 400, { error: 'روز فیلترشده در روزهای آموزشی مدرسه وجود ندارد.' });
        if (resource === 'timetable' && url.searchParams.has('shift') && !shift) return json(res, 400, { error: 'نوبت فیلترشده معتبر نیست.' });
        const filtered = list.filter((entry) => {
          const values = Object.values(entry).flatMap((value) => Array.isArray(value) ? value : [value]);
          const matchesQuery = !query || values.some((value) => String(value ?? '').toLowerCase().includes(query));
          const matchesStatus = !status || entry.status === status;
          const matchesDate = resource !== 'attendance' || ((!dateFrom || entry.date >= dateFrom) && (!dateTo || entry.date <= dateTo));
          const matchesClass = !classId || !['attendance', 'timetable'].includes(resource) || entry.classId === classId;
          const matchesStudent = !studentId || entry.studentId === studentId;
          const matchesTeacher = resource !== 'timetable' || !teacherId || entry.teacherId === teacherId;
          const matchesDay = resource !== 'timetable' || !timetableDay || canonicalWeekday(entry.day) === timetableDay;
          const matchesPeriod = resource !== 'timetable' || !periodId || entry.periodId === periodId;
          const matchesYear = resource !== 'timetable' || !academicYear || academicYearKey(entry.academicYear || state.settings.academicYear) === academicYearKey(academicYear);
          const entryClass = (state.records.classes || []).find((item) => item.id === entry.classId);
          const entryPeriod = getSchoolSchedule(state.settings).schoolPeriods.find((item) => item.id === entry.periodId);
          const matchesShift = resource !== 'timetable' || !shift || shiftKey(entryClass?.shift || entryPeriod?.shift) === shift;
          return matchesQuery && matchesStatus && matchesDate && matchesClass && matchesStudent && matchesTeacher && matchesDay && matchesPeriod && matchesYear && matchesShift;
        });
        if (resource === 'timetable') {
          const schedule = getSchoolSchedule(state.settings);
          const dayOrder = new Map(schedule.schoolDays.map((day, index) => [day, index]));
          const periodOrder = new Map(schedule.schoolPeriods.map((period, index) => [period.id, index]));
          filtered.sort((a, b) => (dayOrder.get(canonicalWeekday(a.day)) ?? 99) - (dayOrder.get(canonicalWeekday(b.day)) ?? 99) ||
            (periodOrder.get(a.periodId) ?? 99) - (periodOrder.get(b.periodId) ?? 99) ||
            String(a.startTime || '').localeCompare(String(b.startTime || '')) || String(a.classId || '').localeCompare(String(b.classId || '')));
        } else {
          filtered.sort((a, b) => String(b.lastReplyAt || b.updatedAt || b.createdAt || b.date || b.id || '').localeCompare(String(a.lastReplyAt || a.updatedAt || a.createdAt || a.date || a.id || '')));
        }
        const statuses = [...new Set(list.map((entry) => entry.status).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'fa'));
        const requestedPage = Number(url.searchParams.get('page') || 1);
        const requestedLimit = Number(url.searchParams.get('limit') || 100);
        const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, Math.floor(requestedLimit))) : 100;
        const pageCount = Math.max(1, Math.ceil(filtered.length / limit));
        const page = Number.isFinite(requestedPage) ? Math.min(pageCount, Math.max(1, Math.floor(requestedPage))) : 1;
        const pageData = filtered.slice((page - 1) * limit, page * limit);
        const extra = resource === 'timetable' ? {
          academicYears: academicYearOptions(list, state.settings.academicYear),
          teacherOptions: [...new Set(list.map((entry) => entry.teacherId).filter(Boolean))].map((id) => ({ id, name: (state.records.teachers || []).find((teacher) => teacher.id === id)?.name || id }))
            .sort((a, b) => a.name.localeCompare(b.name, 'fa'))
        } : {};
        if (resource === 'timetable') for (const row of pageData) row.teacherName = (state.records.teachers || []).find((teacher) => teacher.id === row.teacherId)?.name || '';
        return json(res, 200, { data: pageData, total: filtered.length, page, limit, statuses, ...extra });
      }

      if (method === 'POST' && !recordId) {
        const body = await readBody(req);
        if (!canWriteResource(user, resource, state)) return json(res, 403, { error: 'اجازه افزودن در این بخش را ندارید.' });
        if (resource === 'users') {
          const allowedUserFields = new Set(['name', 'username', 'role', 'status', 'phone', 'password', 'studentId', 'teacherId', 'parentId', 'classIds']);
          if (Object.keys(body).some((key) => !allowedUserFields.has(key))) return json(res, 400, { error: 'یکی از فیلدهای ارسالی برای ساخت حساب مجاز نیست.' });
          if (Object.hasOwn(body, 'status') && !['فعال', 'غیرفعال'].includes(body.status)) return json(res, 400, { error: 'وضعیت حساب معتبر نیست.' });
          if (Object.hasOwn(body, 'classIds') && !Array.isArray(body.classIds)) return json(res, 400, { error: 'فهرست کلاس‌های مجاز معتبر نیست.' });
          const username = normalizeText(body.username, 40).toLowerCase();
          const name = normalizeText(body.name, 100);
          const password = String(body.password || '');
          if (!name || !isValidUsername(username) || password.length < 8) return json(res, 400, { error: 'نام، نام کاربری معتبر و گذرواژه حداقل ۸ نویسه‌ای لازم است.' });
          if (!ensureUniqueUsername(state, username)) return json(res, 409, { error: 'این نام کاربری قبلاً استفاده شده است.' });
          const accountPhone = normalizeText(body.phone, 40);
          const accountStatus = normalizeText(body.status, 32) || 'فعال';
          if (accountStatus !== 'غیرفعال' && hasDuplicateUserPhone(state, accountPhone)) return json(res, 409, { error: 'شمارهٔ موبایل نرمال‌شده قبلاً به حساب فعال دیگری متصل است.' });
          const customRole = customRoleConfig(state, body.role);
          if (!['admin', 'teacher', 'student', 'parent'].includes(body.role) && !customRole) return json(res, 400, { error: 'نقش انتخاب‌شده معتبر نیست.' });
          const role = body.role;
          const classIds = [...new Set((Array.isArray(body.classIds) ? body.classIds : []).map((id) => normalizeText(id, 96)).filter(Boolean))];
          if (customRole?.scope === 'classes' && (!classIds.length || classIds.some((id) => !(state.records.classes || []).some((entry) => entry.id === id)))) return json(res, 400, { error: 'برای این نقش، دست‌کم یک کلاس معتبر را انتخاب کنید.' });
          if (customRole?.scope === 'school' && classIds.length) return json(res, 400, { error: 'برای نقش با دسترسی مدرسه، انتخاب کلاس لازم نیست.' });
          const studentId = normalizeText(body.studentId, 96);
          const teacherId = normalizeText(body.teacherId, 96);
          const parentId = normalizeText(body.parentId, 96);
          if (role === 'student' && !state.records.students.some((entry) => entry.id === studentId)) return json(res, 400, { error: 'برای حساب دانش‌آموز، پرونده معتبر انتخاب کنید.' });
          if (role === 'teacher' && !state.records.teachers.some((entry) => entry.id === teacherId)) return json(res, 400, { error: 'برای حساب معلم، پرونده معتبر انتخاب کنید.' });
          if (role === 'parent' && !state.records.parents.some((entry) => entry.id === parentId)) return json(res, 400, { error: 'برای حساب ولی، پرونده معتبر اولیا انتخاب کنید.' });
          if (accountStatus === 'فعال') {
            const linkedError = linkedAccountError(state, { role, status: accountStatus, studentId, teacherId, parentId, classIds });
            if (linkedError) return json(res, 400, { error: linkedError });
          }
          const created = {
            id: randomId('usr'), username, name, role, status: accountStatus,
            phone: accountPhone, passwordHash: await hashPassword(password),
            isDemo: false, createdAt: new Date().toISOString()
          };
          if (role === 'student') created.studentId = studentId;
          if (role === 'teacher') created.teacherId = teacherId;
          if (role === 'parent') created.parentId = parentId;
          if (customRole?.scope === 'classes') created.classIds = classIds;
          const savedUser = await store().transact((draft) => {
            if (!ensureUniqueUsername(draft, username)) throw Object.assign(new Error('این نام کاربری قبلاً استفاده شده است.'), { statusCode: 409 });
            if (created.status !== 'غیرفعال' && hasDuplicateUserPhone(draft, created.phone)) throw Object.assign(new Error('شمارهٔ موبایل نرمال‌شده قبلاً به حساب فعال دیگری متصل است.'), { statusCode: 409 });
            draft.users.push(created);
            addAudit(draft, user, 'create', 'users', created.id, `ساخت حساب ${created.name}`);
            return created;
          });
          return json(res, 201, { data: safeUser(savedUser), message: 'حساب کاربری ایجاد شد.' });
        }
        if (!collectionNames.has(resource)) return json(res, 400, { error: 'افزودن رکورد در این بخش پشتیبانی نمی‌شود.' });
        const allowedPostFields = new Set([...(PATCH_FIELDS[resource] || []), ...(POST_EXTRA_FIELDS[resource] || [])]);
        if (Object.keys(body).some((key) => !allowedPostFields.has(key))) return json(res, 400, { error: 'یکی از فیلدهای ارسالی برای این بخش مجاز نیست.' });
        if (resource === 'timetable' && body.subjectId) {
          const subject = (state.records.subjects || []).find((item) => item.id === normalizeText(body.subjectId, 96));
          if (!subject) return json(res, 400, { error: 'درس انتخاب‌شده در فهرست درس‌ها پیدا نشد.' });
          body.subject = subject.name;
        }
        for (const key of ['classIds', 'studentIds']) {
          if (Object.hasOwn(body, key) && !Array.isArray(body[key])) return json(res, 400, { error: `فیلد ${key} باید فهرستی از شناسه‌ها باشد.` });
        }
        const missingFields = (REQUIRED_RECORD_FIELDS[resource] || []).filter((key) => body[key] === undefined || body[key] === null || String(body[key]).trim() === '');
        if (missingFields.length) return json(res, 400, { error: 'فیلدهای ضروری را کامل کنید.' });
        const calendarDateError = validateCalendarDateFields(resource, body);
        if (calendarDateError) return json(res, 400, { error: calendarDateError });
        if ((body.status === undefined || body.status === null || body.status === '') && DEFAULT_RECORD_STATUS[resource]) body.status = DEFAULT_RECORD_STATUS[resource];
        const enumError = enumFieldError(resource, body);
        if (enumError) return json(res, 400, { error: enumError });
        if (resource === 'classes' && Object.hasOwn(body, 'shift')) {
          const normalizedShift = shiftKey(body.shift);
          if (!normalizedShift) return json(res, 400, { error: 'نوبت کلاس باید صبح، عصر یا همه باشد.' });
          body.shift = normalizedShift;
        }
        for (const key of NUMERIC_FIELDS[resource] || []) {
          const defaultValue = DEFAULT_NUMERIC_FIELDS[resource]?.[key];
          if (body[key] === undefined) {
            if (defaultValue === undefined) continue;
            body[key] = defaultValue;
          }
          if (body[key] === null || body[key] === '') {
            if ((REQUIRED_RECORD_FIELDS[resource] || []).includes(key)) return json(res, 400, { error: `فیلد ${key} باید عدد معتبر داشته باشد.` });
            body[key] = defaultValue ?? 0;
          }
          const error = numericFieldError(resource, key, body[key]);
          if (error) return json(res, 400, { error });
          body[key] = typeof body[key] === 'string' ? Number(latinDigits(body[key].trim())) : Number(body[key]);
        }
        const referenceError = validateRecordReferences(state, resource, body);
        if (referenceError) return json(res, 400, { error: referenceError });
        if (resource === 'attendance' && !isISODate(String(body.date || ''))) return json(res, 400, { error: 'تاریخ حضور و غیاب معتبر نیست؛ از قالب سال-ماه-روز استفاده کنید.' });
        if (resource === 'attendance' && !['حاضر', 'غایب', 'با تأخیر', 'مرخصی'].includes(body.status)) return json(res, 400, { error: 'وضعیت حضور و غیاب معتبر نیست.' });
        if (resource === 'attendance') {
          const parsedTime = body.time ? parseClock(body.time) : null;
          if (body.time && !parsedTime) return json(res, 400, { error: 'ساعت حضور باید با قالب ۲۴ ساعتهٔ ساعت:دقیقه وارد شود.' });
          body.time = ['غایب', 'مرخصی'].includes(body.status) ? '' : parsedTime?.value || schoolClock(state.settings?.timezone || 'Asia/Tehran');
        }
        if (resource === 'timetable') {
          const timetableError = validateTimetableEntry(state.records.timetable || [], body, '', state.settings || {}, state.records.classes || []);
          if (timetableError) return json(res, timetableError.status, { error: timetableError.message });
        }
        if (resource === 'library' && Number(body.available || 0) > Number(body.copies || 0)) return json(res, 400, { error: 'تعداد نسخه‌های موجود نمی‌تواند از کل نسخه‌ها بیشتر باشد.' });
        if (resource === 'grades' && Number(body.maxScore || 20) < Number(body.score)) return json(res, 400, { error: 'نمره کسب‌شده نمی‌تواند از نمره کل بیشتر باشد.' });
        const uniqueField = { students: 'studentNo', teachers: 'teacherNo' }[resource];
        if (uniqueField && (state.records[resource] || []).some((item) => String(item[uniqueField]).toLowerCase() === String(body[uniqueField]).trim().toLowerCase())) {
          return json(res, 409, { error: `این ${resource === 'students' ? 'شماره دانش‌آموزی' : 'کد پرسنلی'} قبلاً ثبت شده است.` });
        }
        const prepared = cloneInput(body);
        const prefix = PREFIXES[resource] || resource.slice(0, 3);
        const record = { id: randomId(prefix), ...prepared, createdAt: new Date().toISOString(), isDemo: false };
        if (resource === 'classes') record.studentCount = 0;
        if (resource === 'tickets') {
            const firstText = normalizeText(body.firstMessage || body.description || body.subject, 3000);
          record.messages = [{ sender: user.name, role: user.role, text: firstText, at: new Date().toISOString() }];
          record.createdAt = new Date().toISOString();
          record.lastReplyAt = record.createdAt;
          record.status = record.status || 'باز';
          if (user.role === 'student' || user.role === 'parent') {
            const student = state.records.students.find((item) => accountStudentIds(user).has(item.id));
            record.studentId = student?.id || user.studentId;
            record.studentName = student?.name || user.name;
            record.classId = student?.classId || '';
          }
          if (user.role === 'teacher') record.teacherId = user.teacherId;
          if (user.role === 'student' || user.role === 'parent') record.status = 'باز';
          delete record.firstMessage;
        }
        if (user.role === 'teacher') {
          const ownClassIds = teacherClassIds(state, user);
          if (record.classId && !ownClassIds.has(record.classId)) return json(res, 403, { error: 'فقط برای کلاس‌های خودتان می‌توانید ثبت انجام دهید.' });
          if (record.teacherId && record.teacherId !== user.teacherId) return json(res, 403, { error: 'امکان ثبت به نام معلم دیگر وجود ندارد.' });
          if (['attendance', 'assignments', 'exams', 'grades'].includes(resource)) record.teacherId = user.teacherId;
        }
        if (resource === 'attendance' || resource === 'grades') {
          const student = state.records.students.find((item) => item.id === record.studentId);
          if (!student) return json(res, 400, { error: 'دانش‌آموز انتخاب‌شده در پرونده‌ها پیدا نشد.' });
          record.studentName = student.name;
          if (!record.classId) record.classId = student.classId;
          if (record.classId !== student.classId) return json(res, 400, { error: 'کلاس انتخاب‌شده با پرونده دانش‌آموز هم‌خوانی ندارد.' });
          if (user.role === 'teacher' && !teacherClassIds(state, user).has(student.classId)) return json(res, 403, { error: 'فقط برای دانش‌آموزان کلاس‌های خودتان می‌توانید ثبت کنید.' });
          if (customRoleConfig(state, user) && !roleClassIds(state, user).has(student.classId)) return json(res, 403, { error: 'دانش‌آموز خارج از کلاس‌های مجاز این نقش است.' });
        }
        if (resource === 'finance') {
          const student = state.records.students.find((item) => item.id === record.studentId);
          if (!student) return json(res, 400, { error: 'دانش‌آموز انتخاب‌شده در پرونده‌ها پیدا نشد.' });
          record.studentName = student.name;
        }
        if (resource === 'tickets' && record.studentId && !record.studentName) {
          const student = state.records.students.find((item) => item.id === record.studentId);
          if (student) { record.studentName = student.name; record.classId = student.classId; }
        }
        if (customRoleConfig(state, user) && !customWriteAllowedByScope(state, user, resource, record)) return json(res, 403, { error: 'این عملیات خارج از محدودهٔ دادهٔ واگذارشده به نقش شماست.' });
        if (resource === 'attendance') {
          const existing = (state.records.attendance || []).find((item) => item.studentId === record.studentId && item.date === record.date);
          if (existing) {
            const updatedAttendance = await store().transact((draft) => {
              const item = draft.records.attendance.find((entry) => entry.id === existing.id);
              for (const key of ['status', 'time', 'note', 'teacherId']) if (Object.hasOwn(record, key)) item[key] = record[key];
              item.updatedAt = new Date().toISOString();
              addAudit(draft, user, 'update', 'attendance', item.id, `به‌روزرسانی حضور و غیاب ${item.studentName}`);
              return item;
            });
            return json(res, 200, { data: updatedAttendance, message: 'ثبت حضور همان روز به‌روزرسانی شد.' });
          }
        }
        let account = null;
        const login = sanitizeUserInput(body);
        const canMakeAccount = (resource === 'students' || resource === 'teachers') && login.username && login.password;
        if ((login.username && !login.password) || (!login.username && login.password)) return json(res, 400, { error: 'برای ساخت حساب، نام کاربری و گذرواژه را با هم وارد کنید.' });
        if (canMakeAccount) {
          if (!isValidUsername(login.username)) return json(res, 400, { error: 'نام کاربری حساب باید ۳ تا ۴۰ نویسه انگلیسی و عدد باشد.' });
          if (login.password.length < 8) return json(res, 400, { error: 'گذرواژه حساب باید دست‌کم ۸ نویسه باشد.' });
          if (!ensureUniqueUsername(state, login.username)) return json(res, 409, { error: 'این نام کاربری قبلاً استفاده شده است.' });
          if (hasDuplicateUserPhone(state, record.phone)) return json(res, 409, { error: 'شمارهٔ موبایل نرمال‌شده قبلاً به حساب فعال دیگری متصل است.' });
          account = { id: randomId('usr'), username: login.username, name: record.name, role: resource === 'students' ? 'student' : 'teacher', status: record.status === 'فعال' ? 'فعال' : 'غیرفعال', phone: normalizeText(record.phone, 40), passwordHash: await hashPassword(login.password), isDemo: false, createdAt: new Date().toISOString() };
          if (resource === 'students') account.studentId = record.id;
          if (resource === 'teachers') account.teacherId = record.id;
          delete record.accountUsername;
          delete record.accountPassword;
        }
        if (resource === 'students' && record.classId) {
          const classroom = state.records.classes.find((entry) => entry.id === record.classId);
          if (!classroom) return json(res, 400, { error: 'کلاس انتخاب‌شده وجود ندارد.' });
          if (classroom.status !== 'فعال') return json(res, 409, { error: 'ثبت دانش‌آموز در کلاس غیرفعال امکان‌پذیر نیست.' });
          if (Number(classroom.studentCount || 0) >= Number(classroom.capacity || 0) && Number(classroom.capacity || 0) > 0) return json(res, 409, { error: 'ظرفیت این کلاس تکمیل شده است.' });
        }
        const saved = await store().transact((draft) => {
          if (!collectionNames.has(resource)) throw Object.assign(new Error('افزودن رکورد در این بخش پشتیبانی نمی‌شود.'), { statusCode: 400 });
          if (!Array.isArray(draft.records[resource])) draft.records[resource] = [];
          const uniqueField = { students: 'studentNo', teachers: 'teacherNo' }[resource];
          if (uniqueField && draft.records[resource].some((entry) => String(entry[uniqueField]).toLowerCase() === String(record[uniqueField]).trim().toLowerCase())) throw Object.assign(new Error(`این ${resource === 'students' ? 'شماره دانش‌آموزی' : 'کد پرسنلی'} قبلاً ثبت شده است.`), { statusCode: 409 });
          if (resource === 'attendance' && draft.records.attendance.some((entry) => entry.studentId === record.studentId && entry.date === record.date)) throw Object.assign(new Error('برای این دانش‌آموز در این تاریخ حضور و غیاب ثبت شده است.'), { statusCode: 409 });
          if (resource === 'timetable') {
            const issue = validateTimetableEntry(draft.records.timetable || [], record, '', draft.settings || {}, draft.records.classes || []);
            if (issue) throw Object.assign(new Error(issue.message), { statusCode: issue.status });
          }
          if (account) {
            if (!ensureUniqueUsername(draft, account.username)) throw Object.assign(new Error('این نام کاربری قبلاً استفاده شده است.'), { statusCode: 409 });
            if (hasDuplicateUserPhone(draft, account.phone)) throw Object.assign(new Error('شمارهٔ موبایل نرمال‌شده قبلاً به حساب فعال دیگری متصل است.'), { statusCode: 409 });
            draft.users.push(account);
          }
          draft.records[resource].unshift(record);
          if (resource === 'students' && record.classId) {
            const classroom = draft.records.classes.find((entry) => entry.id === record.classId);
            if (!classroom) throw Object.assign(new Error('کلاس انتخاب‌شده وجود ندارد.'), { statusCode: 400 });
            if (classroom.status !== 'فعال') throw Object.assign(new Error('ثبت دانش‌آموز در کلاس غیرفعال امکان‌پذیر نیست.'), { statusCode: 409 });
            if (Number(classroom.capacity || 0) > 0 && Number(classroom.studentCount || 0) >= Number(classroom.capacity)) throw Object.assign(new Error('ظرفیت این کلاس تکمیل شده است.'), { statusCode: 409 });
            classroom.studentCount = Number(classroom.studentCount || 0) + 1;
          }
          if (resource === 'teachers' && Array.isArray(record.classIds)) {
            for (const classId of record.classIds) {
              const classroom = draft.records.classes.find((entry) => entry.id === classId);
              if (!classroom) continue;
              const previousTeacher = draft.records.teachers.find((entry) => entry.id === classroom.teacherId && entry.id !== record.id);
              if (previousTeacher) previousTeacher.classIds = (previousTeacher.classIds || []).filter((id) => id !== classId);
              classroom.teacherId = record.id;
            }
          }
          if (resource === 'classes' && record.teacherId) {
            const teacher = draft.records.teachers.find((entry) => entry.id === record.teacherId);
            if (teacher) teacher.classIds = [...new Set([...(teacher.classIds || []), record.id])];
          }
          addAudit(draft, user, 'create', resource, record.id, `افزودن ${record.name || record.title || record.subject || resource}`);
          return record;
        });
        return json(res, 201, { data: safeUser(saved), accountCreated: Boolean(account), message: account ? 'رکورد و حساب کاربری با موفقیت ایجاد شد.' : 'رکورد با موفقیت ایجاد شد.' });
      }

      if (method === 'PATCH' && recordId) {
        const body = await readBody(req);
        if (!canWriteResource(user, resource, state)) return json(res, 403, { error: 'اجازه ویرایش در این بخش را ندارید.' });
        if (resource === 'users') {
          if (user.role !== 'admin') return json(res, 403, { error: 'فقط مدیر می‌تواند کاربران را ویرایش کند.' });
          const target = state.users.find((entry) => entry.id === recordId);
          if (!target) return json(res, 404, { error: 'کاربر پیدا نشد.' });
          const allowedUserFields = new Set(['name', 'phone', 'status', 'role', 'password', 'studentId', 'teacherId', 'parentId', 'classIds']);
          if (Object.keys(body).some((key) => !allowedUserFields.has(key))) return json(res, 400, { error: 'یکی از فیلدهای ارسالی برای ویرایش کاربر مجاز نیست.' });
          const phoneWillChange = Object.hasOwn(body, 'phone') || (Object.hasOwn(body, 'status') && body.status !== 'غیرفعال' && target.status === 'غیرفعال');
          const nextPhone = Object.hasOwn(body, 'phone') ? normalizeText(body.phone, 40) : target.phone;
          const nextStatus = Object.hasOwn(body, 'status') ? body.status : target.status;
          if (phoneWillChange && nextStatus !== 'غیرفعال' && hasDuplicateUserPhone(state, nextPhone, recordId)) return json(res, 409, { error: 'شمارهٔ موبایل نرمال‌شده قبلاً به حساب فعال دیگری متصل است.' });
          const nextRole = Object.hasOwn(body, 'role') ? body.role : target.role;
          const nextCustomRole = customRoleConfig(state, nextRole);
          if (!['admin', 'teacher', 'student', 'parent'].includes(nextRole) && !nextCustomRole) return json(res, 400, { error: 'نقش انتخاب‌شده معتبر نیست.' });
          if (Object.hasOwn(body, 'status') && !['فعال', 'غیرفعال'].includes(body.status)) return json(res, 400, { error: 'وضعیت حساب معتبر نیست.' });
          if (Object.hasOwn(body, 'classIds') && !Array.isArray(body.classIds)) return json(res, 400, { error: 'فهرست کلاس‌های مجاز معتبر نیست.' });
          const roleChanged = nextRole !== target.role;
          const associationKeys = ['studentId', 'teacherId', 'parentId', 'classIds'];
          const associationSubmitted = associationKeys.some((key) => Object.hasOwn(body, key));
          const classIds = [...new Set((Array.isArray(Object.hasOwn(body, 'classIds') ? body.classIds : target.classIds) ? (Object.hasOwn(body, 'classIds') ? body.classIds : target.classIds) : []).map((id) => normalizeText(id, 96)).filter(Boolean))];
          if (nextCustomRole?.scope === 'classes' && (roleChanged || associationSubmitted) && (!classIds.length || classIds.some((id) => !(state.records.classes || []).some((entry) => entry.id === id)))) return json(res, 400, { error: 'برای این نقش، دست‌کم یک کلاس معتبر را انتخاب کنید.' });
          if (nextCustomRole?.scope === 'school' && classIds.length) return json(res, 400, { error: 'برای نقش با دسترسی مدرسه، انتخاب کلاس لازم نیست.' });
          const studentId = normalizeText(Object.hasOwn(body, 'studentId') ? body.studentId : target.studentId, 96);
          const teacherId = normalizeText(Object.hasOwn(body, 'teacherId') ? body.teacherId : target.teacherId, 96);
          const parentId = normalizeText(Object.hasOwn(body, 'parentId') ? body.parentId : target.parentId, 96);
          if (roleChanged || associationSubmitted) {
            if (nextRole === 'student' && !state.records.students.some((entry) => entry.id === studentId)) return json(res, 400, { error: 'برای حساب دانش‌آموز، پرونده معتبر انتخاب کنید.' });
            if (nextRole === 'teacher' && !state.records.teachers.some((entry) => entry.id === teacherId)) return json(res, 400, { error: 'برای حساب معلم، پرونده معتبر انتخاب کنید.' });
            if (nextRole === 'parent' && !state.records.parents.some((entry) => entry.id === parentId)) return json(res, 400, { error: 'برای حساب ولی، پرونده معتبر اولیا انتخاب کنید.' });
          }
          if (nextStatus === 'فعال' && (roleChanged || associationSubmitted || Object.hasOwn(body, 'status'))) {
            const linkedError = linkedAccountError(state, { ...target, ...body, role: nextRole, status: nextStatus, studentId, teacherId, parentId, classIds });
            if (linkedError) return json(res, 400, { error: linkedError });
          }
          const updated = await store().transact(async (draft) => {
            const item = draft.users.find((entry) => entry.id === recordId);
            if (!item) throw Object.assign(new Error('کاربر پیدا نشد.'), { statusCode: 404 });
            const draftPhone = Object.hasOwn(body, 'phone') ? normalizeText(body.phone, 40) : item.phone;
            const draftStatus = Object.hasOwn(body, 'status') ? body.status : item.status;
            if ((Object.hasOwn(body, 'phone') || (Object.hasOwn(body, 'status') && body.status !== 'غیرفعال' && item.status === 'غیرفعال')) && draftStatus !== 'غیرفعال' && hasDuplicateUserPhone(draft, draftPhone, recordId)) throw Object.assign(new Error('شمارهٔ موبایل نرمال‌شده قبلاً به حساب فعال دیگری متصل است.'), { statusCode: 409 });
            if (item.id === user.id && (nextRole !== 'admin' || body.status === 'غیرفعال')) throw Object.assign(new Error('نمی‌توانید نقش مدیر یا وضعیت حساب فعلی خود را غیرفعال کنید.'), { statusCode: 409 });
            if (Object.hasOwn(body, 'name')) {
              const name = normalizeText(body.name, 100);
              if (!name) throw Object.assign(new Error('نام کاربر نمی‌تواند خالی باشد.'), { statusCode: 400 });
              item.name = name;
            }
            if (Object.hasOwn(body, 'phone')) item.phone = normalizeText(body.phone, 40);
            if (Object.hasOwn(body, 'status')) item.status = body.status;
            if (roleChanged || Object.hasOwn(body, 'role')) item.role = nextRole;
            if (roleChanged || associationSubmitted) {
              if (nextRole === 'student') item.studentId = studentId; else delete item.studentId;
              if (nextRole === 'teacher') item.teacherId = teacherId; else delete item.teacherId;
              if (nextRole === 'parent') item.parentId = parentId; else delete item.parentId;
              if (nextCustomRole?.scope === 'classes') item.classIds = classIds; else delete item.classIds;
            }
            if (body.password) {
              if (String(body.password).length < 8) throw Object.assign(new Error('گذرواژه جدید باید دست‌کم ۸ نویسه باشد.'), { statusCode: 400 });
              item.passwordHash = await hashPassword(String(body.password));
            }
            const activeAdmins = draft.users.filter((entry) => entry.role === 'admin' && entry.status !== 'غیرفعال');
            if (!activeAdmins.length) throw Object.assign(new Error('سامانه باید دست‌کم یک مدیر فعال داشته باشد.'), { statusCode: 409 });
            const otpAccountError = otpAccountReadinessError(normalizedLoginMode(draft.settings), draft.users);
            if (otpAccountError) throw Object.assign(new Error(otpAccountError), { statusCode: 409 });
            addAudit(draft, user, 'update', resource, item.id, `به‌روزرسانی کاربر ${item.name}`);
            return safeUser(item);
          });
          if (['password', 'phone', 'status', 'role', 'studentId', 'teacherId', 'parentId', 'classIds'].some((field) => Object.hasOwn(body, field))) revokeUserSessions(ctx, recordId);
          return json(res, 200, { data: updated, message: 'کاربر به‌روزرسانی شد؛ در صورت تغییر اطلاعات ورود، حساب هدف باید دوباره وارد شود.' });
        }
        if (!collectionNames.has(resource)) return json(res, 400, { error: 'این بخش قابل ویرایش نیست.' });
        const allowedPatchFields = user.role === 'teacher' ? (TEACHER_PATCH_FIELDS[resource] || []) : (PATCH_FIELDS[resource] || []);
        if (!Object.keys(body).length) return json(res, 400, { error: 'دست‌کم یک فیلد برای به‌روزرسانی ارسال کنید.' });
        if (Object.keys(body).some((key) => !allowedPatchFields.includes(key))) {
          return json(res, user.role === 'teacher' ? 403 : 400, { error: user.role === 'teacher' ? 'این فیلد برای نقش معلم قابل تغییر نیست.' : 'یکی از فیلدهای ارسالی برای این بخش مجاز نیست.' });
        }
        for (const key of ['classIds', 'studentIds']) {
          if (Object.hasOwn(body, key) && !Array.isArray(body[key])) return json(res, 400, { error: `فیلد ${key} باید فهرستی از شناسه‌ها باشد.` });
          if (Object.hasOwn(body, key)) body[key] = [...new Set(body[key].map((id) => normalizeText(id, 96)).filter(Boolean))];
        }
        const current = (state.records[resource] || []).find((entry) => entry.id === recordId);
        if (!current) return json(res, 404, { error: 'رکورد پیدا نشد.' });
        for (const key of NUMERIC_FIELDS[resource] || []) {
          if (!Object.hasOwn(body, key)) continue;
          const defaultValue = DEFAULT_NUMERIC_FIELDS[resource]?.[key];
          if (body[key] === '' || body[key] === null) {
            if ((REQUIRED_RECORD_FIELDS[resource] || []).includes(key)) return json(res, 400, { error: `فیلد ${key} باید عدد معتبر داشته باشد.` });
            body[key] = defaultValue ?? 0;
          }
          const error = numericFieldError(resource, key, body[key]);
          if (error) return json(res, 400, { error });
          body[key] = typeof body[key] === 'string' ? Number(latinDigits(body[key].trim())) : Number(body[key]);
        }
        const enumError = enumFieldError(resource, body);
        if (enumError) return json(res, 400, { error: enumError });
        if (resource === 'classes' && Object.hasOwn(body, 'shift')) {
          const normalizedShift = shiftKey(body.shift);
          if (!normalizedShift) return json(res, 400, { error: 'نوبت کلاس باید صبح، عصر یا همه باشد.' });
          body.shift = normalizedShift;
        }
        const mergedRecord = { ...current, ...body };
        const calendarDateError = validateCalendarDateFields(resource, mergedRecord);
        if (calendarDateError) return json(res, 400, { error: calendarDateError });
        const allowHistoricalAttendance = resource === 'attendance' && !Object.hasOwn(body, 'classId') && !Object.hasOwn(body, 'studentId');
        const referenceError = validateRecordReferences(state, resource, mergedRecord, { allowHistoricalAttendance });
        if (referenceError) return json(res, 400, { error: referenceError });
        if (resource === 'timetable' && Object.hasOwn(body, 'subjectId')) body.subject = mergedRecord.subject;
        if (customRoleConfig(state, user)) {
          const visibleRecords = recordsForRole(state, user, resource) || [];
          if (!visibleRecords.some((entry) => entry.id === recordId) || !customWriteAllowedByScope(state, user, resource, mergedRecord)) return json(res, 404, { error: 'رکورد در محدودهٔ مجاز این نقش پیدا نشد.' });
        }
        if (resource === 'attendance' && Object.hasOwn(body, 'date') && !isISODate(String(body.date || ''))) return json(res, 400, { error: 'تاریخ حضور و غیاب معتبر نیست؛ از قالب سال-ماه-روز استفاده کنید.' });
        if (resource === 'attendance' && Object.hasOwn(body, 'status') && !['حاضر', 'غایب', 'با تأخیر', 'مرخصی'].includes(body.status)) return json(res, 400, { error: 'وضعیت حضور و غیاب معتبر نیست.' });
        if (resource === 'attendance' && (Object.hasOwn(body, 'status') || Object.hasOwn(body, 'time'))) {
          const nextStatus = mergedRecord.status;
          const rawTime = Object.hasOwn(body, 'time') ? body.time : mergedRecord.time;
          const parsedTime = rawTime ? parseClock(rawTime) : null;
          if (rawTime && !parsedTime) return json(res, 400, { error: 'ساعت حضور باید با قالب ۲۴ ساعتهٔ ساعت:دقیقه وارد شود.' });
          body.time = ['غایب', 'مرخصی'].includes(nextStatus) ? '' : parsedTime?.value || schoolClock(state.settings?.timezone || 'Asia/Tehran');
        }
        if (resource === 'timetable') {
          const timetableError = validateTimetableEntry(state.records.timetable || [], mergedRecord, recordId, state.settings || {}, state.records.classes || []);
          if (timetableError) return json(res, timetableError.status, { error: timetableError.message });
          for (const key of ['day', 'periodId', 'periodName', 'academicYear', 'startTime', 'endTime']) body[key] = mergedRecord[key];
        }
        if (resource === 'classes' && Object.hasOwn(body, 'shift')) {
          const nextClasses = (state.records.classes || []).map((classroom) => classroom.id === recordId ? mergedRecord : classroom);
          for (const row of (state.records.timetable || []).filter((entry) => entry.classId === recordId)) {
            const issue = validateTimetableEntry(state.records.timetable || [], { ...row }, row.id, state.settings || {}, nextClasses);
            if (issue) return json(res, 409, { error: `نوبت کلاس با برنامهٔ «${row.subject || row.id}» سازگار نیست: ${issue.message}` });
          }
        }
        if (resource === 'classes' && Number(mergedRecord.capacity || 0) > 0 && Number(mergedRecord.studentCount || 0) > Number(mergedRecord.capacity)) return json(res, 409, { error: 'تعداد فعلی دانش‌آموزان نمی‌تواند از ظرفیت کلاس بیشتر باشد.' });
        if (resource === 'library' && Number(mergedRecord.available || 0) > Number(mergedRecord.copies || 0)) return json(res, 400, { error: 'تعداد نسخه‌های موجود نمی‌تواند از کل نسخه‌ها بیشتر باشد.' });
        if (resource === 'grades' && Number(mergedRecord.maxScore || 20) < Number(mergedRecord.score)) return json(res, 400, { error: 'نمره کسب‌شده نمی‌تواند از نمره کل بیشتر باشد.' });
        if (user.role === 'teacher') {
          const ownClassIds = teacherClassIds(state, user);
          if (current.teacherId && current.teacherId !== user.teacherId && !ownClassIds.has(current.classId)) return json(res, 403, { error: 'این رکورد به کلاس شما مربوط نیست.' });
          if (current.classId && !ownClassIds.has(current.classId)) return json(res, 403, { error: 'این رکورد به کلاس شما مربوط نیست.' });
        }
        if (customRoleConfig(state, user) && resource === 'attendance' && (!roleClassIds(state, user).has(current.classId) || !roleClassIds(state, user).has(mergedRecord.classId))) return json(res, 403, { error: 'ثبت حضور و غیاب فقط برای کلاس‌های مجاز این نقش امکان‌پذیر است.' });
        if (user.role === 'student' || user.role === 'parent') {
          const ownIds = accountStudentIds(user);
          if (user.role === 'parent' && user.parentId) {
            const parentRecord = (state.records.parents || []).find((entry) => entry.id === user.parentId);
            for (const id of parentRecord?.studentIds || []) ownIds.add(id);
          }
          if (resource !== 'tickets' || !ownIds.has(current.studentId)) return json(res, 403, { error: 'فقط می‌توانید گفت‌وگوی مربوط به خود را به‌روزرسانی کنید.' });
          if (Object.keys(body).some((key) => key !== 'reply')) return json(res, 403, { error: 'در این گفت‌وگو فقط امکان ارسال پاسخ دارید.' });
          if (!normalizeText(body.reply, 3000)) return json(res, 400, { error: 'متن پاسخ نمی‌تواند خالی باشد.' });
        }
        if (resource === 'tickets' && body.reply && current.status === 'بسته' && body.status !== 'باز') return json(res, 409, { error: 'برای پاسخ‌گویی دوباره، ابتدا تیکت را باز کنید.' });
        if (resource === 'students' && Object.hasOwn(body, 'studentNo') && (state.records.students || []).some((entry) => entry.id !== recordId && String(entry.studentNo).toLowerCase() === normalizeText(body.studentNo, 64).toLowerCase())) {
          return json(res, 409, { error: 'این شماره دانش‌آموزی قبلاً ثبت شده است.' });
        }
        if (resource === 'teachers' && Object.hasOwn(body, 'teacherNo') && (state.records.teachers || []).some((entry) => entry.id !== recordId && String(entry.teacherNo).toLowerCase() === normalizeText(body.teacherNo, 64).toLowerCase())) {
          return json(res, 409, { error: 'این کد پرسنلی قبلاً ثبت شده است.' });
        }
        if (resource === 'students' && (Object.hasOwn(body, 'classId') || Object.hasOwn(body, 'name') || Object.hasOwn(body, 'studentNo')) && !(Object.hasOwn(body, 'classId') ? body.classId : current.classId)) {
          return json(res, 400, { error: 'انتخاب کلاس برای پرونده دانش‌آموز ضروری است.' });
        }
        if (resource === 'students' && Object.hasOwn(body, 'classId') && body.classId !== current.classId) {
          const targetClass = state.records.classes.find((entry) => entry.id === body.classId);
          if (!targetClass) return json(res, 400, { error: 'کلاس انتخاب‌شده وجود ندارد.' });
          if (targetClass.status !== 'فعال') return json(res, 409, { error: 'انتقال دانش‌آموز به کلاس غیرفعال امکان‌پذیر نیست.' });
          if (Number(targetClass.studentCount || 0) >= Number(targetClass.capacity || 0) && Number(targetClass.capacity || 0) > 0) return json(res, 409, { error: 'ظرفیت این کلاس تکمیل شده است.' });
        }
        if (resource === 'attendance') {
          const nextStudentId = Object.hasOwn(body, 'studentId') ? body.studentId : current.studentId;
          const nextDate = Object.hasOwn(body, 'date') ? body.date : current.date;
          const duplicate = (state.records.attendance || []).some((entry) => entry.id !== recordId && entry.studentId === nextStudentId && entry.date === nextDate);
          if (duplicate) return json(res, 409, { error: 'برای این دانش‌آموز در این تاریخ حضور و غیاب ثبت شده است.' });
        }
        if (['attendance', 'grades'].includes(resource) && (Object.hasOwn(body, 'studentId') || Object.hasOwn(body, 'classId'))) {
          const studentId = Object.hasOwn(body, 'studentId') ? body.studentId : current.studentId;
          const student = (state.records.students || []).find((entry) => entry.id === studentId);
          if (!student) return json(res, 400, { error: 'دانش‌آموز انتخاب‌شده پیدا نشد.' });
          const classId = Object.hasOwn(body, 'classId') ? body.classId : current.classId || student.classId;
          if (classId !== student.classId) return json(res, 400, { error: 'کلاس انتخاب‌شده با پرونده دانش‌آموز هم‌خوانی ندارد.' });
          body.studentName = student.name;
          body.classId = classId;
        }
        if (user.role === 'teacher') {
          const ownClassIds = teacherClassIds(state, user);
          if (['assignments', 'exams'].includes(resource) && Object.hasOwn(body, 'classId') && !ownClassIds.has(body.classId)) return json(res, 403, { error: 'فقط می‌توانید محتوای کلاس‌های خودتان را ویرایش کنید.' });
          if (resource === 'tickets' && Object.hasOwn(body, 'reply') && !normalizeText(body.reply, 3000)) return json(res, 400, { error: 'متن پاسخ نمی‌تواند خالی باشد.' });
        }
        if (['attendance', 'grades', 'finance'].includes(resource) && Object.hasOwn(body, 'studentName')) {
          const selectedStudentId = Object.hasOwn(body, 'studentId') ? body.studentId : current.studentId;
          const selectedStudent = (state.records.students || []).find((entry) => entry.id === selectedStudentId);
          if (!selectedStudent) return json(res, 400, { error: 'دانش‌آموز انتخاب‌شده در پرونده‌ها پیدا نشد.' });
          body.studentName = selectedStudent.name;
        }
        const prepared = cloneInput(body);
        const invalidatedUserIds = [];
        const updated = await store().transact((draft) => {
          const item = draft.records[resource].find((entry) => entry.id === recordId);
          if (!item) throw Object.assign(new Error('رکورد پیدا نشد.'), { statusCode: 404 });
          const uniqueField = { students: 'studentNo', teachers: 'teacherNo' }[resource];
          if (uniqueField && prepared[uniqueField] && draft.records[resource].some((entry) => entry.id !== recordId && String(entry[uniqueField]).toLowerCase() === String(prepared[uniqueField]).trim().toLowerCase())) throw Object.assign(new Error(`این ${resource === 'students' ? 'شماره دانش‌آموزی' : 'کد پرسنلی'} قبلاً ثبت شده است.`), { statusCode: 409 });
          if (resource === 'attendance' && (Object.hasOwn(body, 'studentId') || Object.hasOwn(body, 'date'))) {
            const studentId = Object.hasOwn(body, 'studentId') ? body.studentId : item.studentId;
            const date = Object.hasOwn(body, 'date') ? body.date : item.date;
            if (draft.records.attendance.some((entry) => entry.id !== recordId && entry.studentId === studentId && entry.date === date)) throw Object.assign(new Error('برای این دانش‌آموز در این تاریخ حضور و غیاب ثبت شده است.'), { statusCode: 409 });
          }
          if (resource === 'timetable') {
            const candidate = { ...item, ...prepared };
            const issue = validateTimetableEntry(draft.records.timetable || [], candidate, recordId, draft.settings || {}, draft.records.classes || []);
            if (issue) throw Object.assign(new Error(issue.message), { statusCode: issue.status });
            Object.assign(prepared, {
              day: candidate.day, periodId: candidate.periodId, periodName: candidate.periodName,
              academicYear: candidate.academicYear, startTime: candidate.startTime, endTime: candidate.endTime
            });
          }
          const previousClassId = item.classId;
          const previousTeacherId = item.teacherId;
          const previousClassIds = Array.isArray(item.classIds) ? [...item.classIds] : [];
          if (resource === 'tickets' && body.reply) {
            if (!Array.isArray(item.messages)) item.messages = [];
            item.messages.push({ sender: user.name, role: user.role, text: normalizeText(body.reply, 3000), at: new Date().toISOString() });
            item.lastReplyAt = new Date().toISOString();
            if (body.status && user.role === 'admin') item.status = normalizeText(body.status, 50);
          }
          Object.assign(item, prepared);
          if ((['students', 'teachers'].includes(resource) && Object.hasOwn(prepared, 'status')) ||
              (resource === 'parents' && (Object.hasOwn(prepared, 'status') || Object.hasOwn(prepared, 'studentIds')))) {
            invalidatedUserIds.push(...syncLinkedAccountState(draft, resource, item, current));
          }
          if (resource === 'subjects' && Object.hasOwn(prepared, 'name')) {
            for (const row of draft.records.timetable || []) if (row.subjectId === item.id) row.subject = item.name;
          }
          if (resource === 'classes' && Object.hasOwn(prepared, 'shift')) {
            for (const row of (draft.records.timetable || []).filter((entry) => entry.classId === item.id)) {
              const issue = validateTimetableEntry(draft.records.timetable || [], { ...row }, row.id, draft.settings || {}, draft.records.classes || []);
              if (issue) throw Object.assign(new Error(`نوبت کلاس با برنامهٔ «${row.subject || row.id}» سازگار نیست: ${issue.message}`), { statusCode: 409 });
            }
          }
          if (resource === 'students' && previousClassId !== item.classId) {
            const previousClass = draft.records.classes.find((entry) => entry.id === previousClassId);
            const nextClass = draft.records.classes.find((entry) => entry.id === item.classId);
            if (!nextClass) throw Object.assign(new Error('کلاس انتخاب‌شده وجود ندارد.'), { statusCode: 400 });
            if (nextClass.status !== 'فعال') throw Object.assign(new Error('انتقال دانش‌آموز به کلاس غیرفعال امکان‌پذیر نیست.'), { statusCode: 409 });
            if (Number(nextClass.capacity || 0) > 0 && Number(nextClass.studentCount || 0) >= Number(nextClass.capacity)) throw Object.assign(new Error('ظرفیت این کلاس تکمیل شده است.'), { statusCode: 409 });
            if (previousClass) previousClass.studentCount = Math.max(0, Number(previousClass.studentCount || 0) - 1);
            nextClass.studentCount = Number(nextClass.studentCount || 0) + 1;
          }
          if (resource === 'classes' && Object.hasOwn(prepared, 'teacherId') && previousTeacherId !== item.teacherId) {
            const previousTeacher = draft.records.teachers.find((entry) => entry.id === previousTeacherId);
            if (previousTeacher) previousTeacher.classIds = (previousTeacher.classIds || []).filter((id) => id !== item.id);
            const nextTeacher = draft.records.teachers.find((entry) => entry.id === item.teacherId);
            if (nextTeacher) nextTeacher.classIds = [...new Set([...(nextTeacher.classIds || []), item.id])];
          }
          if (resource === 'teachers' && Object.hasOwn(prepared, 'classIds')) {
            const assigned = new Set(Array.isArray(item.classIds) ? item.classIds : []);
            for (const classId of previousClassIds) {
              if (assigned.has(classId)) continue;
              const classroom = draft.records.classes.find((entry) => entry.id === classId && entry.teacherId === item.id);
              if (classroom) classroom.teacherId = '';
            }
            for (const classId of assigned) {
              const classroom = draft.records.classes.find((entry) => entry.id === classId);
              if (classroom) {
                const oldTeacher = draft.records.teachers.find((entry) => entry.id === classroom.teacherId && entry.id !== item.id);
                if (oldTeacher) oldTeacher.classIds = (oldTeacher.classIds || []).filter((id) => id !== classId);
                classroom.teacherId = item.id;
              }
            }
          }
          item.updatedAt = new Date().toISOString();
          addAudit(draft, user, 'update', resource, item.id, `به‌روزرسانی ${item.name || item.title || item.subject || resource}`);
          return item;
        });
        for (const userId of new Set(invalidatedUserIds)) revokeUserSessions(ctx, userId);
        return json(res, 200, { data: updated, message: 'تغییرات ذخیره شد.' });
      }

      if (method === 'DELETE' && recordId) {
        if (user.role !== 'admin') return json(res, 403, { error: 'حذف فقط برای مدیر سامانه مجاز است.' });
        if (!collectionNames.has(resource) && resource !== 'users') return json(res, 400, { error: 'این بخش قابل حذف نیست.' });
        if (resource === 'users') {
          const targetUser = state.users.find((entry) => entry.id === recordId);
          if (!targetUser) return json(res, 404, { error: 'کاربر پیدا نشد.' });
          if (targetUser.id === user.id) return json(res, 409, { error: 'حساب فعلی مدیر را نمی‌توان حذف کرد.' });
          if (targetUser.role === 'admin' && targetUser.status !== 'غیرفعال' && state.users.filter((entry) => entry.role === 'admin' && entry.status !== 'غیرفعال').length <= 1) {
            return json(res, 409, { error: 'سامانه باید دست‌کم یک مدیر فعال داشته باشد.' });
          }
        }
        const result = await store().transact((draft) => {
          if (resource === 'users') {
            const target = draft.users.find((entry) => entry.id === recordId);
            if (!target) return false;
            if (target.id === user.id) throw Object.assign(new Error('حساب فعلی مدیر را نمی‌توان حذف کرد.'), { statusCode: 409 });
            const activeAdmins = draft.users.filter((entry) => entry.role === 'admin' && entry.status !== 'غیرفعال');
            if (target.role === 'admin' && target.status !== 'غیرفعال' && activeAdmins.length <= 1) throw Object.assign(new Error('سامانه باید دست‌کم یک مدیر فعال داشته باشد.'), { statusCode: 409 });
            draft.users = draft.users.filter((entry) => entry.id !== recordId);
          } else {
            const list = draft.records[resource] || [];
            const deleted = list.find((entry) => entry.id === recordId);
            if (!deleted) return false;
            if (resource === 'classes' && (draft.records.students || []).some((student) => student.classId === deleted.id)) throw Object.assign(new Error('این کلاس دانش‌آموز فعال دارد؛ ابتدا دانش‌آموزان را به کلاس دیگری منتقل کنید.'), { statusCode: 409 });
            if (resource === 'classes' && (draft.records.timetable || []).some((row) => row.classId === deleted.id)) throw Object.assign(new Error('این کلاس در برنامهٔ هفتگی استفاده می‌شود؛ ابتدا زنگ‌های آن را به کلاس دیگری منتقل یا حذف کنید.'), { statusCode: 409 });
            if (resource === 'teachers' && (draft.records.timetable || []).some((row) => row.teacherId === deleted.id)) throw Object.assign(new Error('این دبیر در زنگ‌های برنامهٔ هفتگی انتخاب شده است؛ ابتدا دبیر زنگ‌ها را جایگزین کنید.'), { statusCode: 409 });
            if (resource === 'subjects' && (draft.records.timetable || []).some((row) => row.subjectId === deleted.id)) throw Object.assign(new Error('این درس در برنامهٔ هفتگی استفاده می‌شود؛ ابتدا زنگ‌های وابسته را ویرایش یا حذف کنید.'), { statusCode: 409 });
            draft.records[resource] = list.filter((entry) => entry.id !== recordId);
            if (resource === 'students') {
              const classroom = draft.records.classes.find((entry) => entry.id === deleted.classId);
              if (classroom) classroom.studentCount = Math.max(0, Number(classroom.studentCount || 0) - 1);
              for (const parent of draft.records.parents || []) parent.studentIds = (parent.studentIds || []).filter((id) => id !== deleted.id);
              for (const account of draft.users) {
                if (Array.isArray(account.studentIds)) account.studentIds = account.studentIds.filter((id) => id !== deleted.id);
                if (account.studentId !== deleted.id) continue;
                if (account.role === 'parent') {
                  const parent = (draft.records.parents || []).find((entry) => entry.id === account.parentId);
                  const nextStudentId = parent?.studentIds?.[0];
                  if (nextStudentId) account.studentId = nextStudentId;
                  else {
                    delete account.studentId;
                    account.status = 'غیرفعال';
                  }
                } else {
                  delete account.studentId;
                  if (account.role === 'student') account.status = 'غیرفعال';
                }
              }
            }
            if (resource === 'classes') {
              const teacher = draft.records.teachers.find((entry) => entry.id === deleted.teacherId);
              if (teacher) teacher.classIds = (teacher.classIds || []).filter((id) => id !== deleted.id);
            }
            if (resource === 'teachers') {
              for (const classroom of draft.records.classes) if (classroom.teacherId === deleted.id) classroom.teacherId = '';
              for (const account of draft.users) if (account.teacherId === deleted.id) account.status = 'غیرفعال';
            }
            if (resource === 'parents') {
              for (const account of draft.users) if (account.parentId === deleted.id) account.status = 'غیرفعال';
            }
          }
          const otpAccountError = otpAccountReadinessError(normalizedLoginMode(draft.settings), draft.users);
          if (otpAccountError) throw Object.assign(new Error(otpAccountError), { statusCode: 409 });
          addAudit(draft, user, 'delete', resource, recordId, `حذف رکورد ${recordId}`);
          return true;
        });
        return result ? json(res, 200, { ok: true, message: 'رکورد حذف شد.' }) : json(res, 404, { error: 'رکورد پیدا نشد یا قابل حذف نیست.' });
      }
      return json(res, 405, { error: 'روش درخواست پشتیبانی نمی‌شود.' }, { Allow: 'GET, POST, PATCH, DELETE' });
    }

    return json(res, 404, { error: 'مسیر API پیدا نشد.' });
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) console.error('[api]', error);
    return json(res, status, { error: status >= 500 ? 'خطای داخلی سامانه رخ داد.' : error.message || 'درخواست نامعتبر است.' });
  }
}

module.exports = { handleApi, json, readBody, sendIppanelOtp, normalizePhoneNumber, smsConfigurationReady, clientIp, isSecureRequest };
