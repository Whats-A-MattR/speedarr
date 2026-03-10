import Database from 'better-sqlite3';
import { env } from './env.js';
import { mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join as joinPath } from 'node:path';
import { createRequire } from 'node:module';

let db: Database.Database | null = null;
const require = createRequire(import.meta.url);
let gluetunServiceIdColumnPresent: boolean | null = null;

function ensureDir(path: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function getDb(): Database.Database {
  if (db) return db;
  ensureDir(env.DB_PATH);
  db = new Database(env.DB_PATH);
  db.pragma('journal_mode = WAL');
  initSchema(db);
  return db;
}

function initSchema(database: Database.Database): void {
  runMigrations(database);
  ensureGluetunStatusServiceIdColumn(database);
}

function ensureGluetunStatusServiceIdColumn(database: Database.Database): void {
  try {
    const tableExists = database
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'gluetun_status'`)
      .get() as { name: string } | undefined;
    if (!tableExists) {
      gluetunServiceIdColumnPresent = false;
      return;
    }

    const cols = database.prepare(`PRAGMA table_info(gluetun_status)`).all() as { name: string }[];
    const hasServiceId = cols.some((c) => c.name === 'service_id');
    if (!hasServiceId) {
      database.exec(`
        ALTER TABLE gluetun_status ADD COLUMN service_id TEXT;
        CREATE INDEX IF NOT EXISTS idx_gluetun_status_service_timestamp
          ON gluetun_status(service_id, timestamp DESC);
      `);
      gluetunServiceIdColumnPresent = true;
      return;
    }
    gluetunServiceIdColumnPresent = true;
  } catch {
    gluetunServiceIdColumnPresent = false;
  }
}

function hasGluetunServiceIdColumn(): boolean {
  if (gluetunServiceIdColumnPresent !== null) return gluetunServiceIdColumnPresent;
  const database = getDb();
  try {
    const cols = database.prepare(`PRAGMA table_info(gluetun_status)`).all() as { name: string }[];
    gluetunServiceIdColumnPresent = cols.some((c) => c.name === 'service_id');
  } catch {
    gluetunServiceIdColumnPresent = false;
  }
  return gluetunServiceIdColumnPresent;
}

type MigrationModule = {
  up: (db: Database.Database) => void | Promise<void>;
  down?: (db: Database.Database) => void | Promise<void>;
};

function runMigrations(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  const appliedRows = database.prepare('SELECT id FROM migrations').all() as { id: string }[];
  const applied = new Set(appliedRows.map((r) => r.id));

  const migrationsDir = joinPath(process.cwd(), 'migrations');
  if (!existsSync(migrationsDir)) {
    return;
  }

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.js') || f.endsWith('.cjs'))
    .sort();

  for (const file of files) {
    const id = file.replace(/\.(cjs|js)$/, '');
    if (applied.has(id)) continue;

    const mod = require(joinPath(migrationsDir, file)) as MigrationModule;

    database.exec('BEGIN');
    try {
      const maybePromise = mod.up(database);
      if (maybePromise && typeof (maybePromise as Promise<void>).then === 'function') {
        // Synchronously wait is not possible; migrations should be sync.
        throw new Error(`Migration "${id}" returned a Promise; migrations must be synchronous.`);
      }
      database.prepare('INSERT INTO migrations (id, applied_at) VALUES (?, ?)').run(id, Date.now());
      database.exec('COMMIT');
    } catch (e) {
      database.exec('ROLLBACK');
      // Best-effort rollback for partially applied migration.
      if (mod.down) {
        try {
          mod.down(database);
        } catch {
          // ignore rollback errors
        }
      }
      throw e;
    }
  }
}

export interface SpeedResultRow {
  id: number;
  timestamp: number;
  download_mbps: number;
  upload_mbps: number;
  latency_ms: number | null;
  server_id: string | null;
  server_name: string | null;
  raw_json: string | null;
  agent_id: string | null;
  agent_name: string | null;
  external_ip: string | null;
}

export interface AgentRow {
  agent_id: string;
  agent_name: string;
}

export interface NodeRow {
  id: string;
  name: string;
  base_url: string;
  api_key: string;
  blocked: number;
  created_at: number;
  updated_at: number;
  last_seen_at: number | null;
  last_external_ip: string | null;
}

export function getNodes(): NodeRow[] {
  return getDb()
    .prepare(
      `SELECT id, name, base_url, api_key, blocked, created_at, updated_at, last_seen_at, last_external_ip FROM nodes ORDER BY name, id`
    )
    .all() as NodeRow[];
}

export function getNodeById(id: string): NodeRow | null {
  const row = getDb()
    .prepare(
      `SELECT id, name, base_url, api_key, blocked, created_at, updated_at, last_seen_at, last_external_ip FROM nodes WHERE id = ?`
    )
    .get(id);
  return (row as NodeRow | undefined) ?? null;
}

export function createNode(row: {
  id: string;
  name: string;
  base_url: string;
  api_key: string;
}): void {
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO nodes (id, name, base_url, api_key, blocked, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)`
    )
    .run(row.id, row.name, row.base_url.trim().replace(/\/$/, ''), row.api_key, now, now);
}

export function updateNode(
  id: string,
  updates: { name?: string; base_url?: string; api_key?: string; blocked?: boolean }
): void {
  const now = Date.now();
  const node = getNodeById(id);
  if (!node) return;
  const name = updates.name !== undefined ? updates.name : node.name;
  const base_url =
    updates.base_url !== undefined ? updates.base_url.trim().replace(/\/$/, '') : node.base_url;
  const api_key = updates.api_key !== undefined ? updates.api_key : node.api_key;
  const blocked = updates.blocked !== undefined ? (updates.blocked ? 1 : 0) : node.blocked;
  getDb()
    .prepare(
      `UPDATE nodes SET name = ?, base_url = ?, api_key = ?, blocked = ?, updated_at = ? WHERE id = ?`
    )
    .run(name, base_url, api_key, blocked, now, id);
}

export function deleteNode(id: string): void {
  getDb().prepare('DELETE FROM nodes WHERE id = ?').run(id);
}

export function updateNodeLastSeen(id: string, last_external_ip: string | null): void {
  getDb()
    .prepare(`UPDATE nodes SET last_seen_at = ?, last_external_ip = ?, updated_at = ? WHERE id = ?`)
    .run(Date.now(), last_external_ip, Date.now(), id);
}

export function insertSpeedResult(row: {
  timestamp: number;
  download_mbps: number;
  upload_mbps: number;
  latency_ms?: number | null;
  server_id?: string | null;
  server_name?: string | null;
  raw_json?: string | null;
  agent_id?: string | null;
  agent_name?: string | null;
  external_ip?: string | null;
}): void {
  const d = getDb();
  d.prepare(`
    INSERT INTO speed_results (timestamp, download_mbps, upload_mbps, latency_ms, server_id, server_name, raw_json, agent_id, agent_name, external_ip)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.timestamp,
    row.download_mbps,
    row.upload_mbps,
    row.latency_ms ?? null,
    row.server_id ?? null,
    row.server_name ?? null,
    row.raw_json ?? null,
    row.agent_id ?? 'local',
    row.agent_name ?? 'Local',
    row.external_ip ?? null
  );
}

export function getAgents(): AgentRow[] {
  return getDb().prepare(`
    SELECT DISTINCT agent_id AS agent_id, COALESCE(agent_name, agent_id) AS agent_name
    FROM speed_results
    ORDER BY agent_name, agent_id
  `).all() as AgentRow[];
}

export function getLatestResult(agentId?: string | null): SpeedResultRow | null {
  const d = getDb();
  const row = agentId
    ? d.prepare(`
        SELECT id, timestamp, download_mbps, upload_mbps, latency_ms, server_id, server_name, raw_json, agent_id, agent_name, external_ip
        FROM speed_results WHERE agent_id = ? ORDER BY timestamp DESC LIMIT 1
      `).get(agentId)
    : d.prepare(`
        SELECT id, timestamp, download_mbps, upload_mbps, latency_ms, server_id, server_name, raw_json, agent_id, agent_name, external_ip
        FROM speed_results ORDER BY timestamp DESC LIMIT 1
      `).get();
  return (row as SpeedResultRow | undefined) ?? null;
}

export function getResults(limit = 100, sinceTimestamp?: number, agentId?: string | null): SpeedResultRow[] {
  const d = getDb();
  const cols = 'id, timestamp, download_mbps, upload_mbps, latency_ms, server_id, server_name, raw_json, agent_id, agent_name, external_ip';
  if (agentId) {
    if (sinceTimestamp != null) {
      return d.prepare(`
        SELECT ${cols} FROM speed_results WHERE agent_id = ? AND timestamp >= ? ORDER BY timestamp DESC LIMIT ?
      `).all(agentId, sinceTimestamp, limit) as SpeedResultRow[];
    }
    return d.prepare(`
      SELECT ${cols} FROM speed_results WHERE agent_id = ? ORDER BY timestamp DESC LIMIT ?
    `).all(agentId, limit) as SpeedResultRow[];
  }
  if (sinceTimestamp != null) {
    return d.prepare(`
      SELECT ${cols} FROM speed_results WHERE timestamp >= ? ORDER BY timestamp DESC LIMIT ?
    `).all(sinceTimestamp, limit) as SpeedResultRow[];
  }
  return d.prepare(`
    SELECT ${cols} FROM speed_results ORDER BY timestamp DESC LIMIT ?
  `).all(limit) as SpeedResultRow[];
}

export interface GluetunStatusRow {
  id: number;
  service_id: string | null;
  timestamp: number;
  public_ip: string | null;
  vpn_status: string;
  city: string | null;
  region: string | null;
  country: string | null;
  raw_publicip: string | null;
  raw_openvpn_status: string | null;
}

export function insertGluetunStatus(row: {
  service_id?: string | null;
  timestamp: number;
  public_ip: string | null;
  vpn_status: string;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  raw_publicip?: string | null;
  raw_openvpn_status?: string | null;
}): void {
  if (hasGluetunServiceIdColumn()) {
    getDb()
      .prepare(
        `INSERT INTO gluetun_status (service_id, timestamp, public_ip, vpn_status, city, region, country, raw_publicip, raw_openvpn_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        row.service_id ?? null,
        row.timestamp,
        row.public_ip ?? null,
        row.vpn_status,
        row.city ?? null,
        row.region ?? null,
        row.country ?? null,
        row.raw_publicip ?? null,
        row.raw_openvpn_status ?? null
      );
    return;
  }

  getDb()
    .prepare(
      `INSERT INTO gluetun_status (timestamp, public_ip, vpn_status, city, region, country, raw_publicip, raw_openvpn_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      row.timestamp,
      row.public_ip ?? null,
      row.vpn_status,
      row.city ?? null,
      row.region ?? null,
      row.country ?? null,
      row.raw_publicip ?? null,
      row.raw_openvpn_status ?? null
    );
}

export function getLatestGluetunStatus(serviceId?: string | null): GluetunStatusRow | null {
  if (!hasGluetunServiceIdColumn()) {
    const row = getDb()
      .prepare(
        `SELECT id, NULL AS service_id, timestamp, public_ip, vpn_status, city, region, country, raw_publicip, raw_openvpn_status
         FROM gluetun_status ORDER BY timestamp DESC LIMIT 1`
      )
      .get();
    return (row as GluetunStatusRow | undefined) ?? null;
  }

  const row = serviceId
    ? getDb()
        .prepare(
          `SELECT id, service_id, timestamp, public_ip, vpn_status, city, region, country, raw_publicip, raw_openvpn_status
           FROM gluetun_status WHERE service_id = ? ORDER BY timestamp DESC LIMIT 1`
        )
        .get(serviceId)
    : getDb()
        .prepare(
          `SELECT id, service_id, timestamp, public_ip, vpn_status, city, region, country, raw_publicip, raw_openvpn_status
           FROM gluetun_status ORDER BY timestamp DESC LIMIT 1`
        )
        .get();
  return (row as GluetunStatusRow | undefined) ?? null;
}

export function getGluetunStatusHistory(limit: number, serviceId?: string | null): GluetunStatusRow[] {
  if (!hasGluetunServiceIdColumn()) {
    return getDb()
      .prepare(
        `SELECT id, NULL AS service_id, timestamp, public_ip, vpn_status, city, region, country, raw_publicip, raw_openvpn_status
         FROM gluetun_status ORDER BY timestamp DESC LIMIT ?`
      )
      .all(Math.max(1, Math.min(limit, 500))) as GluetunStatusRow[];
  }

  return (serviceId
    ? getDb()
        .prepare(
          `SELECT id, service_id, timestamp, public_ip, vpn_status, city, region, country, raw_publicip, raw_openvpn_status
           FROM gluetun_status WHERE service_id = ? ORDER BY timestamp DESC LIMIT ?`
        )
        .all(serviceId, Math.max(1, Math.min(limit, 500)))
    : getDb()
        .prepare(
          `SELECT id, service_id, timestamp, public_ip, vpn_status, city, region, country, raw_publicip, raw_openvpn_status
           FROM gluetun_status ORDER BY timestamp DESC LIMIT ?`
        )
        .all(Math.max(1, Math.min(limit, 500)))) as GluetunStatusRow[];
}

export function pruneOldResults(retentionDays: number): number {
  if (retentionDays <= 0) return 0;
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const result = getDb().prepare('DELETE FROM speed_results WHERE timestamp < ?').run(cutoff);
  return result.changes;
}
