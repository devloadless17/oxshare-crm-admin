import { describe, expect, it } from 'vitest';
import { API_BASE_URL } from '@/lib/env';
import { googleErrorKey, googleStartUrl } from './auth';

describe('googleStartUrl', () => {
  it('points at the API start route on the API host', () => {
    expect(googleStartUrl()).toBe(`${API_BASE_URL}/admin/auth/google/start`);
  });

  it('encodes next and invite', () => {
    const url = new URL(googleStartUrl({ next: '/kyc?a=1&b=2', invite: 'tok&x' }));
    expect(url.searchParams.get('next')).toBe('/kyc?a=1&b=2');
    expect(url.searchParams.get('invite')).toBe('tok&x');
  });
});

describe('googleErrorKey', () => {
  it('maps a known code to its sentence, an unknown one to the generic, none to null', () => {
    expect(googleErrorKey('no_account')).toBe('google.error.no_account');
    expect(googleErrorKey('<script>')).toBe('google.error.server');
    expect(googleErrorKey(null)).toBeNull();
  });
});
