import { join } from 'node:path';

/**
 * Minimal environment: mode and password (and where to store data).
 * Everything else is configured in the portal and stored in config.json.
 */
function getEnv(key: string, fallback = ''): string {
  return (typeof process !== 'undefined' && process.env?.[key]) ?? fallback;
}

const MODE = getEnv('MODE', getEnv('SPEEDARR_MODE', 'complete'));
const PORT = parseInt(getEnv('PORT', '3000'), 10);
const dataDirRaw = getEnv('SPEEDARR_DATA_DIR') || getEnv('CONFIG_PATH');
const defaultDataDir = MODE === 'node' ? '.speedarr-node' : '.speedarr';
const DATA_DIR = dataDirRaw
  ? dataDirRaw.replace(/\/$/, '')
  : join(typeof process !== 'undefined' ? process.cwd() : '', defaultDataDir);
const DB_PATH = `${DATA_DIR}/db/speedarr.db`;

export const env = {
  MODE: MODE === 'node' ? 'node' : 'complete' as 'complete' | 'node',
  PORT: Number.isFinite(PORT) ? PORT : 3000,
  DATA_DIR,
  DB_PATH,
  /** Dashboard login password. If set, used for login; else password is set in first-run and stored in config.json. */
  SPEEDARR_PASSWORD: getEnv('SPEEDARR_PASSWORD', ''),
  /** Set at Docker build from git tag (e.g. v1.0.0 → 1.0.0). Exposed in /api/health. */
  APP_VERSION: getEnv('APP_VERSION', '0.0.0'),
};
