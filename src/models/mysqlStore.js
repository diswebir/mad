'use strict';

const { randomId } = require('../lib/security');
const { clone } = require('./store');

const META_TABLE = 'mad_school_meta';
const RECORDS_TABLE = 'mad_school_records';

function decodeJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return fallback; }
  }
  return value;
}

function mapsFor(records) {
  const result = new Map();
  for (const [collection, entries] of Object.entries(records || {})) {
    result.set(collection, new Map((Array.isArray(entries) ? entries : []).map((entry) => [String(entry.id), entry])));
  }
  return result;
}

async function openMysqlStore(config, initialState) {
  let mysql;
  try {
    mysql = require('mysql2/promise');
  } catch {
    throw new Error('درایور mysql2 نصب نشده است؛ در ریشه برنامه دستور npm install را اجرا کنید.');
  }
  const pool = mysql.createPool({
    host: config.host,
    port: Number(config.port || 3306),
    database: config.database,
    user: config.user,
    password: config.password || '',
    waitForConnections: true,
    connectionLimit: Number(config.connectionLimit || 5),
    queueLimit: 0,
    charset: 'utf8mb4',
    connectTimeout: 10000,
    decimalNumbers: true
  });

  await pool.execute(`CREATE TABLE IF NOT EXISTS ${META_TABLE} (
    id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
    settings JSON NOT NULL,
    modules JSON NOT NULL,
    users JSON NOT NULL,
    roles JSON NOT NULL,
    audit_logs JSON NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS ${RECORDS_TABLE} (
    collection VARCHAR(48) NOT NULL,
    record_id VARCHAR(96) NOT NULL,
    payload JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (collection, record_id),
    KEY idx_mad_collection (collection)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  const [metaRows] = await pool.execute(`SELECT settings, modules, users, roles, audit_logs FROM ${META_TABLE} WHERE id = 1`);
  let state;
  if (metaRows.length === 0) {
    state = clone(initialState);
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `INSERT INTO ${META_TABLE} (id, settings, modules, users, roles, audit_logs) VALUES (1, ?, ?, ?, ?, ?)`,
        [JSON.stringify(state.settings), JSON.stringify(state.modules), JSON.stringify(state.users), JSON.stringify(state.roles), JSON.stringify(state.auditLogs)]
      );
      for (const [collection, entries] of Object.entries(state.records || {})) {
        for (const entry of entries) {
          await connection.execute(
            `INSERT INTO ${RECORDS_TABLE} (collection, record_id, payload) VALUES (?, ?, ?)`,
            [collection, String(entry.id), JSON.stringify(entry)]
          );
        }
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      await pool.end();
      throw error;
    } finally {
      connection.release();
    }
  } else {
    const row = metaRows[0];
    const [recordRows] = await pool.execute(`SELECT collection, record_id, payload FROM ${RECORDS_TABLE} ORDER BY collection, record_id`);
    const records = {};
    for (const record of recordRows) {
      if (!records[record.collection]) records[record.collection] = [];
      records[record.collection].push(decodeJson(record.payload, {}));
    }
    state = {
      settings: decodeJson(row.settings, {}),
      modules: decodeJson(row.modules, []),
      users: decodeJson(row.users, []),
      roles: decodeJson(row.roles, []),
      auditLogs: decodeJson(row.audit_logs, []),
      records
    };
  }

  class MysqlStore {
    constructor(currentState) {
      this.state = currentState;
      this.pool = pool;
      this.queue = Promise.resolve();
      this.kind = 'mysql';
    }

    async read() { return clone(this.state); }

    async healthCheck() {
      await this.pool.execute('SELECT 1');
      return true;
    }

    transact(mutator) {
      const operation = this.queue.then(async () => {
        const before = clone(this.state);
        const after = clone(this.state);
        const result = await mutator(after);
        const connection = await this.pool.getConnection();
        try {
          await connection.beginTransaction();
          const metaFields = ['settings', 'modules', 'users', 'roles', 'auditLogs'];
          const metaChanged = metaFields.some((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
          if (metaChanged) {
            await connection.execute(
              `UPDATE ${META_TABLE} SET settings = ?, modules = ?, users = ?, roles = ?, audit_logs = ? WHERE id = 1`,
              [JSON.stringify(after.settings), JSON.stringify(after.modules), JSON.stringify(after.users), JSON.stringify(after.roles), JSON.stringify(after.auditLogs)]
            );
          }
          const oldCollections = mapsFor(before.records);
          const newCollections = mapsFor(after.records);
          const collectionNames = new Set([...oldCollections.keys(), ...newCollections.keys()]);
          for (const collection of collectionNames) {
            const oldMap = oldCollections.get(collection) || new Map();
            const newMap = newCollections.get(collection) || new Map();
            const removed = [...oldMap.keys()].filter((id) => !newMap.has(id));
            if (removed.length) {
              const placeholders = removed.map(() => '?').join(',');
              await connection.execute(`DELETE FROM ${RECORDS_TABLE} WHERE collection = ? AND record_id IN (${placeholders})`, [collection, ...removed]);
            }
            for (const [id, record] of newMap) {
              if (JSON.stringify(oldMap.get(id)) === JSON.stringify(record)) continue;
              await connection.execute(
                `INSERT INTO ${RECORDS_TABLE} (collection, record_id, payload) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE payload = VALUES(payload)`,
                [collection, id, JSON.stringify(record)]
              );
            }
          }
          await connection.commit();
          this.state = after;
          return clone(result);
        } catch (error) {
          await connection.rollback();
          throw error;
        } finally {
          connection.release();
        }
      });
      this.queue = operation.catch(() => undefined);
      return operation;
    }

    async close() { await this.pool.end(); }
  }

  return new MysqlStore(state);
}

module.exports = { openMysqlStore };
