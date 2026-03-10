import { runAndPersistSpeedtest } from './speedtest.js';
import { getLatestGluetunStatus, getLatestResult, pruneOldResults } from './db.js';
import { getEffectiveConfig } from './config.js';
import { getServices, type ServiceConfig } from './config-file.js';
import { fetchAndPersistGluetunStatus } from './gluetun.js';
import { log as logger, error as logError } from './logger.js';
import {
  setSabnzbdBandwidthPercent,
  setSabnzbdSpeedLimitKbs,
  getSabnzbdCurrentSpeedKbs,
  clearSabnzbdLimits,
  pauseSabnzbd,
  resumeSabnzbd,
  parseScheduleRules,
  getActiveScheduleRule,
} from './sabnzbd.js';

const MS_PER_MINUTE = 60 * 1000;
let started = false;
let speedTestTimer: ReturnType<typeof setInterval> | null = null;
let gluetunTimer: ReturnType<typeof setInterval> | null = null;
let scheduleTimer: ReturnType<typeof setInterval> | null = null;
let speedCycleRunning = false;

// Per-service VPN kill switch state (keyed by service id)
const vpnPausedServices = new Set<string>();
const serviceLimitState = new Map<string, string>();
const connectionSpeedBaselineById = new Map<string, number>();
const lastVpnStatusByService = new Map<string, string | null>();
const lastGluetunPollAt = new Map<string, number>();

function getSpeedTestIntervalMinutes(): number {
  const config = getEffectiveConfig();
  if (config.intervalMinutes > 0) {
    return Math.max(1, Math.min(config.intervalMinutes, 60 * 24));
  }
  return 6 * 60;
}

// ---------------------------------------------------------------------------
// Per-service actions
// ---------------------------------------------------------------------------

type ServiceRateLimitAction =
  | { kind: 'none'; summary: string }
  | { kind: 'bandwidth_percent'; percent: number; summary: string }
  | { kind: 'absolute_kbs'; kbs: number; summary: string };

function getLatestDownloadMbps(): number | null {
  const latest = getLatestResult();
  return latest ? latest.download_mbps : null;
}

function getServiceConnectionId(service: ServiceConfig): string {
  return service.connectionId && service.connectionId.trim() ? service.connectionId.trim() : 'default';
}

function getDesiredRateLimitAction(
  service: ServiceConfig,
  downloadMbps: number | null,
  now: Date
): ServiceRateLimitAction {
  if (service.type !== 'sabnzbd' || !service.enabled || !service.url || !service.apiKey) {
    return { kind: 'none', summary: 'disabled' };
  }

  if (service.scheduleEnabled) {
    const rules = parseScheduleRules(service.schedule);
    const activeRule = getActiveScheduleRule(rules, now);
    if (activeRule) {
      return {
        kind: 'bandwidth_percent',
        percent: activeRule.limitPercent,
        summary: `schedule:${activeRule.limitPercent}:${activeRule.start}-${activeRule.end}`,
      };
    }
    if (service.scheduleDefaultLimit > 0) {
      return {
        kind: 'bandwidth_percent',
        percent: service.scheduleDefaultLimit,
        summary: `schedule-default:${service.scheduleDefaultLimit}`,
      };
    }
  }

  if (service.speedtestLimitEnabled && downloadMbps !== null) {
    const kbs = Math.round(downloadMbps * (service.speedtestLimitPercent / 100) * 125);
    return {
      kind: 'absolute_kbs',
      kbs,
      summary: `speedtest:${kbs}:${service.speedtestLimitPercent}:${downloadMbps.toFixed(1)}`,
    };
  }

  if (service.scheduleEnabled) {
    return { kind: 'bandwidth_percent', percent: 0, summary: 'schedule-default:unlimited' };
  }

  return { kind: 'none', summary: 'unmanaged' };
}

async function applyRateLimitForService(
  service: ServiceConfig,
  downloadMbps: number | null,
  now: Date
): Promise<void> {
  if (service.type !== 'sabnzbd') return;
  if (!service.url || !service.apiKey) return;

  let effectiveDownloadMbps = downloadMbps;
  if (service.speedtestLimitEnabled) {
    const connectionId = getServiceConnectionId(service);
    if (connectionSpeedBaselineById.has(connectionId)) {
      effectiveDownloadMbps = connectionSpeedBaselineById.get(connectionId) ?? downloadMbps;
    }
  }

  const desired = getDesiredRateLimitAction(service, effectiveDownloadMbps, now);
  const previous = serviceLimitState.get(service.id) ?? null;
  if (previous === desired.summary) return;

  if (desired.kind === 'bandwidth_percent') {
    const ok = await setSabnzbdBandwidthPercent(service.url, service.apiKey, desired.percent);
    if (!ok) return;
    serviceLimitState.set(service.id, desired.summary);
    if (desired.percent === 0) {
      logger(`[speedarr] ${service.name}: schedule set bandwidth to unlimited`);
    } else {
      logger(`[speedarr] ${service.name}: schedule set bandwidth to ${desired.percent}%`);
    }
    return;
  }

  if (desired.kind === 'absolute_kbs') {
    const ok = await setSabnzbdSpeedLimitKbs(service.url, service.apiKey, desired.kbs);
    if (!ok) return;
    serviceLimitState.set(service.id, desired.summary);
    logger(`[speedarr] ${service.name}: speed test limit → ${desired.kbs} KB/s`);
    return;
  }

  if (previous !== null) {
    const ok = await clearSabnzbdLimits(service.url, service.apiKey);
    if (!ok) return;
    logger(`[speedarr] ${service.name}: cleared managed bandwidth limits`);
  }
  serviceLimitState.delete(service.id);
}

async function checkVpnProtectionForService(
  service: ServiceConfig,
  vpnUp: boolean,
  wasUp: boolean,
  hasPreviousStatus: boolean
): Promise<void> {
  if (service.type !== 'sabnzbd') return; // only SABnzbd supported for now
  if (!service.killSwitchEnabled || !service.url || !service.apiKey) return;

  const pausedByUs = vpnPausedServices.has(service.id);

  if (!vpnUp && (wasUp || !hasPreviousStatus) && !pausedByUs) {
    const ok = await pauseSabnzbd(service.url, service.apiKey);
    if (ok) {
      vpnPausedServices.add(service.id);
      logger(`[speedarr] ${service.name}: kill switch — downloads paused`);
    }
  } else if (vpnUp && !wasUp && pausedByUs) {
    const ok = await resumeSabnzbd(service.url, service.apiKey);
    if (ok) {
      vpnPausedServices.delete(service.id);
      logger(`[speedarr] ${service.name}: VPN reconnected — downloads resumed`);
    }
  }
}

// ---------------------------------------------------------------------------
// Cron jobs
// ---------------------------------------------------------------------------

async function runScheduleCheck(): Promise<void> {
  const services = getServices().filter((s) => s.enabled);
  const downloadMbps = getLatestDownloadMbps();
  const now = new Date();
  for (const service of services) {
    try {
      await applyRateLimitForService(service, downloadMbps, now);
    } catch (err) {
      logError(`[speedarr] Limit reconcile failed for ${service.name}:`, (err as Error).message);
    }
  }
}

async function runVpnProtectionCheck(): Promise<void> {
  const allServices = getServices();
  const gluetunByConnection = new Map<string, ServiceConfig>();
  for (const gluetun of allServices.filter((s) => s.type === 'gluetun' && s.enabled)) {
    const connectionId = getServiceConnectionId(gluetun);
    if (!gluetunByConnection.has(connectionId)) {
      gluetunByConnection.set(connectionId, gluetun);
    }
  }

  const services = allServices.filter((s) => {
    if (s.type !== 'sabnzbd' || !s.enabled || !s.killSwitchEnabled) return false;
    if (s.vpnServiceId) return true;
    return gluetunByConnection.has(getServiceConnectionId(s));
  });
  if (services.length === 0) return;

  for (const service of services) {
    const fallbackVpn = gluetunByConnection.get(getServiceConnectionId(service));
    const vpnServiceId = service.vpnServiceId || fallbackVpn?.id;
    if (!vpnServiceId) continue;
    const vpnStatus = getLatestGluetunStatus(vpnServiceId);
    if (!vpnStatus) continue;
    const previous = lastVpnStatusByService.get(vpnServiceId);
    const vpnUp = vpnStatus.vpn_status === 'running';
    const wasUp = previous === 'running';
    try {
      await checkVpnProtectionForService(service, vpnUp, wasUp, previous !== undefined);
    } catch (err) {
      logError(`[speedarr] Kill switch check failed for ${service.name}:`, (err as Error).message);
    }
    lastVpnStatusByService.set(vpnServiceId, vpnStatus.vpn_status);
  }
}

// ---------------------------------------------------------------------------

async function pollGluetunServices(force = false): Promise<void> {
  const now = Date.now();
  for (const service of getServices().filter((s) => s.type === 'gluetun' && s.enabled)) {
    const intervalMs = Math.max(1, service.pollIntervalMinutes) * MS_PER_MINUTE;
    const lastPolledAt = lastGluetunPollAt.get(service.id) ?? 0;
    if (!force && now - lastPolledAt < intervalMs) continue;
    try {
      const status = await fetchAndPersistGluetunStatus(service);
      lastGluetunPollAt.set(service.id, now);
      if (status) {
        lastVpnStatusByService.set(service.id, status.vpn_status);
      }
    } catch (err) {
      logError(`[speedarr] Gluetun check failed for ${service.name}:`, (err as Error).message);
    }
  }
}

async function refreshConnectionSpeedBaselines(measuredDownloadMbps: number): Promise<void> {
  const services = getServices().filter((s) => s.enabled && s.type !== 'gluetun');
  const throughputByConnectionKbs = new Map<string, number>();

  for (const service of services) {
    let currentKbs = 0;
    if (service.type === 'sabnzbd' && service.url && service.apiKey) {
      const liveKbs = await getSabnzbdCurrentSpeedKbs(service.url, service.apiKey);
      currentKbs = liveKbs !== null ? liveKbs : 0;
    }
    const connectionId = getServiceConnectionId(service);
    throughputByConnectionKbs.set(
      connectionId,
      (throughputByConnectionKbs.get(connectionId) ?? 0) + currentKbs
    );
  }

  connectionSpeedBaselineById.clear();
  for (const [connectionId, throughputKbs] of throughputByConnectionKbs.entries()) {
    connectionSpeedBaselineById.set(connectionId, measuredDownloadMbps + throughputKbs / 125);
  }
}

async function runSpeedCycle(retentionDays: number): Promise<void> {
  if (speedCycleRunning) return;
  speedCycleRunning = true;
  try {
    const result = await runAndPersistSpeedtest();
    await pollGluetunServices();
    await runVpnProtectionCheck();
    await refreshConnectionSpeedBaselines(result.download_mbps);

    for (const service of getServices().filter((s) => s.enabled)) {
      try {
        await applyRateLimitForService(service, result.download_mbps, new Date());
      } catch (err) {
        logError(`[speedarr] Speed test limit failed for ${service.name}:`, (err as Error).message);
      }
    }

    if (retentionDays > 0) {
      const deleted = pruneOldResults(retentionDays);
      if (deleted > 0) logger(`[speedarr] Pruned ${deleted} old result(s).`);
    }
  } catch (err) {
    logError('[speedarr] Speed test failed:', (err as Error).message);
  } finally {
    speedCycleRunning = false;
  }
}

export function startCron(): void {
  if (started) return;
  started = true;

  const speedTestMinutes = getSpeedTestIntervalMinutes();
  const config = getEffectiveConfig();

  speedTestTimer = setInterval(() => {
    runSpeedCycle(config.retentionDays).catch((err) => {
      logError('[speedarr] Speed cycle failed:', (err as Error).message);
    });
  }, speedTestMinutes * MS_PER_MINUTE);

  logger('[speedarr] Schedule started: speed test every', speedTestMinutes, 'min');

  gluetunTimer = setInterval(async () => {
    try {
      await pollGluetunServices();
      await runVpnProtectionCheck();
    } catch (err) {
      logError('[speedarr] Gluetun check failed:', (err as Error).message);
    }
  }, MS_PER_MINUTE);
  logger('[speedarr] Gluetun services polling enabled');

  // Schedule check every minute
  scheduleTimer = setInterval(async () => {
    try {
      await runScheduleCheck();
    } catch (err) {
      logError('[speedarr] Schedule check failed:', (err as Error).message);
    }
  }, MS_PER_MINUTE);

  runScheduleCheck().catch((err) => {
    logError('[speedarr] Initial schedule apply failed:', (err as Error).message);
  });
  runSpeedCycle(config.retentionDays)
    .catch((err) => {
      logError('[speedarr] Initial speed cycle failed:', (err as Error).message);
    });
}

export function restartCron(): void {
  if (!started) return;
  if (speedTestTimer) { clearInterval(speedTestTimer); speedTestTimer = null; }
  if (gluetunTimer) { clearInterval(gluetunTimer); gluetunTimer = null; }
  if (scheduleTimer) { clearInterval(scheduleTimer); scheduleTimer = null; }
  vpnPausedServices.clear();
  serviceLimitState.clear();
  connectionSpeedBaselineById.clear();
  lastVpnStatusByService.clear();
  lastGluetunPollAt.clear();
  speedCycleRunning = false;
  started = false;
  startCron();
}
