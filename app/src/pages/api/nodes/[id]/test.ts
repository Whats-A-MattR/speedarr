import type { APIRoute } from 'astro';
import { validateSession } from '../../../../lib/auth.js';
import { getNodeById, updateNodeLastSeen, insertSpeedResult } from '../../../../lib/db.js';

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

export const POST: APIRoute = async ({ params, request }) => {
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
  const baseUrl = node.base_url.replace(/\/$/, '');
  const url = `${baseUrl}/api/test-now`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'X-API-Key': node.api_key, 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const text = await res.text();
      return jsonResponse({
        error: `Node returned ${res.status}: ${text.slice(0, 200)}`,
      }, 502);
    }
    const data = await res.json();
    const result = data?.result;
    if (!result || typeof result.timestamp !== 'number') {
      return jsonResponse({ error: 'Invalid response from node' }, 502);
    }
    const externalIp = result.external_ip ?? null;
    updateNodeLastSeen(id, externalIp);
    insertSpeedResult({
      timestamp: result.timestamp,
      download_mbps: result.download_mbps ?? 0,
      upload_mbps: result.upload_mbps ?? 0,
      latency_ms: result.latency_ms ?? null,
      agent_id: node.id,
      agent_name: node.name,
      external_ip: externalIp,
    });
    return jsonResponse({
      ok: true,
      result: {
        timestamp: result.timestamp,
        download_mbps: result.download_mbps,
        upload_mbps: result.upload_mbps,
        latency_ms: result.latency_ms,
        external_ip: externalIp,
      },
    });
  } catch (err) {
    return jsonResponse({
      error: (err as Error).message || 'Request to node failed',
    }, 502);
  }
};
