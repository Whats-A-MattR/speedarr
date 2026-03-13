import type { APIRoute } from 'astro';
import { getConnections } from '../../../lib/config-file.js';
import {
  createNode,
  getNodeByApiKey,
  getNodeById,
  insertSpeedResult,
  updateNode,
  updateNodeLastSeen,
} from '../../../lib/db.js';

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

  let body: {
    nodeId: string;
    timestamp: number;
    download_mbps: number;
    upload_mbps: number;
    latency_ms?: number | null;
    external_ip?: string | null;
    agent_name?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const { nodeId, timestamp: ts, download_mbps, upload_mbps, latency_ms, external_ip, agent_name } = body;
  if (!nodeId || typeof ts !== 'number' || typeof download_mbps !== 'number' || typeof upload_mbps !== 'number') {
    return jsonResponse({ error: 'Missing or invalid: nodeId, timestamp, download_mbps, upload_mbps' }, 400);
  }

  let node = getNodeById(nodeId);
  if (!node) {
    // If node id changed on the node instance but key is still known, accept the report.
    node = getNodeByApiKey(apiKey);
  }
  if (!node) {
    // Self-heal if the node id is configured on any network group but node row is missing.
    const configuredNodeIds = new Set(
      getConnections().flatMap((connection) => connection.nodeIds ?? [])
    );
    if (configuredNodeIds.has(nodeId)) {
      const displayName = typeof agent_name === 'string' && agent_name.trim() ? agent_name.trim() : nodeId;
      try {
        createNode({
          id: nodeId,
          name: displayName,
          base_url: '',
          api_key: apiKey,
        });
      } catch {
        // Node may have been created by a concurrent report.
      }
      node = getNodeById(nodeId);
    }
  }
  if (!node) {
    return jsonResponse({ error: 'Node not found' }, 404);
  }
  if (node.api_key !== apiKey) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  if (node.blocked) {
    return jsonResponse({ error: 'Node is blocked' }, 403);
  }
  if (
    typeof agent_name === 'string' &&
    agent_name.trim() &&
    node.name !== agent_name.trim()
  ) {
    updateNode(node.id, { name: agent_name.trim() });
    node = getNodeById(node.id) ?? node;
  }
  updateNodeLastSeen(node.id, external_ip ?? null);

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
