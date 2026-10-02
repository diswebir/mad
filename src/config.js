'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const STATE_PATH = path.join(DATA_DIR, 'state.json');
const PUBLIC_DIR = path.join(ROOT, 'public');

async function loadConfig() {
  let saved = {};
  try {
    saved = JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8'));
    try { await fs.chmod(CONFIG_PATH, 0o600); } catch { /* best effort on hosted filesystems */ }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const database = { driver: 'json', ...(saved.database || {}) };
  const envDriver = process.env.DB_DRIVER;
  if (envDriver) database.driver = envDriver.toLowerCase();
  if (process.env.DB_HOST) database.host = process.env.DB_HOST;
  if (process.env.DB_PORT) database.port = Number(process.env.DB_PORT);
  if (process.env.DB_NAME) database.database = process.env.DB_NAME;
  if (process.env.DB_USER) database.user = process.env.DB_USER;
  if (process.env.DB_PASSWORD) database.password = process.env.DB_PASSWORD;
  if (database.driver === 'mysql' && (!database.host || !database.database || !database.user)) {
    throw new Error('پیکربندی MySQL ناقص است؛ DB_HOST، DB_NAME و DB_USER را بررسی کنید.');
  }
  const sms = {
    apiKey: String(saved.sms?.apiKey || ''),
    fromNumber: String(saved.sms?.fromNumber || ''),
    patternCode: String(saved.sms?.patternCode || ''),
    otpParam: String(saved.sms?.otpParam || 'code')
  };
  const smsManagedFields = [];
  for (const [field, environmentVariable] of Object.entries({
    apiKey: 'IPPANEL_API_KEY',
    fromNumber: 'IPPANEL_FROM_NUMBER',
    patternCode: 'IPPANEL_PATTERN_CODE',
    otpParam: 'IPPANEL_OTP_PARAM'
  })) {
    if (!process.env[environmentVariable]) continue;
    sms[field] = process.env[environmentVariable].trim();
    smsManagedFields.push(field);
  }
  return { ...saved, database, sms, smsManagedFields, configPath: CONFIG_PATH, dataDir: DATA_DIR, statePath: STATE_PATH };
}

async function saveConfig(config) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  let saved = {};
  try { saved = JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const safeConfig = {
    database: config.database || saved.database || { driver: 'json' },
    sms: config.sms ? { ...(saved.sms || {}), ...config.sms } : saved.sms
  };
  if (!safeConfig.sms) delete safeConfig.sms;
  await fs.writeFile(CONFIG_PATH, `${JSON.stringify(safeConfig, null, 2)}\n`, { mode: 0o600 });
  try { await fs.chmod(CONFIG_PATH, 0o600); } catch { /* Some cPanel file systems ignore chmod. */ }
}

module.exports = { ROOT, DATA_DIR, CONFIG_PATH, STATE_PATH, PUBLIC_DIR, loadConfig, saveConfig };
