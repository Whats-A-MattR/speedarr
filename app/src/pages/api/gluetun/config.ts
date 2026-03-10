import type { APIRoute } from 'astro';
import { validateSession } from '../../../lib/auth.js';
import { getGluetunConfig, getGluetunPollingConfig } from '../../../lib/config.js';
import { setSetting } from '../../../lib/config-file.js';
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

export const GET: APIRoute = async ({ request }) => {
  if (!hasSession(request)) return jsonResponse({ error: 'Unauthorized' }, 401);
  const { address, apiKey } = getGluetunConfig();
  const { intervalMinutes } = getGluetunPollingConfig();
  return jsonResponse({ address, hasApiKey: !!apiKey, intervalMinutes });
};

export const PATCH: APIRoute = async ({ request }) => {
  if (!hasSession(request)) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (request.method !== 'PATCH') return jsonResponse({ error: 'Method not allowed' }, 405);
  let body: { address?: string; apiKey?: string; intervalMinutes?: number };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }
  if (typeof body.address === 'string') setSetting('GLUETUN_ADDRESS', body.address.trim().replace(/\/$/, ''));
  if (typeof body.apiKey === 'string') setSetting('GLUETUN_API_KEY', body.apiKey);
  if (typeof body.intervalMinutes === 'number' && body.intervalMinutes >= 1) {
    setSetting('SPEEDARR_GLUETUN_INTERVAL_MINUTES', String(Math.round(body.intervalMinutes)));
  }
  restartCron();
  return jsonResponse({ ok: true });
};
