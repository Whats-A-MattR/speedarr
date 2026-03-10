/**
 * Gluetun HTTP control server client.
 * See: https://github.com/qdm12/gluetun/wiki/HTTP-control-server
 * Endpoints: GET /v1/publicip/ip (public IP, optional geo), GET /v1/vpn/status (VPN status; works for both OpenVPN and WireGuard).
 */
import { insertGluetunStatus } from './db.js';
import type { ServiceConfig } from './config-file.js';
import { log as logger, warn as logWarn } from './logger.js';

const REQUEST_TIMEOUT_MS = 10_000;

export interface GluetunPublicIp {
  public_ip: string;
  city?: string;
  region?: string;
  country?: string;
  [k: string]: unknown;
}

export interface GluetunStatus {
  timestamp: number;
  public_ip: string;
  vpn_status: string;
  city: string | null;
  region: string | null;
  country: string | null;
  raw_publicip: string;
  raw_openvpn_status: string;
}

function buildHeaders(apiKey: string): Record<string, string> {
  const h: Record<string, string> = { 'Accept': 'application/json' };
  if (apiKey) h['X-API-Key'] = apiKey;
  return h;
}

/**
 * Fetch Gluetun status with given address and API key (for testing config).
 */
export async function fetchGluetunStatusWithConfig(
  address: string,
  apiKey: string
): Promise<GluetunStatus | null> {
  const base = address.trim().replace(/\/$/, '');
  if (!base) return null;

  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const headers = buildHeaders(apiKey);
    const [publicIpRes, vpnRes] = await Promise.all([
      fetch(`${base}/v1/publicip/ip`, { headers, signal: controller.signal }),
      fetch(`${base}/v1/vpn/status`, { headers, signal: controller.signal }),
    ]);

    const safeJson = async (res: Response): Promise<unknown> => {
      if (!res.ok) return null;
      try {
        return await res.json();
      } catch {
        return null;
      }
    };
    const [publicIpJson, vpnJson] = await Promise.all([
      safeJson(publicIpRes) as Promise<GluetunPublicIp | null>,
      safeJson(vpnRes) as Promise<{ status?: string; outcome?: string } | null>,
    ]);

    if (!publicIpRes.ok || !vpnRes.ok) {
      const statuses = `publicip ${publicIpRes.status}, vpn/status ${vpnRes.status}`;
      logWarn('[speedarr] Gluetun returned non-OK:', statuses, '(check URL and API key)');
    }

    const public_ip = typeof publicIpJson?.public_ip === 'string' ? publicIpJson.public_ip : '';
    // Gluetun may return "status" or "outcome"; accept both. If we have a public IP, VPN is connected
    // (Gluetun only returns public_ip when the tunnel is up), so treat as "running" in that case.
    const raw = vpnJson?.status ?? vpnJson?.outcome;
    const rawStatus = typeof raw === 'string' ? raw : (vpnRes.ok ? 'unknown' : 'unreachable');
    const vpn_status = public_ip ? 'running' : (rawStatus === 'running' ? 'running' : rawStatus);
    const city = typeof publicIpJson?.city === 'string' ? publicIpJson.city : null;
    const region = typeof publicIpJson?.region === 'string' ? publicIpJson.region : null;
    const country = typeof publicIpJson?.country === 'string' ? publicIpJson.country : null;

    return {
      timestamp: Date.now(),
      public_ip,
      vpn_status,
      city,
      region,
      country,
      raw_publicip: JSON.stringify(publicIpJson ?? {}),
      raw_openvpn_status: JSON.stringify(vpnJson ?? {}),
    };
  } catch (err) {
    logWarn('[speedarr] Gluetun fetch failed:', (err as Error).message);
    return null;
  } finally {
    clearTimeout(to);
  }
}

/**
 * Fetch Gluetun status from a configured service. Returns null if not configured or request fails.
 */
export async function fetchGluetunStatus(service: ServiceConfig): Promise<GluetunStatus | null> {
  return fetchGluetunStatusWithConfig(service.url, service.apiKey);
}

/**
 * Fetch Gluetun status and persist to DB if configured. Call from cron or after manual checks.
 */
export async function fetchAndPersistGluetunStatus(service: ServiceConfig): Promise<GluetunStatus | null> {
  const status = await fetchGluetunStatus(service);
  if (!status) return;
  insertGluetunStatus({
    service_id: service.id,
    timestamp: status.timestamp,
    public_ip: status.public_ip || null,
    vpn_status: status.vpn_status,
    city: status.city ?? null,
    region: status.region ?? null,
    country: status.country ?? null,
    raw_publicip: status.raw_publicip,
    raw_openvpn_status: status.raw_openvpn_status,
  });
  logger(
    `[speedarr] ${service.name}: VPN ${status.vpn_status}, public IP ${status.public_ip || '—'}${status.city ? ` (${[status.city, status.region, status.country].filter(Boolean).join(', ')})` : ''}`
  );
  return status;
}
