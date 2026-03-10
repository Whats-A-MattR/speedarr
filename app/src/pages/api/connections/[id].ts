import type { APIRoute } from 'astro';
import { validateSession } from '../../../lib/auth.js';
import {
  deleteConnectionAndReassignServices,
  getConnections,
  upsertConnection,
} from '../../../lib/config-file.js';
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

export const PATCH: APIRoute = async ({ request, params }) => {
  if (!hasSession(request)) return jsonResponse({ error: 'Unauthorized' }, 401);
  const id = (params.id ?? '').trim();
  const existing = getConnections().find((connection) => connection.id === id);
  if (!existing) return jsonResponse({ error: 'Not found' }, 404);

  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return jsonResponse({ error: 'Connection name is required' }, 400);

  upsertConnection({ id, name });
  return jsonResponse({ ok: true });
};

export const DELETE: APIRoute = async ({ request, params }) => {
  if (!hasSession(request)) return jsonResponse({ error: 'Unauthorized' }, 401);
  const id = (params.id ?? '').trim();
  if (!id) return jsonResponse({ error: 'Missing connection id' }, 400);
  if (id === 'default') return jsonResponse({ error: 'Default connection cannot be deleted' }, 400);
  const existing = getConnections().find((connection) => connection.id === id);
  if (!existing) return jsonResponse({ error: 'Not found' }, 404);

  deleteConnectionAndReassignServices(id);
  restartCron();
  return jsonResponse({ ok: true });
};
