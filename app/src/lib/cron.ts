import { runAndPersistSpeedtest } from './speedtest.js';
import { pruneOldResults } from './db.js';
import { getEffectiveConfig, getGluetunConfig, getGluetunPollingConfig } from './config.js';
import { fetchAndPersistGluetunStatus } from './gluetun.js';
import { log as logger, error as logError } from './logger.js';

const MS_PER_MINUTE = 60 * 1000;
let started = false;
let speedTestTimer: ReturnType<typeof setInterval> | null = null;
let gluetunTimer: ReturnType<typeof setInterval> | null = null;

function getSpeedTestIntervalMinutes(): number {
  const config = getEffectiveConfig();
  if (config.intervalMinutes > 0) {
    return Math.max(1, Math.min(config.intervalMinutes, 60 * 24));
  }
  return 6 * 60; // default: every 6 hours
}

function getGluetunIntervalMinutes(): number {
  const config = getGluetunPollingConfig();
  return config.intervalMinutes;
}

/**
 * Start the speedtest and Gluetun polling intervals. Idempotent; safe to call from first API request.
 */
export function startCron(): void {
  if (started) return;
  started = true;

  const speedTestMinutes = getSpeedTestIntervalMinutes();
  const config = getEffectiveConfig();

  speedTestTimer = setInterval(async () => {
    try {
      await runAndPersistSpeedtest();
      await fetchAndPersistGluetunStatus();
      if (config.retentionDays > 0) {
        const deleted = pruneOldResults(config.retentionDays);
        if (deleted > 0) {
          logger(`[speedarr] Pruned ${deleted} old result(s).`);
        }
      }
    } catch (err) {
      logError('[speedarr] Speed test failed:', (err as Error).message);
    }
  }, speedTestMinutes * MS_PER_MINUTE);

  logger('[speedarr] Schedule started: speed test every', speedTestMinutes, 'min');

  if (getGluetunConfig().address) {
    const gluetunMinutes = getGluetunIntervalMinutes();
    gluetunTimer = setInterval(async () => {
      try {
        await fetchAndPersistGluetunStatus();
      } catch (err) {
        logError('[speedarr] Gluetun check failed:', (err as Error).message);
      }
    }, gluetunMinutes * MS_PER_MINUTE);
    logger('[speedarr] Gluetun polling every', gluetunMinutes, 'min');
  }
}

/**
 * Restart intervals (re-read config and reschedule). Used after config is updated (e.g. from dashboard).
 */
export function restartCron(): void {
  if (!started) return;
  if (speedTestTimer) {
    clearInterval(speedTestTimer);
    speedTestTimer = null;
  }
  if (gluetunTimer) {
    clearInterval(gluetunTimer);
    gluetunTimer = null;
  }
  started = false;
  startCron();
}
