import type { APIRoute } from 'astro';
import { randomBytes } from 'node:crypto';
import { validateSession } from '../../../lib/auth.js';
import { getServices, upsertService } from '../../../lib/config-file.js';
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
  const services = getServices().map((s) => ({ ...s, apiKey: s.apiKey ? '••••••••' : '' }));
  return jsonResponse({ services });
};

export const POST: APIRoute = async ({ request }) => {
  if (!hasSession(request)) return jsonResponse({ error: 'Unauthorized' }, 401);
  let body: {
    type?: string;
    name?: string;
    connectionId?: string;
    url?: string;
    apiKey?: string;
    pollIntervalMinutes?: number;
  };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }
  const type = typeof body.type === 'string' ? body.type : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const connectionId =
    typeof body.connectionId === 'string' && body.connectionId.trim()
      ? body.connectionId.trim()
      : 'default';
  if (!type || !name) return jsonResponse({ error: 'type and name are required' }, 400);
  if (type !== 'sabnzbd' && type !== 'gluetun') {
    return jsonResponse({ error: 'Unsupported type' }, 400);
  }
  const service = {
    id: randomBytes(8).toString('hex'),
    type: type as 'sabnzbd' | 'gluetun',
    name,
    connectionId,
    url: typeof body.url === 'string' ? body.url.trim().replace(/\/$/, '') : '',
    apiKey: typeof body.apiKey === 'string' ? body.apiKey : '',
    enabled: true,
    killSwitchEnabled: false,
    vpnServiceId: '',
    speedtestLimitEnabled: false,
    speedtestLimitPercent: 80,
    scheduleEnabled: false,
    schedule: '[]',
    scheduleDefaultLimit: 0,
    pollIntervalMinutes:
      typeof body.pollIntervalMinutes === 'number' && body.pollIntervalMinutes >= 1
        ? Math.round(body.pollIntervalMinutes)
        : 5,
  };
  upsertService(service);
  restartCron();
  return jsonResponse({ service: { ...service, apiKey: service.apiKey ? '••••••••' : '' } }, 201);
};
