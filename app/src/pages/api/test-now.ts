import type { APIRoute } from 'astro';
import { validateSession } from '../../lib/auth.js';
import { getSetting } from '../../lib/config-file.js';
import { runAndPersistSpeedtest } from '../../lib/speedtest.js';
import { fetchAndPersistGluetunStatus } from '../../lib/gluetun.js';

export const prerender = false;

const COOKIE_NAME = 'speedarr_session';

function hasSession(request: Request): boolean {
  const cookie = request.headers.get('cookie') ?? '';
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  const token = match?.[1]?.trim();
  return !!token && validateSession(token);
}

function hasValidApiKey(request: Request): boolean {
  const expected = getSetting('SPEEDARR_API_KEY');
  const key = request.headers.get('X-API-Key')?.trim();
  return !!expected && !!key && key === expected;
}

/** POST: run a speed test on the local node. Requires dashboard session or valid X-API-Key (for remote trigger). */
export const POST: APIRoute = async ({ request }) => {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  }
  if (!hasSession(request) && !hasValidApiKey(request)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  try {
    const result = await runAndPersistSpeedtest();
    await fetchAndPersistGluetunStatus();
    return new Response(
      JSON.stringify({
        result: {
          timestamp: result.timestamp,
          download_mbps: result.download_mbps,
          upload_mbps: result.upload_mbps,
          latency_ms: result.latency_ms,
          external_ip: result.external_ip ?? null,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
