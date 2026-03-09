import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { env } from './env.js';
import { getDb } from './db.js';
import { getSetting, setSetting } from './config-file.js';

const SALT_LEN = 16;
const KEY_LEN = 64;
const SESSION_TOKEN_LEN = 32;
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Constant-time comparison for API key to prevent timing attacks.
 */
export function verifyApiKey(provided: string | null | undefined): boolean {
  const expected = getSetting('SPEEDARR_API_KEY');
  if (!expected || expected.length === 0) return false;
  if (!provided || typeof provided !== 'string') return false;
  if (provided.length !== expected.length) return false;
  let result = 0;
  for (let i = 0; i < expected.length; i++) {
    result |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Get API key from request: X-API-Key header or Authorization: Bearer <key>
 */
export function getApiKeyFromRequest(request: Request): string | null {
  const keyHeader = request.headers.get('x-api-key');
  if (keyHeader) return keyHeader;
  const auth = request.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim();
  return null;
}

export function requireApiKey(request: Request): boolean {
  return verifyApiKey(getApiKeyFromRequest(request));
}

// --- Dashboard password (first-run or env) ---

function hashPassword(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_LEN);
}

export function setPassword(password: string): void {
  const salt = randomBytes(SALT_LEN);
  const hash = hashPassword(password, salt);
  setSetting('password_salt', salt.toString('base64'));
  setSetting('password_hash', hash.toString('base64'));
}

export function verifyPassword(password: string): boolean {
  const saltB64 = getSetting('password_salt');
  const hashB64 = getSetting('password_hash');
  if (!saltB64 || !hashB64) return false;
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');
  const actual = hashPassword(password, salt);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Get effective password: env takes precedence, else we need first-run flow. */
export function hasStoredPassword(): boolean {
  if (env.SPEEDARR_PASSWORD) return true;
  return !!getSetting('password_hash');
}

/** Check login: env password or stored hash. */
export function checkPassword(password: string): boolean {
  if (env.SPEEDARR_PASSWORD && env.SPEEDARR_PASSWORD === password) return true;
  return verifyPassword(password);
}

/** Generate a random password for first-run. Returns plain password. */
export function generateFirstRunPassword(): string {
  return randomBytes(16).toString('base64url').slice(0, 24);
}

// --- Session (cookie) ---

export function createSession(): string {
  const token = randomBytes(SESSION_TOKEN_LEN).toString('base64url');
  getDb().prepare('INSERT INTO sessions (token, created_at) VALUES (?, ?)').run(token, Date.now());
  return token;
}

export function validateSession(token: string | null | undefined): boolean {
  if (!token) return false;
  const row = getDb().prepare('SELECT 1 FROM sessions WHERE token = ? AND created_at > ?').get(
    token,
    Date.now() - SESSION_MAX_AGE_MS
  );
  return !!row;
}

export function destroySession(token: string): void {
  getDb().prepare('DELETE FROM sessions WHERE token = ?').run(token);
}
