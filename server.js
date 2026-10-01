'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { loadConfig, saveConfig, PUBLIC_DIR } = require('./src/config');
const { createInitialState } = require('./src/data/seed');
const { modules } = require('./src/data/modules');
const { openJsonStore } = require('./src/models/store');
const { openMysqlStore } = require('./src/models/mysqlStore');
const { handleApi } = require('./src/controllers/apiController');
const { hashPasswordSync } = require('./src/lib/security');
const { BackupManager } = require('./src/lib/backupManager');
const APP_VERSION = require('./package.json').version;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.webp': 'image/webp'
};
const demoMode = process.env.DEMO_MODE === '1';

function normalizeState(state) {
  state.settings ||= {};
  state.modules ||= modules.map((item) => ({ ...item, enabled: true }));
  state.users ||= [];
  state.roles ||= [];
  state.auditLogs ||= [];
  state.records ||= {};
  for (const item of modules) {
    if (!state.modules.some((feature) => feature.id === item.id)) state.modules.push({ ...item, enabled: true });
    else {
      const existing = state.modules.find((feature) => feature.id === item.id);
      Object.assign(existing, { title: item.title, description: item.description, icon: item.icon, group: item.group, roles: item.roles, locked: Boolean(item.locked) });
    }
  }
  return state;
}

function demoUsers() {
  return [
    { id: 'usr-demo-admin', username: 'admin', name: 'مهسا رادمنش', role: 'admin', status: 'فعال', phone: '۰۹۱۲۱۱۱۲۲۳۳', passwordHash: hashPasswordSync('admin123'), createdAt: '2026-09-01T08:00:00.000Z', isDemo: true },
    { id: 'usr-demo-teacher', username: 'ahmadi', name: 'نرگس احمدی', role: 'teacher', teacherId: 'tch-01', status: 'فعال', phone: '۰۹۱۲۱۲۳۴۵۶۷', passwordHash: hashPasswordSync('teacher123'), createdAt: '2026-09-01T08:00:00.000Z', isDemo: true },
    { id: 'usr-demo-student', username: 'sara', name: 'سارا محمدی', role: 'student', studentId: 'std-1001', status: 'فعال', phone: '۰۹۱۲۵۵۵۱۲۳۴', passwordHash: hashPasswordSync('student123'), createdAt: '2026-09-01T08:00:00.000Z', isDemo: true },
    { id: 'usr-demo-parent', username: 'maryam', name: 'مریم محمدی', role: 'parent', studentId: 'std-1001', parentId: 'par-01', status: 'فعال', phone: '۰۹۱۲۵۵۵۰۰۱۱', passwordHash: hashPasswordSync('parent123'), createdAt: '2026-09-01T08:00:00.000Z', isDemo: true }
  ];
}

async function ensureStartupState(store) {
  let state = normalizeState(await store.read());
  if (JSON.stringify(state) !== JSON.stringify(await store.read())) {
    await store.transact((draft) => Object.assign(draft, state));
  }
  if (demoMode && !state.settings.installed) {
    const missing = demoUsers().filter((account) => !state.users.some((user) => user.username === account.username));
    if (missing.length) {
      await store.transact((draft) => { draft.users.push(...missing); });
      state = await store.read();
    }
  }
  return state;
}

async function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  let pathname = url.pathname;
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/install' || pathname === '/install/') pathname = '/install.html';
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return false; }
  const target = path.resolve(PUBLIC_DIR, `.${decoded}`);
  if (!target.startsWith(`${PUBLIC_DIR}${path.sep}`)) return false;
  let stats;
  try { stats = await fs.stat(target); } catch { return false; }
  if (!stats.isFile()) return false;
  const contentType = MIME_TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': stats.size,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cache-Control': ['.html', '.css', '.js'].includes(path.extname(target).toLowerCase()) || process.env.NODE_ENV !== 'production' ? 'no-cache' : 'public, max-age=300'
  });
  if (req.method === 'HEAD') return res.end();
  const stream = require('node:fs').createReadStream(target);
  stream.on('error', () => { if (!res.headersSent) res.writeHead(500); res.end(); });
  stream.pipe(res);
  return true;
}

async function start() {
  const config = await loadConfig();
  let initialState = normalizeState(await createInitialState(demoMode));
  let store;
  if (config.database.driver === 'mysql') {
    store = await openMysqlStore(config.database, initialState);
  } else {
    store = await openJsonStore(config.statePath, initialState);
  }
  const startupState = await ensureStartupState(store);
  const activeDemoMode = demoMode && !startupState.settings.installed;

  const ctx = {
    store,
    appVersion: APP_VERSION,
    demoMode: activeDemoMode,
    sessions: new Map(),
    loginAttempts: new Map(),
    saveConfig
  };
  ctx.backups = new BackupManager({ directory: path.join(config.dataDir, 'backups'), getStore: () => ctx.store, version: APP_VERSION, keep: 14 });
  await ctx.backups.create('startup').catch((error) => console.error('[backup] تهیهٔ نسخهٔ اولیه ناموفق بود:', error.message));
  ctx.backups.start();
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    try {
      const handled = await handleApi(req, res, url, ctx);
      if (handled) return;
      if (await serveStatic(req, res, url)) return;
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
      res.end('صفحه موردنظر پیدا نشد.');
    } catch (error) {
      console.error('[server]', error);
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: 'خطای داخلی سامانه رخ داد.' }));
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 35_000;
  server.keepAliveTimeout = 5_000;

  const port = Number(process.env.PORT || 3000);
  server.listen(port, '0.0.0.0', () => {
    console.log(`مدرسه‌یار روی 0.0.0.0:${port} اجرا شد (${ctx.store.kind}${ctx.demoMode ? ' · demo' : ''})`);
    if (!ctx.demoMode && !startupState.settings.installed) console.log('برای پیکربندی اولیه، مسیر /install را باز کنید.');
  });

  const cleanup = () => {
    server.close(async () => {
      ctx.backups.stop();
      await ctx.store.close().catch(() => undefined);
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);
}

start().catch((error) => {
  console.error('راه‌اندازی سامانه انجام نشد:', error.message || error);
  process.exitCode = 1;
});
