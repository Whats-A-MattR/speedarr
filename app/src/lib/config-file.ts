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
