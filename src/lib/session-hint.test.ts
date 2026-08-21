import { afterEach, describe, expect, it } from 'vitest';
import {
  clearSessionHint,
  hasSessionHint,
  markSessionHint,
  SESSION_HINT_COOKIE,
} from './session-hint';

/**
 * The marker `lib/api/client.ts` now asks "is there a session worth renewing?"
 *
 * It replaced `readCsrfCookie()` for that question because the CSRF cookie is
 * the API host's and is unreadable from this host in every real deployment.
 * These pin the one contract the two callers rely on: marked → true, cleared →
 * false, and nothing else on the jar can impersonate it.
 */
describe('hasSessionHint', () => {
  afterEach(() => clearSessionHint());

  it('is false on a jar that never held the marker', () => {
    expect(hasSessionHint()).toBe(false);
  });

  it('is true once the marker is written, and false once it is cleared', () => {
    markSessionHint();
    expect(hasSessionHint()).toBe(true);
    clearSessionHint();
    expect(hasSessionHint()).toBe(false);
  });

  it('does not mistake a similarly named cookie for the marker', () => {
    document.cookie = `${SESSION_HINT_COOKIE}_other=1; Path=/`;
    expect(hasSessionHint()).toBe(false);
    document.cookie = `${SESSION_HINT_COOKIE}_other=; Path=/; Max-Age=0`;
  });
});
