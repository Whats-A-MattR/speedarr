import type { APIRoute } from 'astro';
import { validateSession } from '../../../lib/auth.js';
import { getGluetunConfig } from '../../../lib/config.js';
import { setSetting } from '../../../lib/config-file.js';

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
  return jsonResponse({
    address,
    hasApiKey: !!apiKey,
  });
};

export const PATCH: APIRoute = async ({ request }) => {
  if (!hasSession(request)) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (request.method !== 'PATCH') return jsonResponse({ error: 'Method not allowed' }, 405);
  let body: { address?: string; apiKey?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }
  const address = typeof body.address === 'string' ? body.address.trim().replace(/\/$/, '') : '';
  const apiKey = typeof body.apiKey === 'string' ? body.apiKey : undefined;
  setSetting('GLUETUN_ADDRESS', address);
  if (apiKey !== undefined) setSetting('GLUETUN_API_KEY', apiKey);
  return jsonResponse({ ok: true });
};
