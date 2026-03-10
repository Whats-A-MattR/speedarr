import type { APIRoute } from 'astro';
import { validateSession } from '../../../lib/auth.js';
import { getServiceById, upsertService, deleteService } from '../../../lib/config-file.js';
import { restartCron } from '../../../lib/cron.js';
import { clearSabnzbdLimits } from '../../../lib/sabnzbd.js';

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

export const GET: APIRoute = async ({ request, params }) => {
  if (!hasSession(request)) return jsonResponse({ error: 'Unauthorized' }, 401);
  const service = getServiceById(params.id ?? '');
  if (!service) return jsonResponse({ error: 'Not found' }, 404);
  return jsonResponse({ service: { ...service, apiKey: service.apiKey ? '••••••••' : '' } });
};

export const PATCH: APIRoute = async ({ request, params }) => {
  if (!hasSession(request)) return jsonResponse({ error: 'Unauthorized' }, 401);
  const existing = getServiceById(params.id ?? '');
  if (!existing) return jsonResponse({ error: 'Not found' }, 404);
  const service = { ...existing };

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  if (typeof body.name === 'string' && body.name.trim()) service.name = body.name.trim();
  if (typeof body.connectionId === 'string' && body.connectionId.trim()) {
    service.connectionId = body.connectionId.trim();
  }
  if (typeof body.url === 'string') service.url = body.url.trim().replace(/\/$/, '');
  // Preserve masked placeholders, but allow explicit clearing with an empty string.
  if (typeof body.apiKey === 'string' && !body.apiKey.startsWith('•')) {
    service.apiKey = body.apiKey;
  }
  if (typeof body.enabled === 'boolean') service.enabled = body.enabled;
  if (typeof body.killSwitchEnabled === 'boolean') service.killSwitchEnabled = body.killSwitchEnabled;
  if (typeof body.vpnServiceId === 'string') service.vpnServiceId = body.vpnServiceId;
  if (typeof body.speedtestLimitEnabled === 'boolean') service.speedtestLimitEnabled = body.speedtestLimitEnabled;
  if (typeof body.speedtestLimitPercent === 'number') {
    service.speedtestLimitPercent = Math.max(1, Math.min(100, Math.round(body.speedtestLimitPercent)));
  }
  if (typeof body.scheduleEnabled === 'boolean') service.scheduleEnabled = body.scheduleEnabled;
  if (typeof body.schedule === 'string') service.schedule = body.schedule;
  if (typeof body.scheduleDefaultLimit === 'number') {
    service.scheduleDefaultLimit = Math.max(0, Math.min(100, Math.round(body.scheduleDefaultLimit)));
  }
  if (typeof body.pollIntervalMinutes === 'number') {
    service.pollIntervalMinutes = Math.max(1, Math.min(1440, Math.round(body.pollIntervalMinutes)));
  }

  const shouldResetRemote =
    existing.type === 'sabnzbd' &&
    !!existing.url &&
    !!existing.apiKey &&
    (
      existing.url !== service.url ||
      existing.apiKey !== service.apiKey ||
      existing.enabled !== service.enabled ||
      existing.speedtestLimitEnabled !== service.speedtestLimitEnabled ||
      existing.speedtestLimitPercent !== service.speedtestLimitPercent ||
      existing.scheduleEnabled !== service.scheduleEnabled ||
      existing.schedule !== service.schedule ||
      existing.scheduleDefaultLimit !== service.scheduleDefaultLimit
    );
  if (shouldResetRemote) {
    await clearSabnzbdLimits(existing.url, existing.apiKey);
  }

  upsertService(service);
  restartCron();
  return jsonResponse({ ok: true });
};

export const DELETE: APIRoute = async ({ request, params }) => {
  if (!hasSession(request)) return jsonResponse({ error: 'Unauthorized' }, 401);
  const service = getServiceById(params.id ?? '');
  if (!service) return jsonResponse({ error: 'Not found' }, 404);
  if (service.type === 'sabnzbd' && service.url && service.apiKey) {
    await clearSabnzbdLimits(service.url, service.apiKey);
  }
  deleteService(params.id ?? '');
  restartCron();
  return jsonResponse({ ok: true });
};
