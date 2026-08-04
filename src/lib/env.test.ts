import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import { ConfigError, requireAbsoluteUrl, resolveServerBaseUrl } from './env';

/**
 * TWIN of the same path in the sibling app.
 *
 * The backend refuses to boot on bad config. The frontends were the half of that
 * rule nobody had implemented: an unset `NEXT_PUBLIC_API_BASE_URL` fell back to
 * localhost, so a deployment that forgot it started perfectly and then talked to
 * the wrong place.
 */

const ORIGINAL = process.env.NEXT_PUBLIC_API_BASE_URL;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

function setNodeEnv(value: string) {
  // NODE_ENV is readonly in the Next type surface; the test genuinely needs to
  // exercise both branches, and the assignment is undone in afterEach.
  (process.env as Record<string, string | undefined>).NODE_ENV = value;
}

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_API_BASE_URL;
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
  else process.env.NEXT_PUBLIC_API_BASE_URL = ORIGINAL;
  setNodeEnv(ORIGINAL_NODE_ENV ?? 'test');
});

describe('server API base URL', () => {
  it('refuses to resolve in production when the variable is unset', () => {
    setNodeEnv('production');

    // The whole point: loud at startup rather than a connection refused at the
    // first server-rendered request, or — worse — a success against whatever
    // else happens to be listening on 3001.
    expect(() => resolveServerBaseUrl()).toThrow(ConfigError);
    expect(() => resolveServerBaseUrl()).toThrow(/required in production/);
  });

  it('treats an empty or whitespace value as unset', () => {
    setNodeEnv('production');
    for (const value of ['', '   ']) {
      process.env.NEXT_PUBLIC_API_BASE_URL = value;
      expect(() => resolveServerBaseUrl(), JSON.stringify(value)).toThrow(ConfigError);
    }
  });

  it('keeps the localhost default in development, where it is correct', () => {
    setNodeEnv('development');

    // `npm run dev` works with no .env, which the three-terminal workflow
    // depends on. The bug was applying that convenience to production, not the
    // convenience itself.
    expect(resolveServerBaseUrl()).toBe('http://localhost:3001');
  });

  it('uses a configured value in every environment', () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.oxshare.test';
    for (const env of ['development', 'production']) {
      setNodeEnv(env);
      expect(resolveServerBaseUrl(), env).toBe('https://api.oxshare.test');
    }
  });

  it('rejects a configured value that is not an absolute URL', () => {
    setNodeEnv('production');
    // A relative value resolves against whatever origin the server renders
    // from — the same "works locally, wrong in production" class of bug.
    for (const value of ['/api', 'api.example.com', 'not a url']) {
      process.env.NEXT_PUBLIC_API_BASE_URL = value;
      expect(() => resolveServerBaseUrl(), value).toThrow(ConfigError);
    }
  });

  it('rejects a non-http scheme', () => {
    expect(() => requireAbsoluteUrl('ftp://api.example.com', 'X')).toThrow(/http or https/);
  });

  it('trims a trailing slash, which would otherwise produce a double slash', () => {
    // axios joins against a path that already starts with one, and
    // `//admin/auth/login` does not route.
    expect(requireAbsoluteUrl('https://api.example.com/', 'X')).toBe('https://api.example.com');
    expect(requireAbsoluteUrl('https://api.example.com///', 'X')).toBe('https://api.example.com');
  });
});
