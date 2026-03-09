import type { APIRoute } from 'astro';
import { validateSession } from '../../../lib/auth.js';
import { getNodeById, updateNode, deleteNode } from '../../../lib/db.js';

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

export const PATCH: APIRoute = async ({ params, request }) => {
  if (!hasSession(request)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  const id = params.id;
  if (!id) {
    return jsonResponse({ error: 'Missing node id' }, 400);
  }
  const node = getNodeById(id);
  if (!node) {
    return jsonResponse({ error: 'Node not found' }, 404);
  }
  let body: { name?: string; base_url?: string; api_key?: string; blocked?: boolean };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }
  const updates: { name?: string; base_url?: string; api_key?: string; blocked?: boolean } = {};
  if (body.name !== undefined) updates.name = String(body.name).trim();
  if (body.base_url !== undefined) updates.base_url = String(body.base_url).trim();
  if (body.api_key !== undefined) updates.api_key = String(body.api_key).trim();
  if (typeof body.blocked === 'boolean') updates.blocked = body.blocked;
  updateNode(id, updates);
  return jsonResponse({ ok: true });
};

export const DELETE: APIRoute = async ({ params, request }) => {
  if (!hasSession(request)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  const id = params.id;
  if (!id) {
    return jsonResponse({ error: 'Missing node id' }, 400);
  }
  const node = getNodeById(id);
  if (!node) {
    return jsonResponse({ error: 'Node not found' }, 404);
  }
  deleteNode(id);
  return jsonResponse({ ok: true });
};
