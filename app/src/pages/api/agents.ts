import type { APIRoute } from 'astro';
import { requireApiKey } from '../../lib/auth.js';
import { validateSession } from '../../lib/auth.js';
import { getAgents } from '../../lib/db.js';

export const prerender = false;

const COOKIE_NAME = 'speedarr_session';

function hasSession(request: Request): boolean {
  const cookie = request.headers.get('cookie') ?? '';
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  const token = match?.[1]?.trim();
  return !!token && validateSession(token);
}

export const GET: APIRoute = async ({ request }) => {
  if (!requireApiKey(request) && !hasSession(request)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const agents = getAgents();
  return new Response(JSON.stringify({ agents }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
