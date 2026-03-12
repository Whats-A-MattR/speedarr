/**
 * Effective config: from config.json (portal) with in-code defaults.
 */
import { getSetting } from './config-file.js';

export function getEffectiveConfig(): {
  intervalMinutes: number;
  retentionDays: number;
} {
  const minutesFromDb = getSetting('SPEEDARR_INTERVAL_MINUTES');
  const retentionFromDb = getSetting('SPEEDARR_RETENTION_DAYS');
  const intervalMinutes = minutesFromDb ? parseInt(minutesFromDb, 10) : 0;
  const retentionDays = retentionFromDb ? parseInt(retentionFromDb, 10) : 0;
  return {
    intervalMinutes: Number.isFinite(intervalMinutes) ? intervalMinutes : 0,
    retentionDays: Number.isFinite(retentionDays) ? retentionDays : 0,
  };
}

export function getGluetunConfig(): { address: string; apiKey: string } {
  const address = (getSetting('GLUETUN_ADDRESS') ?? '').trim().replace(/\/$/, '');
  const apiKey = getSetting('GLUETUN_API_KEY') ?? '';
  return { address, apiKey };
}

export function getGluetunPollingConfig(): { intervalMinutes: number } {
  const minutesFromDb = getSetting('SPEEDARR_GLUETUN_INTERVAL_MINUTES');
  const intervalMinutes = minutesFromDb ? parseInt(minutesFromDb, 10) : 5;
  return {
    intervalMinutes: Number.isFinite(intervalMinutes) ? Math.max(1, Math.min(intervalMinutes, 60 * 24)) : 5,
  };
}

/** Agent identity (for speed results). From config.json with defaults. */
export function getAgentIdentity(): { agentId: string; agentName: string } {
  return {
    agentId: getSetting('SPEEDARR_AGENT_ID') ?? 'local',
    agentName: getSetting('SPEEDARR_AGENT_NAME') ?? 'Local',
  };
}

/** Report endpoint: dashboard base URL and node id to use when posting. */
export type ReportEndpoint = { url: string; nodeId: string };

/** When running as a node: list of dashboards to POST each speed test result to. Stored as JSON array in SPEEDARR_REPORT_ENDPOINTS. Legacy: SPEEDARR_DASHBOARD_URL + SPEEDARR_NODE_ID treated as first endpoint. */
export function getReportEndpoints(): ReportEndpoint[] {
  const raw = getSetting('SPEEDARR_REPORT_ENDPOINTS');
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        const out: ReportEndpoint[] = [];
        for (const item of parsed) {
          if (item && typeof item === 'object' && typeof (item as ReportEndpoint).url === 'string' && typeof (item as ReportEndpoint).nodeId === 'string') {
            const url = String((item as ReportEndpoint).url).trim().replace(/\/$/, '');
            const nodeId = String((item as ReportEndpoint).nodeId).trim();
            if (url && nodeId) out.push({ url, nodeId });
          }
        }
        if (out.length > 0) {
          // One endpoint per dashboard URL. If duplicates exist, keep the latest nodeId entry.
          const byUrl = new Map<string, ReportEndpoint>();
          for (const endpoint of out) {
            byUrl.set(endpoint.url, endpoint);
          }
          return [...byUrl.values()];
        }
      }
    } catch {
      /* ignore */
    }
  }
  const legacyUrl = (getSetting('SPEEDARR_DASHBOARD_URL') ?? '').trim().replace(/\/$/, '');
  const legacyNodeId = (getSetting('SPEEDARR_NODE_ID') ?? '').trim();
  if (legacyUrl && legacyNodeId) return [{ url: legacyUrl, nodeId: legacyNodeId }];
  return [];
}
