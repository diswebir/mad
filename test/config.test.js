'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

function runConfigScript(dataDir, script, extraEnv = {}) {
  const configModule = require.resolve('../src/config');
  const source = `const { loadConfig, saveConfig } = require(${JSON.stringify(configModule)});\n(async () => { ${script} })().catch((error) => { console.error(error); process.exitCode = 1; });`;
  return spawnSync(process.execPath, ['-e', source], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      IPPANEL_API_KEY: '', IPPANEL_FROM_NUMBER: '', IPPANEL_PATTERN_CODE: '', IPPANEL_OTP_PARAM: '',
      ...extraEnv
    }
  });
}

test('اعتبارنامه IPPanel در فایل خصوصی با مجوز 0600 ذخیره می‌شود، merge می‌شود و env اولویت دارد', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mad-config-'));
  try {
    const save = runConfigScript(dataDir, `
      await saveConfig({ database: { driver: 'json' }, sms: { apiKey: 'private-test-token-123', fromNumber: '+983000505', patternCode: 'pattern-v1', otpParam: 'code' } });
      await saveConfig({ sms: { patternCode: 'pattern-v2' } });
      const config = await loadConfig();
      if (config.sms.apiKey !== 'private-test-token-123' || config.sms.patternCode !== 'pattern-v2') throw new Error('saved SMS configuration was not preserved');
    `);
    assert.equal(save.status, 0, save.stderr || save.stdout);
    const file = path.join(dataDir, 'config.json');
    const mode = (await fs.stat(file)).mode & 0o777;
    assert.equal(mode, 0o600);
    const saved = JSON.parse(await fs.readFile(file, 'utf8'));
    assert.equal(saved.sms.apiKey, 'private-test-token-123');
    assert.equal(saved.sms.patternCode, 'pattern-v2');
    await fs.chmod(file, 0o644);
    const resecured = runConfigScript(dataDir, 'await loadConfig();');
    assert.equal(resecured.status, 0, resecured.stderr || resecured.stdout);
    assert.equal((await fs.stat(file)).mode & 0o777, 0o600, 'existing config files must be re-locked on startup');

    const envRead = runConfigScript(dataDir, `
      const config = await loadConfig();
      if (config.sms.apiKey !== 'environment-managed-test-token') throw new Error('environment override did not take precedence');
      if (!config.smsManagedFields.includes('apiKey')) throw new Error('environment-managed field was not marked read-only');
    `, { IPPANEL_API_KEY: 'environment-managed-test-token' });
    assert.equal(envRead.status, 0, envRead.stderr || envRead.stdout);
  } finally { await fs.rm(dataDir, { recursive: true, force: true }); }
});
