'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { createInitialState } = require('../src/data/seed');
const { openJsonStore } = require('../src/models/store');
const { handleApi, sendIppanelOtp, normalizePhoneNumber } = require('../src/controllers/apiController');

const SMS_CONFIG = {
  apiKey: 'test-ippanel-api-key-123456',
  fromNumber: '+983000505',
  patternCode: 'school-otp-pattern',
  otpParam: 'code'
};

async function makeApiContext({ sms = SMS_CONFIG, demoMode = false, installed = true } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mad-auth-'));
  const state = await createInitialState(true);
  state.settings.installed = installed;
  const store = await openJsonStore(path.join(directory, 'state.json'), state);
  const ctx = {
    store,
    demoMode,
    sessions: new Map(),
    loginAttempts: new Map(),
    otpChallenges: new Map(),
    otpRateLimits: new Map(),
    otpSecret: Buffer.alloc(32, 0x5a),
    config: { smsManagedFields: [], sms: structuredClone(sms) },
    sentMessages: [],
    savedConfig: [],
    saveConfig: async (config) => { ctx.savedConfig.push(structuredClone(config)); },
    sendSmsOtp: async (message) => { ctx.sentMessages.push(structuredClone(message)); }
  };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    handleApi(req, res, url, ctx).catch((error) => {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: error.message }));
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (route, { method = 'GET', body, cookie, headers = {} } = {}) => {
    const response = await fetch(`${base}${route}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
    let data = {};
    try { data = await response.json(); } catch { /* empty response */ }
    return { response, data };
  };
  const login = async (username = 'admin', password = 'admin123') => {
    const result = await request('/api/auth/login', { method: 'POST', body: { username, password } });
    assert.equal(result.response.status, 200, result.data.error || 'password login should work');
    return result.response.headers.get('set-cookie').split(';')[0];
  };
  return {
    ctx, store, server, request, login,
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      await store.close();
      await fs.rm(directory, { recursive: true, force: true });
    }
  };
}

async function flushSmsQueue() {
  await new Promise((resolve) => setImmediate(resolve));
}

async function enableLoginMode(api, cookie, mode) {
  const result = await api.request('/api/settings', { method: 'PATCH', cookie, body: { loginMode: mode } });
  assert.equal(result.response.status, 200, result.data.error || 'login mode should save');
  return result;
}

test('تنظیم مدیر بین سه روش ورود جابه‌جا می‌شود و کلید IPPanel در API افشا نمی‌شود', async () => {
  const api = await makeApiContext();
  try {
    const admin = await api.login();
    const initial = await api.request('/api/auth/options');
    assert.equal(initial.data.loginMode, 'password');
    assert.equal(initial.data.phoneOtpAvailable, true);
    const blockedInstaller = await api.request('/api/install', { method: 'POST', body: {} });
    assert.equal(blockedInstaller.response.status, 409, 'installation must remain unavailable after setup');

    const enabled = await enableLoginMode(api, admin, 'phone');
    assert.equal(enabled.data.settings.loginMode, 'phone');
    const options = await api.request('/api/auth/options');
    assert.equal(options.data.loginMode, 'phone');
    assert.equal(options.data.passwordLoginAvailable, false);

    const protectedSettings = await api.request('/api/settings', { cookie: admin });
    assert.equal(protectedSettings.response.status, 200);
    assert.equal(protectedSettings.data.sms.configured, true);
    assert.equal(protectedSettings.data.sms.apiKeyConfigured, true);
    assert.equal(JSON.stringify(protectedSettings.data).includes(SMS_CONFIG.apiKey), false);
    const me = await api.request('/api/auth/me', { cookie: admin });
    assert.equal(JSON.stringify(me.data).includes(SMS_CONFIG.apiKey), false);

    const passwordAttempt = await api.request('/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'admin123' } });
    assert.equal(passwordAttempt.response.status, 403);

    const otpStart = await api.request('/api/auth/otp/request', { method: 'POST', body: { phone: '۰۹۱۲۱۱۱۲۲۳۳' } });
    assert.equal(otpStart.response.status, 200);
    await flushSmsQueue();
    const sent = api.ctx.sentMessages.at(-1);
    assert.equal(sent.phone, '+989121112233');
    assert.match(sent.code, /^\d{6}$/);
    const storedChallenge = api.ctx.otpChallenges.get(otpStart.data.challengeId);
    assert.ok(Buffer.isBuffer(storedChallenge.digest) && storedChallenge.digest.length === 32, 'only an HMAC digest is held server-side');
    assert.equal(JSON.stringify(storedChallenge).includes(sent.code), false, 'the raw OTP must not be stored');
    const verified = await api.request('/api/auth/otp/verify', { method: 'POST', body: { challengeId: otpStart.data.challengeId, otp: sent.code } });
    assert.equal(verified.response.status, 200, verified.data.error || 'OTP should authenticate the administrator');
    assert.equal(verified.data.user.role, 'admin');
    assert.ok(verified.response.headers.get('set-cookie').includes('HttpOnly'));
    const replay = await api.request('/api/auth/otp/verify', { method: 'POST', body: { challengeId: otpStart.data.challengeId, otp: sent.code } });
    assert.equal(replay.response.status, 401, 'a successful challenge must be one-use');

    const both = await enableLoginMode(api, admin, 'both');
    assert.equal(both.data.settings.loginMode, 'both');
    const passwordStillWorks = await api.request('/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'admin123' } });
    assert.equal(passwordStillWorks.response.status, 200);
  } finally { await api.close(); }
});

test('ورود پیامکی برای مدیر، معلم، دانش‌آموز و ولی با رقم فارسی/لاتین کار می‌کند', async () => {
  const api = await makeApiContext();
  try {
    const admin = await api.login();
    await enableLoginMode(api, admin, 'both');
    const accounts = [
      { username: 'admin', phone: '۰۹۱۲۱۱۱۲۲۳۳', role: 'admin' },
      { username: 'ahmadi', phone: '09121234567', role: 'teacher' },
      { username: 'sara', phone: '۰۹۱۲۵۵۵۱۲۳۴', role: 'student' },
      { username: 'maryam', phone: '+989125550011', role: 'parent' }
    ];
    for (const account of accounts) {
      const started = await api.request('/api/auth/otp/request', { method: 'POST', body: { phone: account.phone } });
      assert.equal(started.response.status, 200, `${account.role} OTP request should be accepted`);
      await flushSmsQueue();
      const sent = api.ctx.sentMessages.at(-1);
      assert.match(sent.code, /^\d{6}$/);
      const verified = await api.request('/api/auth/otp/verify', { method: 'POST', body: { challengeId: started.data.challengeId, otp: sent.code } });
      assert.equal(verified.response.status, 200, verified.data.error || `${account.role} OTP login failed`);
      assert.equal(verified.data.user.role, account.role);
    }

    api.ctx.otpRateLimits.clear();
    const before = api.ctx.sentMessages.length;
    const known = await api.request('/api/auth/otp/request', { method: 'POST', body: { phone: '09121112233' } });
    await flushSmsQueue();
    const genericMessage = known.data.message;
    const unknown = await api.request('/api/auth/otp/request', { method: 'POST', body: { phone: '+358401234567' } });
    await flushSmsQueue();
    assert.equal(known.response.status, 200);
    assert.equal(unknown.response.status, 200);
    assert.equal(unknown.data.message, genericMessage, 'the public response must not reveal whether an account exists');
    assert.equal(api.ctx.sentMessages.length, before + 1, 'unknown accounts must not trigger an SMS');
  } finally { await api.close(); }
});

test('درخواست OTP محدود، کدها منقضی و تلاش‌های نامعتبر مسدود می‌شوند؛ شمارهٔ تکراری fail-closed است', async () => {
  const api = await makeApiContext();
  try {
    const admin = await api.login();
    await enableLoginMode(api, admin, 'both');

    const unknownPhone = '+358401234568';
    const crossOriginForm = await api.request('/api/auth/otp/request', {
      method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: { phone: unknownPhone }
    });
    assert.equal(crossOriginForm.response.status, 415, 'simple cross-origin form content types must not trigger OTP sends');
    assert.equal(api.ctx.otpRateLimits.size, 0);
    const first = await api.request('/api/auth/otp/request', { method: 'POST', body: { phone: unknownPhone } });
    const cooldown = await api.request('/api/auth/otp/request', { method: 'POST', body: { phone: unknownPhone } });
    assert.equal(first.response.status, 200);
    assert.equal(cooldown.response.status, 429);
    assert.ok(Number(cooldown.response.headers.get('retry-after')) > 0);

    api.ctx.otpRateLimits.clear();
    const proxied = await api.request('/api/auth/otp/request', {
      method: 'POST', headers: { 'X-Forwarded-For': 'spoofed, 203.0.113.8' }, body: { phone: '+358401234569' }
    });
    assert.equal(proxied.response.status, 200);
    assert.ok(api.ctx.otpRateLimits.has('ip:203.0.113.8'), 'cPanel/local reverse-proxy traffic should be keyed by its forwarded client IP');

    api.ctx.otpRateLimits.clear();
    const started = await api.request('/api/auth/otp/request', { method: 'POST', body: { phone: '09121112233' } });
    await flushSmsQueue();
    const sent = api.ctx.sentMessages.at(-1);
    const wrongCode = sent.code === '000000' ? '000001' : '000000';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const rejected = await api.request('/api/auth/otp/verify', { method: 'POST', body: { challengeId: started.data.challengeId, otp: wrongCode } });
      assert.equal(rejected.response.status, 401);
    }
    const locked = await api.request('/api/auth/otp/verify', { method: 'POST', body: { challengeId: started.data.challengeId, otp: sent.code } });
    assert.equal(locked.response.status, 401, 'five failed verifications must consume the challenge');

    api.ctx.otpRateLimits.clear();
    const expiring = await api.request('/api/auth/otp/request', { method: 'POST', body: { phone: '09121234567' } });
    await flushSmsQueue();
    const expiringMessage = api.ctx.sentMessages.at(-1);
    api.ctx.otpChallenges.get(expiring.data.challengeId).expiresAt = Date.now() - 1;
    const expired = await api.request('/api/auth/otp/verify', { method: 'POST', body: { challengeId: expiring.data.challengeId, otp: expiringMessage.code } });
    assert.equal(expired.response.status, 401);

    await api.store.transact((state) => {
      state.users.push({ id: 'usr-duplicate-phone', username: 'duplicate', name: 'تکراری', role: 'teacher', status: 'فعال', phone: '‎+۹۸۹۱۲۱۱۱۲۲۳۳', passwordHash: 'invalid' });
    });
    api.ctx.otpRateLimits.clear();
    const sentCount = api.ctx.sentMessages.length;
    const ambiguous = await api.request('/api/auth/otp/request', { method: 'POST', body: { phone: '09121112233' } });
    await flushSmsQueue();
    assert.equal(ambiguous.response.status, 200);
    assert.equal(api.ctx.sentMessages.length, sentCount, 'ambiguous normalized numbers must never receive an OTP');
  } finally { await api.close(); }
});

test('تنظیم ورود پیامکی نیازمند پیکربندی کامل و شمارهٔ یکتاست و شمارهٔ تکراری برای حساب جدید رد می‌شود', async () => {
  const api = await makeApiContext({ sms: {} });
  try {
    const admin = await api.login();
    const incomplete = await api.request('/api/settings', { method: 'PATCH', cookie: admin, body: { loginMode: 'phone' } });
    assert.equal(incomplete.response.status, 400);
    assert.equal((await api.store.read()).settings.loginMode, 'password');

    const configured = await api.request('/api/settings', {
      method: 'PATCH', cookie: admin,
      body: {
        loginMode: 'both', smsApiKey: SMS_CONFIG.apiKey,
        smsFromNumber: '+۹۸۳۰۰۰۵۰۵', smsPatternCode: SMS_CONFIG.patternCode, smsOtpParam: 'verification_code'
      }
    });
    assert.equal(configured.response.status, 200, configured.data.error || 'IPPanel settings should save');
    assert.equal(configured.data.sms.configured, true);
    assert.equal(api.ctx.config.sms.fromNumber, '+983000505');
    assert.equal(api.ctx.config.sms.otpParam, 'verification_code');
    assert.equal(JSON.stringify(configured.data).includes(SMS_CONFIG.apiKey), false);
    assert.equal(api.ctx.savedConfig.at(-1).sms.apiKey, SMS_CONFIG.apiKey);

    const originalPattern = api.ctx.config.sms.patternCode;
    const savedConfigCount = api.ctx.savedConfig.length;
    const invalidTimezone = await api.request('/api/settings', {
      method: 'PATCH', cookie: admin,
      body: { timezone: 'NoSuch/Timezone', loginMode: 'both', smsPatternCode: 'must-not-persist' }
    });
    assert.equal(invalidTimezone.response.status, 400);
    assert.equal(api.ctx.savedConfig.length, savedConfigCount, 'invalid settings must not persist SMS credentials first');
    assert.equal(api.ctx.config.sms.patternCode, originalPattern);
    assert.equal((await api.store.read()).settings.timezone, 'Asia/Tehran');

    const duplicateUser = await api.request('/api/records/users', {
      method: 'POST', cookie: admin,
      body: {
        name: 'حساب تکراری', username: 'teacher-duplicate', role: 'teacher', status: 'فعال',
        phone: '‎+۹۸۹۱۲۱۱۱۲۲۳۳', teacherId: 'tch-02', password: 'StrongPassword123'
      }
    });
    assert.equal(duplicateUser.response.status, 409);

    const phoneOnly = await api.request('/api/settings', { method: 'PATCH', cookie: admin, body: { loginMode: 'phone' } });
    assert.equal(phoneOnly.response.status, 200, phoneOnly.data.error || 'phone-only mode requires a unique admin mobile');
    const savedSms = api.ctx.config.sms;
    api.ctx.config.sms = {};
    const schoolSettings = await api.request('/api/settings', { method: 'PATCH', cookie: admin, body: { schoolName: 'مدرسهٔ به‌روزشده' } });
    assert.equal(schoolSettings.response.status, 200, 'unrelated school settings stay editable if SMS credentials need attention');
    api.ctx.config.sms = savedSms;
    const removeAdminPhone = await api.request('/api/records/users/usr-demo-admin', {
      method: 'PATCH', cookie: admin, body: { phone: '' }
    });
    assert.equal(removeAdminPhone.response.status, 409, 'phone-only login must retain an active administrator with a unique phone');
    const cannotClear = await api.request('/api/settings', {
      method: 'PATCH', cookie: admin,
      body: { loginMode: 'password', clearSmsCredentials: true }
    });
    assert.equal(cannotClear.response.status, 200, 'switching back to password permits clearing SMS settings');
  } finally { await api.close(); }
});

test('شمارهٔ مدیر در ویزارد نصب اجباری، نرمال‌شده و روی حساب مدیر ذخیره می‌شود', async () => {
  const api = await makeApiContext({ installed: false });
  try {
    const payload = {
      schoolName: 'مدرسهٔ آزمون', adminName: 'مدیر آزمون', username: 'schooladmin',
      password: 'StrongPassword123', database: { driver: 'json' }, preserveDemo: false
    };
    const missingPhone = await api.request('/api/install', { method: 'POST', body: payload });
    assert.equal(missingPhone.response.status, 400);
    assert.equal((await api.store.read()).settings.installed, false);

    const installed = await api.request('/api/install', {
      method: 'POST', body: { ...payload, adminPhone: '۰۹۱۲۱۲۳۴۵۶۷' }
    });
    assert.equal(installed.response.status, 200, installed.data.error || 'installation should succeed');
    const state = await api.store.read();
    const administrator = state.users.find((account) => account.username === 'schooladmin');
    assert.equal(administrator.phone, '+989121234567');
  } finally { await api.close(); }
});

test('نرمال‌سازی شماره، ارقام عربی را می‌پذیرد و متن/علامت جابه‌جاشده را رد می‌کند', () => {
  assert.equal(normalizePhoneNumber('٠٩١٢١٢٣٤٥٦٧'), '+989121234567');
  assert.equal(normalizePhoneNumber('0912abc1234567'), '');
  assert.equal(normalizePhoneNumber('0912+1234567'), '');
});

test('نصب مستقیم از API در حالت نمایشی نیز غیرفعال است', async () => {
  const api = await makeApiContext({ demoMode: true, installed: false });
  try {
    const result = await api.request('/api/install', { method: 'POST', body: {} });
    assert.equal(result.response.status, 409);
    assert.equal((await api.store.read()).settings.installed, false);
  } finally { await api.close(); }
});

test('شکست ارسال IPPanel اطلاعات محرمانه را افشا نمی‌کند و چالش بی‌ارسال قابل مصرف نیست', async () => {
  const api = await makeApiContext();
  try {
    const admin = await api.login();
    await enableLoginMode(api, admin, 'both');
    api.ctx.sendSmsOtp = async () => { throw new Error(`provider failure: ${SMS_CONFIG.apiKey}`); };
    const started = await api.request('/api/auth/otp/request', { method: 'POST', body: { phone: '09121112233' } });
    await flushSmsQueue();
    assert.equal(started.response.status, 200);
    assert.equal(JSON.stringify(started.data).includes(SMS_CONFIG.apiKey), false);
    assert.equal(api.ctx.otpChallenges.has(started.data.challengeId), false);
    const verify = await api.request('/api/auth/otp/verify', {
      method: 'POST', body: { challengeId: started.data.challengeId, otp: '123456' }
    });
    assert.equal(verify.response.status, 401);
    assert.equal(JSON.stringify(verify.data).includes(SMS_CONFIG.apiKey), false);
  } finally { await api.close(); }
});

test('IPPanel Edge pattern request uses the documented endpoint, raw API key, and one E.164 recipient', async () => {
  const originalFetch = global.fetch;
  let captured;
  global.fetch = async (url, options) => {
    captured = { url, options };
    return { ok: true, json: async () => ({ meta: { status: true } }) };
  };
  try {
    await sendIppanelOtp({
      config: { ...SMS_CONFIG, otpParam: 'verification_code' },
      phone: '+989121234567', code: '472019'
    });
    assert.equal(captured.url, 'https://edge.ippanel.com/v1/api/send');
    assert.equal(captured.options.method, 'POST');
    assert.equal(captured.options.headers.Authorization, SMS_CONFIG.apiKey);
    assert.deepEqual(JSON.parse(captured.options.body), {
      sending_type: 'pattern',
      from_number: SMS_CONFIG.fromNumber,
      code: SMS_CONFIG.patternCode,
      recipients: ['+989121234567'],
      params: { verification_code: '472019' }
    });
  } finally { global.fetch = originalFetch; }
});
