import type { APIRoute } from 'astro';
import { requireApiKey } from '../../../lib/auth.js';
import { getEffectiveConfig, getGluetunPollingConfig, getReportEndpoints } from '../../../lib/config.js';
import { getSetting, setSetting } from '../../../lib/config-file.js';
import { restartCron } from '../../../lib/cron.js';

export const prerender = false;

function jsonResponse(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET: APIRoute = async ({ request }) => {
  if (!requireApiKey(request)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  const speed = getEffectiveConfig();
  const gluetun = getGluetunPollingConfig();
  const reportEndpoints = getReportEndpoints();
  return jsonResponse({
    intervalMinutes: speed.intervalMinutes > 0 ? speed.intervalMinutes : 6 * 60,
    gluetunIntervalMinutes: gluetun.intervalMinutes,
    reportEndpoints,
  });
};

export const PATCH: APIRoute = async ({ request }) => {
  if (!requireApiKey(request)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  let body: {
    intervalMinutes?: number;
    gluetunIntervalMinutes?: number;
    reportEndpoints?: { url: string; nodeId: string }[];
  };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }
  if (body.intervalMinutes !== undefined) {
    const n = Number(body.intervalMinutes);
    if (!Number.isFinite(n) || n < 1 || n > 60 * 24) {
      return jsonResponse({ error: 'intervalMinutes must be between 1 and 1440' }, 400);
    }
    setSetting('SPEEDARR_INTERVAL_MINUTES', String(Math.round(n)));
  }
  if (body.gluetunIntervalMinutes !== undefined) {
    const n = Number(body.gluetunIntervalMinutes);
    if (!Number.isFinite(n) || n < 1 || n > 60 * 24) {
      return jsonResponse({ error: 'gluetunIntervalMinutes must be between 1 and 1440' }, 400);
    }
    setSetting('SPEEDARR_GLUETUN_INTERVAL_MINUTES', String(Math.round(n)));
  }
  if (body.reportEndpoints !== undefined) {
    const arr = Array.isArray(body.reportEndpoints)
      ? body.reportEndpoints
          .filter((e): e is { url: string; nodeId: string } => e != null && typeof (e as { url: string }).url === 'string' && typeof (e as { nodeId: string }).nodeId === 'string')
          .map((e) => ({ url: String(e.url).trim().replace(/\/$/, ''), nodeId: String(e.nodeId).trim() }))
          .filter((e) => e.url && e.nodeId)
      : [];
    setSetting('SPEEDARR_REPORT_ENDPOINTS', JSON.stringify(arr));
  }
  restartCron();
  return jsonResponse({ ok: true });
};
