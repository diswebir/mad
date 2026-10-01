'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { serveStatic } = require('../server');

async function makeStaticServer({ installed = false, demoMode = false } = {}) {
  const ctx = {
    demoMode,
    store: { read: async () => ({ settings: { installed } }) }
  };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (await serveStatic(req, res, url, ctx)) return;
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('not found');
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    server,
    get: (route) => fetch(`http://127.0.0.1:${server.address().port}${route}`),
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

test('ویزارد نصب فقط پیش از نصب قابل دریافت است و همهٔ مسیرهای مستقیم پس از نصب 404 می‌دهند', async () => {
  const fresh = await makeStaticServer();
  try {
    const page = await fresh.get('/install');
    assert.equal(page.status, 200);
    assert.match(await page.text(), /ویزارد نصب/);
  } finally { await fresh.close(); }

  const installed = await makeStaticServer({ installed: true });
  try {
    for (const route of ['/install', '/install/', '/install.html', '/install.css', '/install.js', '/%69nstall.html']) {
      const response = await installed.get(route);
      assert.equal(response.status, 404, `${route} must be blocked after installation`);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
    assert.equal((await installed.get('/')).status, 200, 'the regular application remains accessible');
    assert.equal((await installed.get('/data/config.json')).status, 404, 'private server configuration is never static');
  } finally { await installed.close(); }

  const demo = await makeStaticServer({ demoMode: true });
  try { assert.equal((await demo.get('/install')).status, 404); }
  finally { await demo.close(); }
});

test('صفحه ورود و پنل لینک راهنما یا نصب ندارند', async () => {
  const server = await makeStaticServer({ installed: true });
  try {
    const response = await server.get('/');
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.doesNotMatch(html, /href=["']\/install/);
    assert.doesNotMatch(html, /topbar-help|sidebar-help|راهنما و نصب/);
    assert.match(html, /id="phone-login-form"/);
  } finally { await server.close(); }
});
