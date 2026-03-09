import { defineMiddleware } from 'astro:middleware';
import { env } from './lib/env.js';
import { startCron } from './lib/cron.js';

const COOKIE_NAME = 'speedarr_session';

export const onRequest = defineMiddleware(async (context, next) => {
  const url = context.url;
  const pathname = url.pathname;

  startCron();

  // Node mode: only allow /api/*
  if (env.MODE === 'node') {
    if (!pathname.startsWith('/api/')) {
      return new Response(null, { status: 404 });
    }
    return next();
  }

  // Complete mode: first run has no password — send /login to first-run
  if (pathname === '/login') {
    const { hasStoredPassword } = await import('./lib/auth.js');
    if (!hasStoredPassword()) {
      return context.redirect('/first-run');
    }
    return next();
  }

  if (pathname === '/first-run' || pathname.startsWith('/api/')) {
    return next();
  }

  // Dashboard routes: require session
  const cookie = context.request.headers.get('cookie') ?? '';
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  const token = match?.[1]?.trim();

  if (!token) {
    return context.redirect('/login');
  }

  // Validate session (need to load auth which loads db - dynamic import to avoid edge issues)
  const { validateSession } = await import('./lib/auth.js');
  if (!validateSession(token)) {
    return context.redirect('/login');
  }

  return next();
});
