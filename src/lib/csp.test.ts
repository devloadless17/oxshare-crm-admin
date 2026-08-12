import { afterEach, describe, expect, it, vi } from 'vitest';
import { contentSecurityPolicy } from './csp';

/**
 * `connect-src`, and specifically the WebSocket half of it.
 *
 * This is here because of how the failure presents: a socket blocked by CSP
 * throws in the browser console and nothing else happens — no request reaches
 * the server, no error surfaces in the app, and the bell simply never updates.
 * That is indistinguishable from a quiet system, which is why it needs an
 * assertion rather than a manual check somebody remembers to do.
 */

const ORIGINAL_REALTIME_ORIGIN = process.env['NEXT_PUBLIC_REALTIME_ORIGIN'];

afterEach(() => {
  vi.unstubAllEnvs();
  if (ORIGINAL_REALTIME_ORIGIN === undefined) delete process.env['NEXT_PUBLIC_REALTIME_ORIGIN'];
  else process.env['NEXT_PUBLIC_REALTIME_ORIGIN'] = ORIGINAL_REALTIME_ORIGIN;
});

/** Pull one directive out of the joined policy. */
function directive(policy: string, name: string): string {
  const found = policy.split('; ').find((part) => part.startsWith(`${name} `));
  if (!found) throw new Error(`the policy has no ${name} directive:\n${policy}`);
  return found;
}

describe('contentSecurityPolicy connect-src', () => {
  it('names the ws scheme in production, not just https', () => {
    /*
     * The trap this pins down: `connect-src` matches on SCHEME. Listing
     * `https://api.example.com` alone does NOT authorise
     * `wss://api.example.com` — same host, same port, still blocked.
     */
    process.env['NEXT_PUBLIC_REALTIME_ORIGIN'] = 'https://api.oxshare.com:3003';

    const connectSrc = directive(contentSecurityPolicy('n0nce', true), 'connect-src');

    expect(connectSrc).toContain('https://api.oxshare.com:3003');
    expect(connectSrc).toContain('wss://api.oxshare.com');
  });

  it('stays narrow — one origin, never a wildcard, in production', () => {
    // The directive's only job is to bound where a compromised dependency
    // could send a session. A wildcard here would make it decorative.
    process.env['NEXT_PUBLIC_REALTIME_ORIGIN'] = 'https://api.oxshare.com:3003';

    const connectSrc = directive(contentSecurityPolicy('n0nce', true), 'connect-src');

    expect(connectSrc).not.toContain('*');
    expect(connectSrc).not.toContain('ws:');
  });

  it('falls back to self rather than opening up when the origin is unset', () => {
    /*
     * A missing env var must break the socket, not the policy. Failing open
     * here would ship the loose dev policy to production unnoticed.
     *
     * `NODE_ENV` is stubbed because that is what makes the variable REQUIRED:
     * `env.ts` returns the localhost default outside production and throws
     * inside it, and it is the throwing branch this asserts on.
     */
    vi.stubEnv('NODE_ENV', 'production');
    delete process.env['NEXT_PUBLIC_REALTIME_ORIGIN'];

    const connectSrc = directive(contentSecurityPolicy('n0nce', true), 'connect-src');

    expect(connectSrc).toBe("connect-src 'self' 'self'");
  });

  it('allows the localhost socket in development', () => {
    // Covers both the realtime socket on :3003 and Next's own hot-reload socket.
    const connectSrc = directive(contentSecurityPolicy('n0nce', false), 'connect-src');

    expect(connectSrc).toContain('ws:');
    expect(connectSrc).toContain('http://localhost:*');
  });
});
