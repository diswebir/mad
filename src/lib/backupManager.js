'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { clone } = require('../models/store');
const { randomId } = require('./security');

const BACKUP_FORMAT = 'madresehyar-backup';
const BACKUP_VERSION = 1;
const FILENAME_PATTERN = /^madresehyar-backup-\d{13}-[a-z0-9-]+\.json$/;
const REQUIRED_COLLECTIONS = [
  'students', 'teachers', 'classes', 'parents', 'attendance', 'subjects', 'timetable',
  'assignments', 'exams', 'grades', 'tickets', 'notices', 'events', 'messages',
  'finance', 'library', 'transport', 'documents'
];
const BUILTIN_ROLES = new Set(['admin', 'teacher', 'student', 'parent']);
const CUSTOM_ROLE_ID = /^custom-[a-f0-9]{12}$/i;

function validateBackup(envelope) {
  if (!envelope || typeof envelope !== 'object' || envelope.format !== BACKUP_FORMAT || envelope.formatVersion !== BACKUP_VERSION) {
    throw Object.assign(new Error('قالب یا نسخهٔ فایل پشتیبان پشتیبانی نمی‌شود.'), { statusCode: 400 });
  }
  const state = envelope.state;
  if (!state || typeof state !== 'object' || !state.settings || typeof state.settings !== 'object' || !state.records || typeof state.records !== 'object') {
    throw Object.assign(new Error('ساختار دادهٔ پشتیبان معتبر نیست.'), { statusCode: 400 });
  }
  if (!Array.isArray(state.users) || !Array.isArray(state.modules) || !Array.isArray(state.roles) || !Array.isArray(state.auditLogs)) {
    throw Object.assign(new Error('ساختار حساب‌ها، ماژول‌ها، نقش‌ها یا گزارش فعالیت معتبر نیست.'), { statusCode: 400 });
  }
  const roleIds = new Set();
  for (const role of state.roles) {
    if (!role || typeof role !== 'object' || typeof role.id !== 'string' || typeof role.name !== 'string' || roleIds.has(role.id)) {
      throw Object.assign(new Error('یکی از نقش‌های فایل پشتیبان ناقص یا تکراری است.'), { statusCode: 400 });
    }
    roleIds.add(role.id);
    if (role.isCustom) {
      if (!CUSTOM_ROLE_ID.test(role.id) || !['school', 'classes'].includes(role.scope)) {
        throw Object.assign(new Error('شناسه یا محدودهٔ یک نقش سفارشی در فایل پشتیبان معتبر نیست.'), { statusCode: 400 });
      }
      for (const field of ['moduleIds', 'readResources', 'writeResources']) {
        if (!Array.isArray(role[field]) || role[field].some((item) => typeof item !== 'string')) {
          throw Object.assign(new Error(`مجوزهای ${field} برای نقش سفارشی معتبر نیست.`), { statusCode: 400 });
        }
      }
    } else if (!BUILTIN_ROLES.has(role.id) || role.id.startsWith('custom-')) {
      throw Object.assign(new Error('یک نقش ناشناخته یا رزروشده در فایل پشتیبان وجود دارد.'), { statusCode: 400 });
    }
  }
  for (const collection of REQUIRED_COLLECTIONS) {
    if (state.records[collection] === undefined) state.records[collection] = [];
    if (!Array.isArray(state.records[collection])) {
      throw Object.assign(new Error(`ساختار مجموعهٔ ${collection} در پشتیبان معتبر نیست.`), { statusCode: 400 });
    }
  }
  if (state.settings.installed) {
    const activeAdmins = state.users.filter((user) => user?.role === 'admin' && user.status !== 'غیرفعال' && typeof user.passwordHash === 'string');
    if (!activeAdmins.length) throw Object.assign(new Error('پشتیبان نصب‌شده باید دست‌کم یک مدیر فعال داشته باشد.'), { statusCode: 400 });
  }
  const usernames = new Set();
  for (const user of state.users) {
    if (!user || typeof user.id !== 'string' || typeof user.username !== 'string' || typeof user.passwordHash !== 'string' || typeof user.role !== 'string') {
      throw Object.assign(new Error('یکی از حساب‌های کاربری در فایل پشتیبان ناقص است.'), { statusCode: 400 });
    }
    if (!BUILTIN_ROLES.has(user.role) && !state.roles.some((role) => role.id === user.role && role.isCustom)) {
      throw Object.assign(new Error('نقش یکی از حساب‌های کاربری در فایل پشتیبان وجود ندارد.'), { statusCode: 400 });
    }
    const username = user.username.toLowerCase();
    if (usernames.has(username)) throw Object.assign(new Error('نام کاربری تکراری در فایل پشتیبان وجود دارد.'), { statusCode: 400 });
    usernames.add(username);
  }
  for (const [collection, rows] of Object.entries(state.records)) {
    if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== 'object' || typeof row.id !== 'string')) {
      throw Object.assign(new Error(`رکوردهای مجموعهٔ ${collection} معتبر نیستند.`), { statusCode: 400 });
    }
  }
  return clone(state);
}

class BackupManager {
  constructor({ directory, getStore, version = '1.3.0', keep = 14 }) {
    this.directory = path.resolve(directory);
    this.getStore = getStore;
    this.version = version;
    this.keep = Math.max(2, Number(keep) || 14);
    this.timer = null;
    this.queue = Promise.resolve();
  }

  async ensureDirectory() {
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    try { await fs.chmod(this.directory, 0o700); } catch { /* best effort on hosted filesystems */ }
  }

  async create(reason = 'manual') {
    const operation = this.queue.then(async () => {
      await this.ensureDirectory();
      const state = await this.getStore().read();
      const createdAt = new Date().toISOString();
      const envelope = {
        format: BACKUP_FORMAT,
        formatVersion: BACKUP_VERSION,
        productVersion: this.version,
        createdAt,
        reason: String(reason).slice(0, 40),
        state
      };
      const filename = `madresehyar-backup-${Date.now()}-${randomId('backup')}.json`;
      const target = path.join(this.directory, filename);
      const temporary = `${target}.${process.pid}.tmp`;
      await fs.writeFile(temporary, `${JSON.stringify(envelope, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
      try { await fs.chmod(temporary, 0o600); } catch { /* best effort */ }
      await fs.rename(temporary, target);
      await this.prune();
      return { filename, createdAt, reason: envelope.reason, bytes: Buffer.byteLength(JSON.stringify(envelope)) };
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }

  async list() {
    await this.ensureDirectory();
    const names = (await fs.readdir(this.directory)).filter((name) => FILENAME_PATTERN.test(name));
    const entries = await Promise.all(names.map(async (filename) => {
      try {
        const stat = await fs.stat(path.join(this.directory, filename));
        const content = JSON.parse(await fs.readFile(path.join(this.directory, filename), 'utf8'));
        return { filename, createdAt: content.createdAt || stat.mtime.toISOString(), reason: content.reason || 'unknown', bytes: stat.size };
      } catch { return null; }
    }));
    return entries.filter(Boolean).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async read(filename) {
    if (!FILENAME_PATTERN.test(String(filename))) throw Object.assign(new Error('شناسهٔ فایل پشتیبان معتبر نیست.'), { statusCode: 400 });
    try {
      const file = await fs.readFile(path.join(this.directory, filename), 'utf8');
      return JSON.parse(file);
    } catch (error) {
      if (error.code === 'ENOENT') throw Object.assign(new Error('فایل پشتیبان پیدا نشد.'), { statusCode: 404 });
      throw Object.assign(new Error('خواندن فایل پشتیبان ممکن نشد.'), { statusCode: 400 });
    }
  }

  async restore(envelope) {
    const restored = validateBackup(envelope);
    const safetyBackup = await this.create('before-restore');
    await this.getStore().transact((draft) => {
      for (const key of Object.keys(draft)) delete draft[key];
      Object.assign(draft, clone(restored));
    });
    return safetyBackup;
  }

  async prune() {
    const backups = await this.list();
    for (const entry of backups.slice(this.keep)) {
      await fs.unlink(path.join(this.directory, entry.filename)).catch(() => undefined);
    }
  }

  start(intervalMs = 24 * 60 * 60 * 1000) {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.create('scheduled').catch((error) => console.error('[backup] تهیهٔ پشتیبان خودکار ناموفق بود:', error.message));
    }, intervalMs);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

module.exports = { BackupManager, validateBackup, BACKUP_FORMAT, BACKUP_VERSION };
