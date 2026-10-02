'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
const HASH_BYTES = 64;

function hashPasswordSync(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password), salt, HASH_BYTES).toString('hex');
  return `${salt}:${derived}`;
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = (await scrypt(String(password), salt, HASH_BYTES)).toString('hex');
  return `${salt}:${derived}`;
}

async function verifyPassword(password, stored) {
  if (typeof stored !== 'string' || !stored.includes(':')) return false;
  const [salt, expectedHex] = stored.split(':');
  if (!salt || !expectedHex || expectedHex.length !== HASH_BYTES * 2) return false;
  const actual = await scrypt(String(password), salt, HASH_BYTES);
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function randomId(prefix = 'rec') {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
}

function safeUser(user) {
  if (!user) return null;
  const { passwordHash, ...rest } = user;
  return rest;
}

module.exports = { hashPassword, hashPasswordSync, verifyPassword, randomId, safeUser };
