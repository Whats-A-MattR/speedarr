import type { APIRoute } from 'astro';
import { checkPassword, createSession, hasStoredPassword } from '../../../lib/auth.js';

export const prerender = false;

const COOKIE_NAME = 'speedarr_session';
const COOKIE_OPTS = 'Path=/; HttpOnly; SameSite=Lax; Max-Age=604800'; // 7 days

function setSessionCookie(token: string): string {
  return `${COOKIE_NAME}=${token}; ${COOKIE_OPTS}`;
}

export const POST: APIRoute = async ({ request, redirect }) => {
  // First run: no password set yet — should have come from /first-run; send back there
  if (!hasStoredPassword()) {
    return redirect('/first-run', 302);
  }

  const form = await request.formData();
  const password = (form.get('password') as string)?.trim();

  if (!password) {
    return redirect('/login?error=missing', 302);
  }

  if (!checkPassword(password)) {
    return redirect('/login?error=invalid', 302);
  }

  const token = createSession();
  return new Response(null, {
    status: 302,
    headers: {
      Location: '/',
      'Set-Cookie': setSessionCookie(token),
    },
  });
};
