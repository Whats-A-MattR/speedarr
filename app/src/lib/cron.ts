import { runAndPersistSpeedtest } from './speedtest.js';
import { getLatestGluetunStatus, getLatestResult, pruneOldResults } from './db.js';
import { getEffectiveConfig, getAgentIdentity } from './config.js';
import { getConnections, getServices, type ServiceConfig } from './config-file.js';
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
type CronState = {
  started: boolean;
  speedTestTimer: ReturnType<typeof setInterval> | null;
  gluetunTimer: ReturnType<typeof setInterval> | null;
  scheduleTimer: ReturnType<typeof setInterval> | null;
  speedCycleRunning: boolean;
  // Per-service VPN kill switch state (keyed by service id)
  vpnPausedServices: Set<string>;
  serviceLimitState: Map<string, string>;
  connectionSpeedBaselineById: Map<string, number | null>;
  lastVpnStatusByService: Map<string, string | null>;
  lastGluetunPollAt: Map<string, number>;
};

const CRON_STATE_KEY = '__speedarrCronStateV1__';

function createCronState(): CronState {
  return {
    started: false,
    speedTestTimer: null,
    gluetunTimer: null,
    scheduleTimer: null,
    speedCycleRunning: false,
    vpnPausedServices: new Set<string>(),
    serviceLimitState: new Map<string, string>(),
    connectionSpeedBaselineById: new Map<string, number | null>(),
    lastVpnStatusByService: new Map<string, string | null>(),
    lastGluetunPollAt: new Map<string, number>(),
  };
}

function getCronState(): CronState {
  const g = globalThis as typeof globalThis & { [CRON_STATE_KEY]?: CronState };
  const p = process as NodeJS.Process & { [CRON_STATE_KEY]?: CronState };
  const existing = p[CRON_STATE_KEY] ?? g[CRON_STATE_KEY];
  if (existing) {
    p[CRON_STATE_KEY] = existing;
    g[CRON_STATE_KEY] = existing;
    return existing;
  }
  const created = createCronState();
  p[CRON_STATE_KEY] = created;
  g[CRON_STATE_KEY] = created;
  return created;
}

const state = getCronState();

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
    if (state.connectionSpeedBaselineById.has(connectionId)) {
      effectiveDownloadMbps = state.connectionSpeedBaselineById.get(connectionId) ?? null;
    }
  }

  const desired = getDesiredRateLimitAction(service, effectiveDownloadMbps, now);
  const previous = state.serviceLimitState.get(service.id) ?? null;
  if (previous === desired.summary) return;

  if (desired.kind === 'bandwidth_percent') {
    const ok = await setSabnzbdBandwidthPercent(service.url, service.apiKey, desired.percent);
    if (!ok) return;
    state.serviceLimitState.set(service.id, desired.summary);
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
    state.serviceLimitState.set(service.id, desired.summary);
    logger(`[speedarr] ${service.name}: speed test limit → ${desired.kbs} KB/s`);
    return;
  }

  if (previous !== null) {
    const ok = await clearSabnzbdLimits(service.url, service.apiKey);
    if (!ok) return;
    logger(`[speedarr] ${service.name}: cleared managed bandwidth limits`);
  }
  state.serviceLimitState.delete(service.id);
}

async function checkVpnProtectionForService(
  service: ServiceConfig,
  vpnUp: boolean,
  wasUp: boolean,
  hasPreviousStatus: boolean
): Promise<void> {
  if (service.type !== 'sabnzbd') return; // only SABnzbd supported for now
  if (!service.killSwitchEnabled || !service.url || !service.apiKey) return;

  const pausedByUs = state.vpnPausedServices.has(service.id);

  if (!vpnUp && (wasUp || !hasPreviousStatus) && !pausedByUs) {
    const ok = await pauseSabnzbd(service.url, service.apiKey);
    if (ok) {
      state.vpnPausedServices.add(service.id);
      logger(`[speedarr] ${service.name}: kill switch — downloads paused`);
    }
  } else if (vpnUp && !wasUp && pausedByUs) {
    const ok = await resumeSabnzbd(service.url, service.apiKey);
    if (ok) {
      state.vpnPausedServices.delete(service.id);
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
    const previous = state.lastVpnStatusByService.get(vpnServiceId);
    const vpnUp = vpnStatus.vpn_status === 'running';
    const wasUp = previous === 'running';
    try {
      await checkVpnProtectionForService(service, vpnUp, wasUp, previous !== undefined);
    } catch (err) {
      logError(`[speedarr] Kill switch check failed for ${service.name}:`, (err as Error).message);
    }
    state.lastVpnStatusByService.set(vpnServiceId, vpnStatus.vpn_status);
  }
}

// ---------------------------------------------------------------------------

async function pollGluetunServices(force = false): Promise<void> {
  const now = Date.now();
  for (const service of getServices().filter((s) => s.type === 'gluetun' && s.enabled)) {
    const intervalMs = Math.max(1, service.pollIntervalMinutes) * MS_PER_MINUTE;
    const lastPolledAt = state.lastGluetunPollAt.get(service.id) ?? 0;
    if (!force && now - lastPolledAt < intervalMs) continue;
    try {
      const status = await fetchAndPersistGluetunStatus(service);
      state.lastGluetunPollAt.set(service.id, now);
      if (status) {
        state.lastVpnStatusByService.set(service.id, status.vpn_status);
      }
    } catch (err) {
      logError(`[speedarr] Gluetun check failed for ${service.name}:`, (err as Error).message);
    }
  }
}

async function refreshConnectionSpeedBaselines(measuredDownloadMbps: number): Promise<void> {
  const { agentId: localAgentId } = getAgentIdentity();
  const connections = getConnections();
  const services = getServices().filter((s) => s.enabled && s.type !== 'gluetun');
  const throughputByConnectionKbs = new Map<string, number>();
  const latestDownloadByNodeId = new Map<string, number | null>();

  const getAssignedNodeIds = (connectionId: string): string[] => {
    const conn = connections.find((connection) => connection.id === connectionId);
    const ids = conn?.nodeIds ?? [];
    const cleaned = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    return cleaned.length > 0 ? cleaned : [localAgentId];
  };

  const getLatestDownloadForNode = (nodeId: string): number | null => {
    if (latestDownloadByNodeId.has(nodeId)) {
      return latestDownloadByNodeId.get(nodeId) ?? null;
    }
    const latest = getLatestResult(nodeId);
    const speed = latest?.download_mbps ?? null;
    latestDownloadByNodeId.set(nodeId, speed);
    return speed;
  };

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

  state.connectionSpeedBaselineById.clear();
  for (const connection of connections) {
    const nodeSpeeds = getAssignedNodeIds(connection.id)
      .map((nodeId) => {
        const latest = getLatestDownloadForNode(nodeId);
        if (latest !== null) return latest;
        if (nodeId === localAgentId) return measuredDownloadMbps;
        return null;
      })
      .filter((speed): speed is number => typeof speed === 'number' && Number.isFinite(speed));
    const averageMeasuredMbps = nodeSpeeds.length > 0
      ? nodeSpeeds.reduce((sum, speed) => sum + speed, 0) / nodeSpeeds.length
      : null;
    const throughputKbs = throughputByConnectionKbs.get(connection.id) ?? 0;
    const throughputMbps = throughputKbs / 125;
    state.connectionSpeedBaselineById.set(
      connection.id,
      averageMeasuredMbps !== null ? averageMeasuredMbps + throughputMbps : null
    );
  }
}

function hasRecentScheduledResult(): boolean {
  const speedTestMinutes = getSpeedTestIntervalMinutes();
  const { agentId } = getAgentIdentity();
  const latest = getLatestResult(agentId);
  if (!latest) return false;
  const elapsedMs = Date.now() - latest.timestamp;
  return elapsedMs >= 0 && elapsedMs < speedTestMinutes * MS_PER_MINUTE;
}

async function runSpeedCycle(
  retentionDays: number,
  options: { enforceInterval?: boolean } = {}
): Promise<void> {
  if (state.speedCycleRunning) return;
  if (options.enforceInterval && hasRecentScheduledResult()) return;
  state.speedCycleRunning = true;
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
    state.speedCycleRunning = false;
  }
}

export function startCron(options: { runImmediately?: boolean } = {}): void {
  if (state.started) return;
  state.started = true;

  const speedTestMinutes = getSpeedTestIntervalMinutes();
  const config = getEffectiveConfig();

  state.speedTestTimer = setInterval(() => {
    runSpeedCycle(config.retentionDays, { enforceInterval: true }).catch((err) => {
      logError('[speedarr] Speed cycle failed:', (err as Error).message);
    });
  }, speedTestMinutes * MS_PER_MINUTE);

  logger('[speedarr] Schedule started: speed test every', speedTestMinutes, 'min');

  state.gluetunTimer = setInterval(async () => {
    try {
      await pollGluetunServices();
      await runVpnProtectionCheck();
    } catch (err) {
      logError('[speedarr] Gluetun check failed:', (err as Error).message);
    }
  }, MS_PER_MINUTE);
  logger('[speedarr] Gluetun services polling enabled');

  // Schedule check every minute
  state.scheduleTimer = setInterval(async () => {
    try {
      await runScheduleCheck();
    } catch (err) {
      logError('[speedarr] Schedule check failed:', (err as Error).message);
    }
  }, MS_PER_MINUTE);

  runScheduleCheck().catch((err) => {
    logError('[speedarr] Initial schedule apply failed:', (err as Error).message);
  });
  if (options.runImmediately !== false) {
    runSpeedCycle(config.retentionDays, { enforceInterval: true })
      .catch((err) => {
        logError('[speedarr] Initial speed cycle failed:', (err as Error).message);
      });
  }
}

export function restartCron(): void {
  if (!state.started) return;
  if (state.speedTestTimer) { clearInterval(state.speedTestTimer); state.speedTestTimer = null; }
  if (state.gluetunTimer) { clearInterval(state.gluetunTimer); state.gluetunTimer = null; }
  if (state.scheduleTimer) { clearInterval(state.scheduleTimer); state.scheduleTimer = null; }
  state.vpnPausedServices.clear();
  state.serviceLimitState.clear();
  state.connectionSpeedBaselineById.clear();
  state.lastVpnStatusByService.clear();
  state.lastGluetunPollAt.clear();
  state.speedCycleRunning = false;
  state.started = false;
  startCron({ runImmediately: false });
}
