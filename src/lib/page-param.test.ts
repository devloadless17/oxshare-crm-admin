import { describe, expect, it } from 'vitest';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, limitParam, pageParam } from './page-param';

/**
 * Both of these read USER-EDITABLE TEXT out of the address bar, so the whole
 * contract is what happens to a value nobody sane would type. The rule is the
 * same for both: anything that is not a value the screen can honestly represent
 * lands on the default, because an out-of-range request is still a request for
 * a list.
 */

describe('pageParam', () => {
  it('reads a positive integer', () => {
    expect(pageParam('7')).toBe(7);
  });

  it('lands on page one for anything malformed or out of range', () => {
    // `NaN` fails `>= 1`, so the malformed cases need no separate branch — but
    // they are the reason the comparison is written that way round.
    for (const raw of ['', '0', '-3', 'abc', 'NaN', '1e9999']) {
      expect(pageParam(raw)).toBeGreaterThanOrEqual(1);
    }
    expect(pageParam('0')).toBe(1);
    expect(pageParam('abc')).toBe(1);
  });
});

describe('limitParam', () => {
  it('accepts every size the pager offers', () => {
    for (const size of PAGE_SIZES) {
      expect(limitParam(String(size))).toBe(size);
    }
  });

  /**
   * THE BUG THIS GUARDS.
   *
   * The backend caps `limit` at 100. A hand-edited or stale URL asking for more
   * would be a request the API rejects, so a link somebody saved becomes an
   * error page instead of a list.
   */
  it('refuses a size above the API cap rather than passing it through', () => {
    expect(limitParam('5000')).toBe(DEFAULT_PAGE_SIZE);
    expect(limitParam('101')).toBe(DEFAULT_PAGE_SIZE);
  });

  it('refuses a size the pager could not display, rather than guessing a near one', () => {
    /*
     * `30` deliberately does NOT become "the closest offered size". The pager
     * can only show a size it offers, so rounding to 25 while displaying 25
     * keeps the control and the request describing the same thing; snapping to
     * 25 vs 50 would be a guess about intent the selector could not represent.
     */
    expect(limitParam('30')).toBe(DEFAULT_PAGE_SIZE);
    expect(limitParam('1')).toBe(DEFAULT_PAGE_SIZE);
  });

  it('falls back for an absent or malformed value', () => {
    for (const raw of ['', 'abc', '-25', '0']) {
      expect(limitParam(raw)).toBe(DEFAULT_PAGE_SIZE);
    }
  });

  it('never returns a size outside the offered set', () => {
    // The property the call sites rely on: whatever reaches the API is a size
    // the pager can also draw in its selector.
    for (const raw of ['5000', '30', '', 'abc', '100', '10', '-1', '99']) {
      expect(PAGE_SIZES).toContain(limitParam(raw));
    }
  });
});
