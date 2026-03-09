import type { APIRoute } from 'astro';
import { validateSession } from '../../../lib/auth.js';

export const prerender = false;

const COOKIE_NAME = 'speedarr_session';

export const GET: APIRoute = async ({ request }) => {
  const cookie = request.headers.get('cookie') ?? '';
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  const token = match?.[1]?.trim();
  const ok = !!token && validateSession(token);
  return new Response(JSON.stringify({ loggedIn: ok }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
