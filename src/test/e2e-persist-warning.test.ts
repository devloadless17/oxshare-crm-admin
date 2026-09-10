import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { persistStateIfLive } from '../../e2e/helpers';

/**
 * THE REFUSAL AND THE DAMAGE ARE THE SAME EVENT, AND IT USED TO BE SILENT.
 *
 * `e2e/fixtures.ts` re-saves the storage-state jar after any successful token
 * refresh, because renewal ROTATES the refresh token: the context holds the new
 * one and the FILE still holds the old. A test replaying the old one is exactly
 * what reuse detection punishes — the whole family is revoked and every test
 * from then on is signed out, including a later Playwright project.
 *
 * `persistStateIfLive` THROWS when the context holds no refresh cookie, and that
 * refusal is correct: writing a signed-out jar would sign out every later test.
 * But by the time it refuses, the rotation has already happened — so the token
 * left in the file is spent, and the damage is done by the same event that
 * refuses to record it.
 *
 * The fixture wrote `.catch(() => undefined)`. So a run where the persist
 * SUCCEEDED and a run where it REFUSED were indistinguishable afterwards. A
 * 22-failure portal run on 10 Sep 2026 could be inferred to this cause and never
 * diagnosed, because Playwright clears `test-results/` on each run and the
 * traces were gone before the question was asked.
 *
 * Two cases, and they cover different halves:
 *
 *   the BEHAVIOUR   the refusal happens, and nothing is written. `storageState`
 *                   throws if reached, so a version that wrote first and
 *                   validated after fails here rather than passing quietly.
 *   the WIRING      the fixture's catch is not silent. A behavioural test
 *                   cannot see that, because the catch block is in a Playwright
 *                   fixture this suite does not run — so it is asserted against
 *                   the SOURCE, which is the only thing that would catch the
 *                   `.catch(() => undefined)` coming back.
 */

describe('the e2e storage-state refusal', () => {
  it('refuses a signed-out context and writes NOTHING', async () => {
    const signedOut = {
      cookies: () => Promise.resolve([{ name: 'oxshare_crm_admin_at', value: 'still-here' }]),
      /* Reached only by a version that writes first and validates after. */
      storageState: () =>
        Promise.reject(
          new Error('storageState was reached — the jar was written before it was checked'),
        ),
    } as unknown as Parameters<typeof persistStateIfLive>[0];

    await expect(
      persistStateIfLive(signedOut, 'e2e/.auth/admin.json'),
      'a context with no refresh cookie was persisted — every later test is now signed out',
    ).rejects.toThrow(/no refresh cookie/i);
  });

  it('leaves a LIVE context alone — the refusal must not be unconditional', async () => {
    /*
     * Non-vacuous. Without this, a `persistStateIfLive` that threw on every
     * input would satisfy the case above, and the rotation would never be
     * persisted at all — which is the failure the fixture exists to prevent,
     * reached from the other side.
     */
    let wrote = '';
    const live = {
      cookies: () => Promise.resolve([{ name: 'oxshare_crm_admin_rt', value: 'a-real-token' }]),
      storageState: ({ path }: { path: string }) => {
        wrote = path;
        return Promise.resolve({});
      },
    } as unknown as Parameters<typeof persistStateIfLive>[0];

    await persistStateIfLive(live, 'e2e/.auth/admin.json');
    expect(wrote, 'a live context was refused, so no rotation is ever persisted').toBe(
      'e2e/.auth/admin.json',
    );
  });

  it('has a fixture that REPORTS the refusal rather than swallowing it', () => {
    const source = readFileSync(join(process.cwd(), 'e2e/fixtures.ts'), 'utf8');
    const at = source.indexOf('persistStateIfLive(context, storageState)');
    expect(at, 'the persist call moved — re-point this assertion at it').toBeGreaterThan(0);

    /*
     * Bounded by the END OF THE FIXTURE rather than by a character count. A
     * fixed window silently shrinks as the comment above the handler grows —
     * which it just did, and a 2000-character window reported the warning
     * missing when it was 200 characters further down. A census that fails
     * because it could not SEE the thing is the defect this codebase spent the
     * day on; it would be a poor one to build into the case that guards it.
     */
    const end = source.indexOf('{ auto: true }', at);
    expect(end, 'the fixture shape changed — re-point this assertion').toBeGreaterThan(at);
    const handler = source.slice(at, end);
    expect(
      handler.includes('console.warn'),
      'the persist failure is swallowed again. A refusal here means the jar holds a ' +
        'SPENT refresh token and the next test will trip reuse detection, signing out ' +
        'every test after it — and with nothing logged, that run is inferable and never ' +
        'diagnosable. Report it; do not throw, because failing an unrelated test for a ' +
        'fixture problem mislabels it.',
    ).toBe(true);
  });
});
