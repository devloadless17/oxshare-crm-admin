import { describe, expect, it } from 'vitest';
import { CSRF_COOKIE_NAMES, CSRF_HEADER } from './client';

/**
 * The cookie names this app hardcodes, pinned from THIS side.
 *
 * They are literals because the backend is a separate repository with no shared
 * package — there is nothing to import. The backend pins the same values in
 * `test/cookie-contract.spec.ts`, so a rename fails on whichever side made it,
 * with a list of the files that must change together.
 *
 * Why it matters more than it looks: renaming a cookie compiles, passes every
 * type check (a cookie name is in no response body, so the generated OpenAPI
 * types cannot see it) and then breaks writes with no error pointing at the
 * cause — every state change comes back 403 "failed anti-forgery validation".
 *
 * ── The SESSION cookie is no longer pinned here, and that is not an omission ──
 *
 * This file used to assert which refresh cookie `proxy.ts` admitted. That gate
 * is gone: the session cookie is `__Host-` prefixed and set by the API's host,
 * so the browser locks it to that host and never sends it to this app's. The
 * frontend cannot read it, does not name it, and therefore has no contract to
 * pin. `proxy.ts` carries the account. The backend still pins it on its own
 * side, which is where the cookie is actually written.
 */

describe('the CSRF cookie this app reads', () => {
  it('is named for the ADMIN surface, prefixed spelling first', () => {
    // Preference order matters: if both somehow exist, the `__Host-` one is the
    // only one a sibling oxshare.com site could not have written.
    expect(CSRF_COOKIE_NAMES).toEqual(['__Host-oxshare_crm_admin_csrf', 'oxshare_crm_admin_csrf']);
  });

  it('sends the header the API expects', () => {
    // Express lower-cases it on arrival; the backend constant is
    // `x-oxshare-csrf`, which is the same header and looks like a mismatch.
    expect(CSRF_HEADER).toBe('X-OxShare-CSRF');
  });
});
