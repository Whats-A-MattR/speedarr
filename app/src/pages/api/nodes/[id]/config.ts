import type { APIRoute } from 'astro';
import { validateSession } from '../../../../lib/auth.js';
import { getNodeById } from '../../../../lib/db.js';

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

export const GET: APIRoute = async ({ params, request }) => {
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
  const baseUrl = node.base_url.replace(/\/$/, '');
  const url = `${baseUrl}/api/config`;
  try {
    const res = await fetch(url, {
      headers: { 'X-API-Key': node.api_key },
    });
    if (!res.ok) {
      const text = await res.text();
      return jsonResponse(
        { error: `Node returned ${res.status}: ${text.slice(0, 200)}` },
        502
      );
    }
    const data = await res.json();
    return jsonResponse(data);
  } catch (err) {
    return jsonResponse(
      { error: (err as Error).message || 'Request to node failed' },
      502
    );
  }
};

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
  if (node.blocked) {
    return jsonResponse({ error: 'Node is blocked' }, 403);
  }
  let body: { intervalMinutes?: number; reportEndpoints?: { url: string; nodeId: string }[] };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }
  const baseUrl = node.base_url.replace(/\/$/, '');
  const url = `${baseUrl}/api/config`;
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        'X-API-Key': node.api_key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return jsonResponse(
        { error: (data.error as string) || `Node returned ${res.status}` },
        res.status >= 400 && res.status < 600 ? res.status : 502
      );
    }
    return jsonResponse(data);
  } catch (err) {
    return jsonResponse(
      { error: (err as Error).message || 'Request to node failed' },
      502
    );
  }
};
