import type { APIRoute } from 'astro';
import { validateSession } from '../../../../lib/auth.js';
import { getServiceById } from '../../../../lib/config-file.js';
import { testSabnzbdConnection } from '../../../../lib/sabnzbd.js';
import { fetchGluetunStatusWithConfig } from '../../../../lib/gluetun.js';

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

export const POST: APIRoute = async ({ request, params }) => {
  if (!hasSession(request)) return jsonResponse({ error: 'Unauthorized' }, 401);

  const service = getServiceById(params.id ?? '');
  if (!service) return jsonResponse({ error: 'Not found' }, 404);

  // Allow overriding url/apiKey from body (for testing before saving)
  let body: { url?: string; apiKey?: string } = {};
  try {
    body = await request.json();
  } catch { /* use saved config */ }

  const url = typeof body.url === 'string' && body.url ? body.url.trim().replace(/\/$/, '') : service.url;
  const apiKey =
    typeof body.apiKey === 'string' && body.apiKey && !body.apiKey.startsWith('•')
      ? body.apiKey
      : service.apiKey;

  if (service.type === 'sabnzbd') {
    return jsonResponse(await testSabnzbdConnection(url, apiKey));
  }

  if (service.type === 'gluetun') {
    const status = await fetchGluetunStatusWithConfig(url, apiKey);
    if (!status) {
      return jsonResponse({ ok: false, error: 'Service check failed or Gluetun returned no data' });
    }
    return jsonResponse({
      ok: true,
      status: status.vpn_status,
      public_ip: status.public_ip || null,
      city: status.city,
      region: status.region,
      country: status.country,
    });
  }

  return jsonResponse({ ok: false, error: `Unsupported type: ${service.type}` });
};
