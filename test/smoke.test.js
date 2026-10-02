'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createInitialState } = require('../src/data/seed');
const { modules } = require('../src/data/modules');
const { hashPassword, verifyPassword } = require('../src/lib/security');
const { openJsonStore } = require('../src/models/store');

test('نسخه دمو با ماژول‌ها و داده‌های اولیه خالی نیست', async () => {
  const state = await createInitialState(false);
  assert.equal(modules.length, 25);
  assert.equal(state.modules.length, 25);
  assert.ok(state.records.students.length >= 5);
  assert.ok(state.records.teachers.length >= 3);
  assert.ok(state.records.classes.length >= 3);
  assert.ok(state.records.attendance.length > 0);
  assert.ok(state.records.tickets.length > 0);
  assert.ok(state.records.grades.length > 0);
});

test('گذرواژه‌ها با هش saltدار بررسی می‌شوند', async () => {
  const hash = await hashPassword('a-strong-password-123');
  assert.notEqual(hash, 'a-strong-password-123');
  assert.equal(await verifyPassword('a-strong-password-123', hash), true);
  assert.equal(await verifyPassword('wrong-password', hash), false);
});

test('ذخیره‌ساز JSON تراکنش را اتمیک ذخیره و پس از بازگشایی بازیابی می‌کند', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mad-school-'));
  const file = path.join(directory, 'state.json');
  try {
    const store = await openJsonStore(file, { settings: { schoolName: 'آزمون' }, modules: [], users: [], roles: [], auditLogs: [], records: { students: [] } });
    await Promise.all([
      store.transact((state) => { state.records.students.push({ id: 'one', name: 'یک' }); }),
      store.transact((state) => { state.records.students.push({ id: 'two', name: 'دو' }); })
    ]);
    await fs.chmod(file, 0o644);
    const reopened = await openJsonStore(file, {});
    const saved = await reopened.read();
    assert.equal((await fs.stat(file)).mode & 0o777, 0o600, 'existing state files must be re-locked on startup');
    assert.deepEqual(saved.records.students.map((row) => row.id).sort(), ['one', 'two']);
    await store.close();
    await reopened.close();
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
