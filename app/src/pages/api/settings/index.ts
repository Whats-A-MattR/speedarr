import type { APIRoute } from 'astro';
import { validateSession } from '../../../lib/auth.js';
import { getEffectiveConfig, getGluetunPollingConfig } from '../../../lib/config.js';
import { getSetting, setSetting } from '../../../lib/config-file.js';
import { restartCron } from '../../../lib/cron.js';

export const prerender = false;

const COOKIE_NAME = 'speedarr_session';

function hasSession(request: Request): boolean {
  const cookie = request.headers.get('cookie') ?? '';
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  const token = match?.[1]?.trim();
  return !!token && validateSession(token);
}

function jsonResponse(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const SETTING_KEYS = [
  'SPEEDARR_API_KEY',
  'SPEEDARR_AGENT_ID',
  'SPEEDARR_AGENT_NAME',
  'SPEEDARR_INTERVAL_MINUTES',
  'SPEEDARR_RETENTION_DAYS',
  'SPEEDARR_GLUETUN_INTERVAL_MINUTES',
] as const;

export const GET: APIRoute = async ({ request }) => {
  if (!hasSession(request)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  const config = getEffectiveConfig();
  const gluetunPolling = getGluetunPollingConfig();
  const raw: Record<string, string> = {};
  for (const k of SETTING_KEYS) {
    const v = getSetting(k);
    if (v !== null && v !== undefined) raw[k] = v;
  }
  return jsonResponse(
    {
      effective: {
        intervalMinutes: config.intervalMinutes,
        retentionDays: config.retentionDays,
        gluetunIntervalMinutes: gluetunPolling.intervalMinutes,
        apiKey: getSetting('SPEEDARR_API_KEY') ?? '',
        agentId: getSetting('SPEEDARR_AGENT_ID') ?? 'local',
        agentName: getSetting('SPEEDARR_AGENT_NAME') ?? 'Local',
      },
      raw,
    }
  );
};

export const PATCH: APIRoute = async ({ request }) => {
  if (!hasSession(request)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  if (request.method !== 'PATCH') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }
  let shouldRestartCron = false;
  for (const key of SETTING_KEYS) {
    const v = body[key];
    if (v === undefined) continue;
    if (
      key === 'SPEEDARR_INTERVAL_MINUTES' ||
      key === 'SPEEDARR_RETENTION_DAYS' ||
      key === 'SPEEDARR_GLUETUN_INTERVAL_MINUTES'
    ) {
      shouldRestartCron = true;
    }
    if (v === null || v === '') {
      setSetting(key, '');
      continue;
    }
    if (
      key === 'SPEEDARR_API_KEY' ||
      key === 'SPEEDARR_AGENT_ID' ||
      key === 'SPEEDARR_AGENT_NAME'
    ) {
      setSetting(key, String(v).trim());
    } else if (
      key === 'SPEEDARR_INTERVAL_MINUTES' ||
      key === 'SPEEDARR_RETENTION_DAYS' ||
      key === 'SPEEDARR_GLUETUN_INTERVAL_MINUTES'
    ) {
      const n = parseInt(String(v), 10);
      if (!Number.isFinite(n) || n < 0) continue;
      setSetting(key, String(n));
    }
  }
  if (shouldRestartCron) {
    restartCron();
  }
  return jsonResponse({ ok: true });
};
