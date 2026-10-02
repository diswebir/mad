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

test('health check عمومی فقط وضعیت ذخیره‌ساز را می‌دهد و خطای ذخیره‌ساز را پنهان نمی‌کند', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mad-health-'));
  const state = await createInitialState(false);
  const file = path.join(directory, 'state.json');
  const store = await openJsonStore(file, state);
  const ctx = { store, sessions: new Map(), demoMode: false };
  const server = http.createServer((req, res) => handleApi(req, res, new URL(req.url, `http://${req.headers.host}`), ctx));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const healthy = await fetch(`${base}/api/health`);
    assert.equal(healthy.status, 200);
    assert.deepEqual(await healthy.json(), { status: 'ok' });
    const wrongMethod = await fetch(`${base}/api/health`, { method: 'POST' });
    assert.equal(wrongMethod.status, 405);
    assert.equal(wrongMethod.headers.get('allow'), 'GET');

    await fs.writeFile(file, '{broken json');
    const degraded = await fetch(`${base}/api/health`);
    assert.equal(degraded.status, 503);
    assert.deepEqual(await degraded.json(), { status: 'unavailable' });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await store.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
