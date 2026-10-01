'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { modules } = require('./modules');
const { hashPasswordSync } = require('../lib/security');

async function createInitialState(demoMode) {
  const seedPath = path.resolve(__dirname, '../../data/seed.json');
  const seed = JSON.parse(await fs.readFile(seedPath, 'utf8'));
  const state = {
    settings: seed.settings,
    modules: modules.map((item) => ({ ...item, enabled: true })),
    users: [],
    roles: seed.roles || [],
    auditLogs: seed.auditLogs || [],
    records: seed.records || {}
  };
  for (const collection of Object.keys(state.records)) {
    if (!Array.isArray(state.records[collection])) state.records[collection] = [];
  }
  if (demoMode) {
    state.users = [
      { id: 'usr-demo-admin', username: 'admin', name: 'مهسا رادمنش', role: 'admin', status: 'فعال', phone: '۰۹۱۲۱۱۱۲۲۳۳', passwordHash: hashPasswordSync('admin123'), createdAt: '2026-09-01T08:00:00.000Z', isDemo: true },
      { id: 'usr-demo-teacher', username: 'ahmadi', name: 'نرگس احمدی', role: 'teacher', teacherId: 'tch-01', status: 'فعال', phone: '۰۹۱۲۱۲۳۴۵۶۷', passwordHash: hashPasswordSync('teacher123'), createdAt: '2026-09-01T08:00:00.000Z', isDemo: true },
      { id: 'usr-demo-student', username: 'sara', name: 'سارا محمدی', role: 'student', studentId: 'std-1001', status: 'فعال', phone: '۰۹۱۲۵۵۵۱۲۳۴', passwordHash: hashPasswordSync('student123'), createdAt: '2026-09-01T08:00:00.000Z', isDemo: true },
      { id: 'usr-demo-parent', username: 'maryam', name: 'مریم محمدی', role: 'parent', studentId: 'std-1001', parentId: 'par-01', status: 'فعال', phone: '۰۹۱۲۵۵۵۰۰۱۱', passwordHash: hashPasswordSync('parent123'), createdAt: '2026-09-01T08:00:00.000Z', isDemo: true }
    ];
  }
  return state;
}

module.exports = { createInitialState };
