import type { APIRoute } from 'astro';
import { validateSession } from '../../../lib/auth.js';
import { getConnections, upsertConnection } from '../../../lib/config-file.js';

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
  const networkGroups = getConnections();
  return jsonResponse({ connections: networkGroups, networkGroups });
};

export const POST: APIRoute = async ({ request }) => {
  if (!hasSession(request)) return jsonResponse({ error: 'Unauthorized' }, 401);
  let body: { id?: string; name?: string; nodeIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const id = typeof body.id === 'string' ? body.id.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!id) return jsonResponse({ error: 'Network group ID is required' }, 400);
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) {
    return jsonResponse({ error: 'Network group ID may only contain letters, numbers, dot, underscore, and dash' }, 400);
  }
  if (getConnections().some((conn) => conn.id === id)) {
    return jsonResponse({ error: 'Network group ID already exists' }, 409);
  }

  const nodeIds = Array.isArray(body.nodeIds)
    ? [...new Set(body.nodeIds.filter((nodeId): nodeId is string => typeof nodeId === 'string').map((nodeId) => nodeId.trim()).filter(Boolean))]
    : [];

  upsertConnection({ id, name: name || id, nodeIds });
  const networkGroup = { id, name: name || id, nodeIds };
  return jsonResponse({ connection: networkGroup, networkGroup }, 201);
};
