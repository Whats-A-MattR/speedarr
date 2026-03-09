import type { APIRoute } from 'astro';
import { getNodeById, insertSpeedResult } from '../../../lib/db.js';

export const prerender = false;

function jsonResponse(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Called by nodes to report a scheduled speed test result. Auth: X-API-Key must match the node's api_key for the given nodeId.
 */
export const POST: APIRoute = async ({ request }) => {
  const apiKey = request.headers.get('x-api-key') ?? request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ?? '';
  if (!apiKey) {
    return jsonResponse({ error: 'Missing X-API-Key or Authorization' }, 401);
  }

  let body: { nodeId: string; timestamp: number; download_mbps: number; upload_mbps: number; latency_ms?: number | null; external_ip?: string | null };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const { nodeId, timestamp: ts, download_mbps, upload_mbps, latency_ms, external_ip } = body;
  if (!nodeId || typeof ts !== 'number' || typeof download_mbps !== 'number' || typeof upload_mbps !== 'number') {
    return jsonResponse({ error: 'Missing or invalid: nodeId, timestamp, download_mbps, upload_mbps' }, 400);
  }

  const node = getNodeById(nodeId);
  if (!node) {
    return jsonResponse({ error: 'Node not found' }, 404);
  }
  if (node.api_key !== apiKey) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  if (node.blocked) {
    return jsonResponse({ error: 'Node is blocked' }, 403);
  }

  insertSpeedResult({
    timestamp: ts,
    download_mbps,
    upload_mbps,
    latency_ms: latency_ms ?? null,
    agent_id: node.id,
    agent_name: node.name,
    external_ip: external_ip ?? null,
  });

  return jsonResponse({ ok: true });
};
