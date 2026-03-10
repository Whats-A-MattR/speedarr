/**
 * SABnzbd HTTP API client.
 * See: https://sabnzbd.org/wiki/advanced/api
 * All calls use GET with apikey as a query parameter.
 * Functions are parameterized — no global config reads.
 */
import { warn as logWarn } from './logger.js';

const REQUEST_TIMEOUT_MS = 10_000;

function buildUrl(base: string, apiKey: string, params: Record<string, string>): string {
  const u = new URL(`${base}/api`);
  u.searchParams.set('apikey', apiKey);
  u.searchParams.set('output', 'json');
  for (const [k, v] of Object.entries(params)) {
    u.searchParams.set(k, v);
  }
  return u.toString();
}

async function sabnzbdGet(
  base: string,
  apiKey: string,
  params: Record<string, string>
): Promise<unknown> {
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(buildUrl(base, apiKey, params), { signal: controller.signal });
    if (!res.ok) {
      logWarn(`[speedarr] SABnzbd returned ${res.status} for mode=${params.mode}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    logWarn('[speedarr] SABnzbd request failed:', (err as Error).message);
    return null;
  } finally {
    clearTimeout(to);
  }
}

/**
 * Test a SABnzbd connection. Returns version on success.
 */
export async function testSabnzbdConnection(
  url: string,
  apiKey: string
): Promise<{ ok: boolean; version?: string; error?: string }> {
  const base = url.trim().replace(/\/$/, '');
  if (!base || !apiKey) return { ok: false, error: 'URL and API key are required' };
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(buildUrl(base, apiKey, { mode: 'version' }), {
      signal: controller.signal,
    });
    clearTimeout(to);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = (await res.json()) as { version?: string };
    if (data?.version) return { ok: true, version: data.version };
    return { ok: false, error: 'Unexpected response from SABnzbd' };
  } catch (err) {
    clearTimeout(to);
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Set bandwidth as a percentage of SABnzbd's configured max speed.
 * 0 = unlimited.
 */
export async function setSabnzbdBandwidthPercent(
  url: string,
  apiKey: string,
  percent: number
): Promise<boolean> {
  const base = url.trim().replace(/\/$/, '');
  if (!base || !apiKey) return false;
  const value = percent === 0 ? '0' : `${Math.round(Math.max(1, Math.min(100, percent)))}%`;
  const result = await sabnzbdGet(base, apiKey, { mode: 'config', name: 'bandwidth_perc', value });
  return result !== null;
}

/**
 * Set absolute bandwidth in KB/s via set_speed. 0 = unlimited.
 */
export async function setSabnzbdSpeedLimitKbs(
  url: string,
  apiKey: string,
  kbs: number
): Promise<boolean> {
  const base = url.trim().replace(/\/$/, '');
  if (!base || !apiKey) return false;
  const result = await sabnzbdGet(base, apiKey, {
    mode: 'set_speed',
    value: String(Math.round(Math.max(0, kbs))),
  });
  return result !== null;
}

function parseSpeedToKbs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, value);
  }
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;
  const n = parseFloat(raw.replace(',', '.'));
  if (!Number.isFinite(n)) return null;

  const lower = raw.toLowerCase();
  if (lower.includes('mib') || lower.includes('mb')) return Math.max(0, n * 1024);
  if (lower.includes('kib') || lower.includes('kb')) return Math.max(0, n);
  if (lower.includes('b/s') || lower.includes('bytes')) return Math.max(0, n / 1024);
  return Math.max(0, n);
}

/**
 * Read current SABnzbd download throughput in KB/s.
 */
export async function getSabnzbdCurrentSpeedKbs(url: string, apiKey: string): Promise<number | null> {
  const base = url.trim().replace(/\/$/, '');
  if (!base || !apiKey) return null;
  const result = await sabnzbdGet(base, apiKey, { mode: 'queue', limit: '1' });
  if (!result || typeof result !== 'object') return null;
  const queue = (result as { queue?: Record<string, unknown> }).queue;
  if (!queue || typeof queue !== 'object') return null;
  const kbPerSec = parseSpeedToKbs(queue['kbpersec']);
  if (kbPerSec !== null) return kbPerSec;
  const speed = parseSpeedToKbs(queue['speed']);
  if (speed !== null) return speed;
  return null;
}

/**
 * Clear any managed rate limits so SABnzbd returns to its unrestricted state.
 */
export async function clearSabnzbdLimits(url: string, apiKey: string): Promise<boolean> {
  const [speedCleared, bandwidthCleared] = await Promise.all([
    setSabnzbdSpeedLimitKbs(url, apiKey, 0),
    setSabnzbdBandwidthPercent(url, apiKey, 0),
  ]);
  return speedCleared && bandwidthCleared;
}

/**
 * Pause all SABnzbd downloads.
 */
export async function pauseSabnzbd(url: string, apiKey: string): Promise<boolean> {
  const base = url.trim().replace(/\/$/, '');
  if (!base || !apiKey) return false;
  const result = await sabnzbdGet(base, apiKey, { mode: 'pause' });
  return result !== null;
}

/**
 * Resume all SABnzbd downloads.
 */
export async function resumeSabnzbd(url: string, apiKey: string): Promise<boolean> {
  const base = url.trim().replace(/\/$/, '');
  if (!base || !apiKey) return false;
  const result = await sabnzbdGet(base, apiKey, { mode: 'resume' });
  return result !== null;
}

// ---------------------------------------------------------------------------
// Schedule helpers
// ---------------------------------------------------------------------------

export interface ScheduleRule {
  start: string; // "HH:MM" 24-hour
  end: string;   // "HH:MM" 24-hour
  limitPercent: number; // 0–100; 0 = unlimited
}

export function parseScheduleRules(raw: string): ScheduleRule[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: ScheduleRule[] = [];
    for (const item of parsed) {
      if (
        item &&
        typeof item === 'object' &&
        typeof (item as ScheduleRule).start === 'string' &&
        typeof (item as ScheduleRule).end === 'string' &&
        typeof (item as ScheduleRule).limitPercent === 'number'
      ) {
        out.push({
          start: String((item as ScheduleRule).start),
          end: String((item as ScheduleRule).end),
          limitPercent: Number((item as ScheduleRule).limitPercent),
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return -1;
  return h * 60 + m;
}

export function getActiveScheduleRule(rules: ScheduleRule[], now: Date): ScheduleRule | null {
  const nowMins = now.getHours() * 60 + now.getMinutes();
  for (const rule of rules) {
    const startMins = timeToMinutes(rule.start);
    const endMins = timeToMinutes(rule.end);
    if (startMins < 0 || endMins < 0) continue;
    if (startMins <= endMins) {
      if (nowMins >= startMins && nowMins <= endMins) return rule;
    } else {
      // Wraps midnight (e.g. 22:00–06:00)
      if (nowMins >= startMins || nowMins <= endMins) return rule;
    }
  }
  return null;
}
