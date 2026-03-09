import type { APIRoute } from 'astro';
import { validateSession } from '../../../lib/auth.js';
import { getNodes, createNode } from '../../../lib/db.js';

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
  if (!hasSession(request)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  const nodes = getNodes();
  return jsonResponse({ nodes });
};

export const POST: APIRoute = async ({ request }) => {
  if (!hasSession(request)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }
  let body: { id?: string; name?: string; base_url?: string; api_key?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }
  const id = (body.id ?? '').trim();
  const name = (body.name ?? '').trim();
  const base_url = (body.base_url ?? '').trim();
  const api_key = (body.api_key ?? '').trim();
  if (!id || !name || !base_url || !api_key) {
    return jsonResponse({
      error: 'Missing required fields: id, name, address, api_key',
    }, 400);
  }
  if (!/^[a-z0-9_-]+$/i.test(id)) {
    return jsonResponse({ error: 'id must be alphanumeric, dash, underscore only' }, 400);
  }
  try {
    createNode({ id, name, base_url, api_key });
  } catch (e) {
    const msg = (e as Error).message || 'Failed to create node';
    if (msg.includes('UNIQUE') || msg.includes('unique')) {
      return jsonResponse({ error: 'A node with this id already exists' }, 409);
    }
    return jsonResponse({ error: msg }, 500);
  }

  const dashboardOrigin = new URL(request.url).origin;
  const nodeBaseUrl = base_url.replace(/\/$/, '');
  try {
    const getRes = await fetch(`${nodeBaseUrl}/api/config`, {
      headers: { 'X-API-Key': api_key },
    });
    const existing = getRes.ok ? ((await getRes.json()) as { reportEndpoints?: { url: string; nodeId: string }[] })?.reportEndpoints ?? [] : [];
    const seen = new Set(existing.map((e) => `${e.url}|${e.nodeId}`));
    if (!seen.has(`${dashboardOrigin}|${id}`)) {
      const reportEndpoints = [...existing, { url: dashboardOrigin, nodeId: id }];
      await fetch(`${nodeBaseUrl}/api/config`, {
        method: 'PATCH',
        headers: { 'X-API-Key': api_key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportEndpoints }),
      });
    }
  } catch {
    // Node unreachable; enrollment skipped. Node is still added.
  }

  return jsonResponse({ ok: true });
};
