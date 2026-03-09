import type { APIRoute } from 'astro';
import { validateSession } from '../../../lib/auth.js';
import { getGluetunConfig } from '../../../lib/config.js';
import { fetchGluetunStatusWithConfig } from '../../../lib/gluetun.js';

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

export const POST: APIRoute = async ({ request }) => {
  if (!hasSession(request)) return jsonResponse({ error: 'Unauthorized' }, 401);
  let body: { address?: string; apiKey?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }
  const address = typeof body.address === 'string' ? body.address.trim().replace(/\/$/, '') : '';
  let apiKey = typeof body.apiKey === 'string' ? body.apiKey : '';
  if (!apiKey) apiKey = getGluetunConfig().apiKey;
  if (!address) {
    return jsonResponse({ ok: false, error: 'Address is required' }, 400);
  }
  const status = await fetchGluetunStatusWithConfig(address, apiKey);
  if (!status) {
    return jsonResponse({ ok: false, error: 'Connection failed or Gluetun returned no data' }, 200);
  }
  return jsonResponse({
    ok: true,
    status: status.vpn_status,
    public_ip: status.public_ip || null,
    city: status.city,
    region: status.region,
    country: status.country,
  });
};
