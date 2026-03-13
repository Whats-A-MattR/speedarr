import speedTest from 'speedtest-net';
import { getAgentIdentity, getReportEndpoints } from './config.js';
import { insertSpeedResult } from './db.js';
import { env } from './env.js';
import { getSetting } from './config-file.js';
import { log as logger } from './logger.js';

const SPEEDTEST_BIN = process.env.SPEEDTEST_BIN ?? 'speedtest';

const WHATS_MY_IP_URL = 'https://api.ipify.org?format=json';
const WHATS_MY_IP_TIMEOUT_MS = 5000;

/**
 * Get public IP from a dedicated "what's my IP" service (ipify).
 * Used so dashboard and nodes see the same IP when running on the same machine,
 * instead of relying on Ookla's speedtest config which can differ between runs.
 */
export async function fetchExternalIp(): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WHATS_MY_IP_TIMEOUT_MS);
  try {
    const res = await fetch(WHATS_MY_IP_URL, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = (await res.json()) as { ip?: string };
    return typeof data?.ip === 'string' ? data.ip : null;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

export interface SpeedtestResult {
  timestamp: number;
  download_mbps: number;
  upload_mbps: number;
  latency_ms: number | null;
  server_id: string | null;
  server_name: string | null;
  raw_json: string;
  external_ip: string | null;
}

/** Bandwidth in bytes/sec to Mbps */
function bpsToMbps(bps: number): number {
  return (bps * 8) / 1_000_000;
}

/**
 * Run speed test via speedtest-net (Ookla CLI wrapper). Returns structured result; no stdout parsing.
 * External IP is fetched from a dedicated "what's my IP" service (ipify) so it's consistent
 * across dashboard and nodes on the same machine; falls back to Ookla's interface.externalIp if the fetch fails.
 */
export async function runSpeedtest(): Promise<SpeedtestResult> {
  const data = await speedTest({
    acceptLicense: true,
    acceptGdpr: true,
    binary: SPEEDTEST_BIN,
    verbosity: 0,
  }).catch((err: Error) => {
    const msg = err.message;
    const hint = /configuration|could not retrieve|ConfigurationError/i.test(msg)
      ? ' The server may have no outbound internet or DNS—check container network.'
      : ` Is "${SPEEDTEST_BIN}" installed and license accepted?`;
    throw new Error(`Speedtest failed: ${msg}.${hint}`);
  });

  const typed = data as {
    timestamp: Date;
    ping?: { latency?: number; jitter?: number };
    download?: { bandwidth?: number };
    upload?: { bandwidth?: number };
    server?: { id?: number; name?: string; host?: string };
    interface?: { externalIp?: string };
  };
  const timestamp = typed.timestamp instanceof Date ? typed.timestamp.getTime() : Date.now();
  const downloadBps = Number(typed.download?.bandwidth) || 0;
  const uploadBps = Number(typed.upload?.bandwidth) || 0;
  const server = typed.server;
  const iface = (data as { interface?: { externalIp?: string } }).interface ?? {};

  const externalIpFromOokla = typeof iface.externalIp === 'string' ? iface.externalIp : null;
  const externalIp = (await fetchExternalIp()) ?? externalIpFromOokla;

  const result: SpeedtestResult = {
    timestamp,
    download_mbps: bpsToMbps(downloadBps),
    upload_mbps: bpsToMbps(uploadBps),
    latency_ms: typed.ping?.latency != null ? Number(typed.ping.latency) : null,
    server_id: server?.id != null ? String(server.id) : null,
    server_name: server?.name ?? (server?.host ? String(server.host) : null) ?? null,
    external_ip: externalIp,
    raw_json: JSON.stringify(data),
  };
  return result;
}

/**
 * Run speedtest and persist result to DB. Uses agent identity from config. Logs to stdout.
 */
export async function runAndPersistSpeedtest(): Promise<SpeedtestResult> {
  const { agentId, agentName } = getAgentIdentity();
  const result = await runSpeedtest();
  insertSpeedResult({
    timestamp: result.timestamp,
    download_mbps: result.download_mbps,
    upload_mbps: result.upload_mbps,
    latency_ms: result.latency_ms,
    server_id: result.server_id,
    server_name: result.server_name,
    raw_json: result.raw_json,
    agent_id: agentId,
    agent_name: agentName,
    external_ip: result.external_ip,
  });
  logger(
    `[speedarr] Speed test completed (${agentName}): ${result.download_mbps.toFixed(2)} Mbps down, ${result.upload_mbps.toFixed(2)} Mbps up, latency ${result.latency_ms ?? 'n/a'} ms`
  );

  if (env.MODE === 'node') {
    const endpoints = getReportEndpoints();
    const apiKey = getSetting('SPEEDARR_API_KEY');
    if (apiKey && endpoints.length > 0) {
      for (const ep of endpoints) {
        reportResultToDashboard(ep.url, ep.nodeId, apiKey, result, agentName).catch((err) => {
          logger('[speedarr] Failed to report result to', ep.url, ':', (err as Error).message);
        });
      }
    }
  }

  return result;
}

async function reportResultToDashboard(
  dashboardUrl: string,
  nodeId: string,
  apiKey: string,
  result: SpeedtestResult,
  agentName: string
): Promise<void> {
  const res = await fetch(`${dashboardUrl}/api/nodes/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify({
      nodeId,
      agent_name: agentName,
      timestamp: result.timestamp,
      download_mbps: result.download_mbps,
      upload_mbps: result.upload_mbps,
      latency_ms: result.latency_ms,
      external_ip: result.external_ip,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text.slice(0, 200)}`);
  }
}
