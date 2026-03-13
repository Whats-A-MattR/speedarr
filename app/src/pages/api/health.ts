import type { APIRoute } from 'astro';
import { getDb } from '../../lib/db.js';
import { env } from '../../lib/env.js';
import { ensureNodeConfigWithApiKey } from '../../lib/config-file.js';

export const prerender = false;

export const GET: APIRoute = async () => {
  if (env.MODE === 'node') {
    ensureNodeConfigWithApiKey();
  }
  try {
    getDb();
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
  return new Response(
    JSON.stringify({
      ok: true,
      mode: env.MODE,
      version: env.APP_VERSION,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
