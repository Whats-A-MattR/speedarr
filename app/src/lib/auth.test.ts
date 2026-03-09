import { describe, it, expect } from 'vitest';
import { verifyApiKey, getApiKeyFromRequest } from './auth.js';

describe('verifyApiKey', () => {
  it('returns false for empty or null key', () => {
    expect(verifyApiKey('')).toBe(false);
    expect(verifyApiKey(null)).toBe(false);
    expect(verifyApiKey(undefined)).toBe(false);
  });
});

describe('getApiKeyFromRequest', () => {
  it('reads X-API-Key header', () => {
    const req = new Request('https://x/', { headers: { 'X-API-Key': 'abc' } });
    expect(getApiKeyFromRequest(req)).toBe('abc');
  });

  it('reads Authorization Bearer', () => {
    const req = new Request('https://x/', { headers: { Authorization: 'Bearer xyz' } });
    expect(getApiKeyFromRequest(req)).toBe('xyz');
  });
});
