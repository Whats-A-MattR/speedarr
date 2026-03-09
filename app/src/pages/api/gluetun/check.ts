import type { APIRoute } from 'astro';
import { validateSession } from '../../../lib/auth.js';
import { getGluetunConfig } from '../../../lib/config.js';
import { fetchAndPersistGluetunStatus } from '../../../lib/gluetun.js';
import { getLatestGluetunStatus } from '../../../lib/db.js';

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

/** POST: trigger a Gluetun poll now (fetch status and persist). Returns the new status. */
export const POST: APIRoute = async ({ request }) => {
  if (!hasSession(request)) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  if (!getGluetunConfig().address) {
    return jsonResponse({ error: 'Gluetun not configured' }, 400);
  }
  try {
    await fetchAndPersistGluetunStatus();
    const latest = getLatestGluetunStatus();
    return jsonResponse({ ok: true, status: latest });
  } catch (err) {
    return jsonResponse({
      ok: false,
      error: (err as Error).message || 'Gluetun check failed',
    }, 500);
  }
};
