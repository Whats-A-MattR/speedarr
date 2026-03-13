import type { APIRoute } from 'astro';
import { requireApiKey, validateSession } from '../../../lib/auth.js';
import { getResults } from '../../../lib/db.js';

export const prerender = false;

const COOKIE_NAME = 'speedarr_session';
function hasSession(request: Request): boolean {
  const cookie = request.headers.get('cookie') ?? '';
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  const token = match?.[1]?.trim();
  return !!token && validateSession(token);
}

export const GET: APIRoute = async ({ request, url }) => {
  if (!requireApiKey(request) && !hasSession(request)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100', 10) || 100, 500);
  const since = url.searchParams.get('since');
  const sinceTimestamp = since ? parseInt(since, 10) : undefined;
  const agentId = url.searchParams.get('agent_id') ?? undefined;
  const results = getResults(limit, sinceTimestamp, agentId || undefined);
  return new Response(JSON.stringify({ results }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
