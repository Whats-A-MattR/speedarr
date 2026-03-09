import type { APIRoute } from 'astro';
import { requireApiKey, validateSession } from '../../../lib/auth.js';
import { startCron } from '../../../lib/cron.js';
import { getLatestResult } from '../../../lib/db.js';

export const prerender = false;

const COOKIE_NAME = 'speedarr_session';
function hasSession(request: Request): boolean {
  const cookie = request.headers.get('cookie') ?? '';
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  const token = match?.[1]?.trim();
  return !!token && validateSession(token);
}

export const GET: APIRoute = async ({ request }) => {
  startCron();
  if (!requireApiKey(request) && !hasSession(request)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const agentId = request.url ? new URL(request.url).searchParams.get('agent_id') ?? undefined : undefined;
  const result = getLatestResult(agentId || undefined);
  if (!result) {
    return new Response(JSON.stringify({ result: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(
    JSON.stringify({
      result: {
        id: result.id,
        timestamp: result.timestamp,
        download_mbps: result.download_mbps,
        upload_mbps: result.upload_mbps,
        latency_ms: result.latency_ms,
        server_id: result.server_id,
        server_name: result.server_name,
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
