'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { randomId } = require('../lib/security');

const clone = (value) => structuredClone(value);

async function writeAtomically(filePath, state) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomId('tmp')}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  try { await fs.chmod(temporaryPath, 0o600); } catch { /* best effort */ }
  await fs.rename(temporaryPath, filePath);
}

class JsonStore {
  constructor(filePath, state) {
    this.filePath = filePath;
    this.state = state;
    this.queue = Promise.resolve();
    this.kind = 'json';
  }

  async read() {
    return clone(this.state);
  }

  transact(mutator) {
    const operation = this.queue.then(async () => {
      const draft = clone(this.state);
      const result = await mutator(draft);
      await writeAtomically(this.filePath, draft);
      this.state = draft;
      return clone(result);
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }

  async close() {}
}

async function openJsonStore(filePath, initialState) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  let state;
  try {
    state = JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error(`فایل داده‌ها قابل خواندن نیست: ${error.message}`);
    state = clone(initialState);
    await writeAtomically(filePath, state);
  }
  if (!state || typeof state !== 'object' || !state.records || !state.settings) {
    throw new Error('ساختار فایل داده‌ها معتبر نیست.');
  }
  return new JsonStore(filePath, state);
}

module.exports = { JsonStore, openJsonStore, clone, writeAtomically };
