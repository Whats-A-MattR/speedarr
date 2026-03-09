import type { APIRoute } from 'astro';
import { destroySession } from '../../../lib/auth.js';

export const prerender = false;

const COOKIE_NAME = 'speedarr_session';

export const POST: APIRoute = async ({ request, redirect }) => {
  const cookie = request.headers.get('cookie') ?? '';
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  const token = match?.[1]?.trim();
  if (token) {
    destroySession(token);
  }
  return new Response(null, {
    status: 302,
    headers: {
      Location: '/login',
      'Set-Cookie': `${COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0`,
    },
  });
};
