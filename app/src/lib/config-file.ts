/**
 * Portal config stored in a single JSON file (config.json in DATA_DIR).
 * Portable and editable; all settings configured in the UI live here.
 * When running as a node with no config file, we create one with a generated API key.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { env } from './env.js';
import { log as logger } from './logger.js';

const CONFIG_FILENAME = 'config.json';

function getConfigPath(): string {
  return join(env.DATA_DIR, CONFIG_FILENAME);
}

/** When mode is node and no config file exists, create it with a generated API key. Exported so node startup can ensure config exists. */
export function ensureNodeConfigWithApiKey(): void {
  if (env.MODE !== 'node') return;
  const path = getConfigPath();
  if (existsSync(path)) return;
  const apiKey = randomBytes(32).toString('base64url');
  ensureDir(path);
  writeConfig({ SPEEDARR_API_KEY: apiKey });
  logger('[speedarr] No config found; created config at', path);
  logger('[speedarr] SPEEDARR_API_KEY=' + apiKey);
}

function ensureDir(path: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function readConfig(): Record<string, string> {
  const path = getConfigPath();
  if (!existsSync(path)) return {};
  try {
    const raw = readFileSync(path, 'utf-8');
    const data = JSON.parse(raw);
    if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(data)) {
        if (typeof k === 'string' && typeof v === 'string') out[k] = v;
      }
      return out;
    }
  } catch {
    // invalid or missing: return empty
  }
  return {};
}

function writeConfig(data: Record<string, string>): void {
  const path = getConfigPath();
  ensureDir(path);
  const tmp = `${path}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  try {
    renameSync(tmp, path);
  } catch {
    try {
      unlinkSync(tmp);
    } catch {
      // ignore
    }
    throw new Error('Failed to write config.json');
  }
}

// ---------------------------------------------------------------------------
// Service config (download clients stored as JSON array in SERVICES key)
// ---------------------------------------------------------------------------

export interface ServiceConfig {
  id: string;
  type: 'sabnzbd' | 'gluetun';
  name: string;
  connectionId: string;
  url: string;
  apiKey: string;
  enabled: boolean;
  killSwitchEnabled: boolean;
  vpnServiceId: string;
  speedtestLimitEnabled: boolean;
  speedtestLimitPercent: number; // 1–100
  scheduleEnabled: boolean;
  schedule: string; // JSON array of ScheduleRule[]
  scheduleDefaultLimit: number; // 0–100; 0 = unlimited
  pollIntervalMinutes: number; // used by gluetun services
}

export interface ConnectionConfig {
  id: string;
  name: string;
}

function parseServices(raw: string | undefined): ServiceConfig[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: ServiceConfig[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const service = item as Partial<ServiceConfig>;
      if (typeof service.id !== 'string') continue;
      if (service.type !== 'sabnzbd' && service.type !== 'gluetun') continue;
      out.push({
        id: service.id,
        type: service.type,
        name: typeof service.name === 'string' ? service.name : service.type === 'gluetun' ? 'Gluetun' : 'SABnzbd',
        connectionId: typeof service.connectionId === 'string' && service.connectionId.trim() ? service.connectionId.trim() : 'default',
        url: typeof service.url === 'string' ? service.url : '',
        apiKey: typeof service.apiKey === 'string' ? service.apiKey : '',
        enabled: typeof service.enabled === 'boolean' ? service.enabled : true,
        killSwitchEnabled: typeof service.killSwitchEnabled === 'boolean' ? service.killSwitchEnabled : false,
        vpnServiceId: typeof service.vpnServiceId === 'string' ? service.vpnServiceId : '',
        speedtestLimitEnabled: typeof service.speedtestLimitEnabled === 'boolean' ? service.speedtestLimitEnabled : false,
        speedtestLimitPercent: typeof service.speedtestLimitPercent === 'number' ? service.speedtestLimitPercent : 80,
        scheduleEnabled: typeof service.scheduleEnabled === 'boolean' ? service.scheduleEnabled : false,
        schedule: typeof service.schedule === 'string' ? service.schedule : '[]',
        scheduleDefaultLimit: typeof service.scheduleDefaultLimit === 'number' ? service.scheduleDefaultLimit : 0,
        pollIntervalMinutes: typeof service.pollIntervalMinutes === 'number' ? service.pollIntervalMinutes : 5,
      });
    }
    return out;
  } catch {
    return [];
  }
}

function parseConnections(raw: string | undefined): ConnectionConfig[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: ConnectionConfig[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const conn = item as Partial<ConnectionConfig>;
      if (typeof conn.id !== 'string' || !conn.id.trim()) continue;
      const id = conn.id.trim();
      const name = typeof conn.name === 'string' && conn.name.trim() ? conn.name.trim() : id;
      out.push({ id, name });
    }
    return out;
  } catch {
    return [];
  }
}

function migrateLegacyGluetunService(data: Record<string, string>): ServiceConfig[] {
  const services = parseServices(data['SERVICES']);
  const legacyUrl = (data['GLUETUN_ADDRESS'] ?? '').trim().replace(/\/$/, '');
  if (!legacyUrl) return services;

  const existing = services.find((service) => service.type === 'gluetun' && service.url === legacyUrl);
  if (existing) return services;

  services.push({
    id: randomBytes(8).toString('hex'),
    type: 'gluetun',
    name: 'Gluetun',
    connectionId: 'default',
    url: legacyUrl,
    apiKey: data['GLUETUN_API_KEY'] ?? '',
    enabled: true,
    killSwitchEnabled: false,
    vpnServiceId: '',
    speedtestLimitEnabled: false,
    speedtestLimitPercent: 80,
    scheduleEnabled: false,
    schedule: '[]',
    scheduleDefaultLimit: 0,
    pollIntervalMinutes: Math.max(1, parseInt(data['SPEEDARR_GLUETUN_INTERVAL_MINUTES'] ?? '5', 10) || 5),
  });
  data['SERVICES'] = JSON.stringify(services);
  data['GLUETUN_ADDRESS'] = '';
  data['GLUETUN_API_KEY'] = '';
  data['SPEEDARR_GLUETUN_INTERVAL_MINUTES'] = '';
  writeConfig(data);
  return services;
}

export function getServices(): ServiceConfig[] {
  const data = readConfig();
  return migrateLegacyGluetunService(data);
}

export function getConnections(): ConnectionConfig[] {
  const data = readConfig();
  const byId = new Map<string, ConnectionConfig>();
  for (const conn of parseConnections(data['CONNECTIONS'])) {
    byId.set(conn.id, conn);
  }
  if (!byId.has('default')) {
    byId.set('default', { id: 'default', name: 'Default' });
  }

  for (const service of parseServices(data['SERVICES'])) {
    const id = service.connectionId && service.connectionId.trim() ? service.connectionId.trim() : 'default';
    if (!byId.has(id)) {
      byId.set(id, { id, name: id });
    }
  }

  const out = [...byId.values()];
  out.sort((a, b) => {
    if (a.id === 'default') return -1;
    if (b.id === 'default') return 1;
    return a.name.localeCompare(b.name);
  });
  return out;
}

export function upsertConnection(connection: ConnectionConfig): void {
  const data = readConfig();
  const connections = parseConnections(data['CONNECTIONS']);
  const id = connection.id.trim();
  const name = connection.name.trim() || id;
  const idx = connections.findIndex((c) => c.id === id);
  if (idx >= 0) {
    connections[idx] = { id, name };
  } else {
    connections.push({ id, name });
  }
  data['CONNECTIONS'] = JSON.stringify(connections);
  writeConfig(data);
}

export function deleteConnectionAndReassignServices(connectionId: string): void {
  const id = connectionId.trim();
  if (!id || id === 'default') return;
  const data = readConfig();
  const connections = parseConnections(data['CONNECTIONS']).filter((c) => c.id !== id);
  const services = parseServices(data['SERVICES']).map((service) =>
    service.connectionId === id ? { ...service, connectionId: 'default' } : service
  );
  data['CONNECTIONS'] = JSON.stringify(connections);
  data['SERVICES'] = JSON.stringify(services);
  writeConfig(data);
}

export function upsertService(service: ServiceConfig): void {
  const data = readConfig();
  const services = parseServices(data['SERVICES']);
  const idx = services.findIndex((s) => s.id === service.id);
  if (idx >= 0) {
    services[idx] = service;
  } else {
    services.push(service);
  }
  data['SERVICES'] = JSON.stringify(services);
  writeConfig(data);
}

export function deleteService(id: string): void {
  const data = readConfig();
  const services = parseServices(data['SERVICES']).filter((s) => s.id !== id);
  data['SERVICES'] = JSON.stringify(services);
  writeConfig(data);
}

export function getServiceById(id: string): ServiceConfig | null {
  return getServices().find((s) => s.id === id) ?? null;
}

// ---------------------------------------------------------------------------

export function getSetting(key: string): string | null {
  if (key === 'SPEEDARR_API_KEY') {
    ensureNodeConfigWithApiKey();
  }
  const data = readConfig();
  const v = data[key];
  return typeof v === 'string' ? v : null;
}

export function setSetting(key: string, value: string): void {
  const data = readConfig();
  data[key] = value;
  writeConfig(data);
}

// Complete mode: ensure .speedarr exists on first load so first request creates it
function ensureCompleteModeDataDir(): void {
  if (env.MODE !== 'complete') return;
  const path = getConfigPath();
  if (!existsSync(dirname(path))) {
    ensureDir(path);
  }
}

// Node mode: ensure config (and .speedarr-node dir) exist on first load so first request creates them
if (env.MODE === 'node') {
  ensureNodeConfigWithApiKey();
} else {
  ensureCompleteModeDataDir();
}
