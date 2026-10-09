/**
 * The `?page=` parameter, read defensively.
 *
 * A page number in the URL is user-editable text, so every value that is not a
 * positive integer has to land somewhere sensible. All of them land on 1: an
 * out-of-range or malformed page is a request for a list, and page one is the
 * list. Substituting a guess — clamping to the last page, say — would need a
 * total this function does not have and cannot get.
 *
 * `parseInt`, not `Number`: the money lint rule bans `Number()` outright on the
 * API paths rather than trying to guess which strings are amounts, and it is
 * right to be blunt. A page is a small ordinal, so this says so explicitly.
 *
 * `NaN` fails `>= 1`, so the malformed cases need no separate branch — but they
 * are the reason the comparison is written this way round rather than as
 * `parsed < 1`, which `NaN` would also fail and thereby fall through to the
 * wrong side.
 */
export function pageParam(raw: string): number {
  const parsed = parseInt(raw, 10);
  return parsed >= 1 ? parsed : 1;
}

/**
 * The sizes the rows-per-page control offers on every server list.
 *
 * 25 to 500 since 9 Oct 2026 (the buyer asked for 500, and found 10 of no use).
 * A cursor page costs the server the same at any of these sizes, and the
 * DEFAULT — not the smallest option — decides how fast a list first opens.
 *
 * Taken from `components/pagination.tsx`, which builds its `<Select>` from
 * exactly these four. They are duplicated here rather than imported because the
 * pager is a client component and this module is a pure parser used to build a
 * request — but the two must agree, and `page-param.test.ts` asserts that a
 * value outside this set never reaches the API.
 */
export const PAGE_SIZES = [25, 50, 100, 250, 500] as const;

export type PageSize = (typeof PAGE_SIZES)[number];

/** What a table asks for when the URL says nothing — every list's old constant. */
export const DEFAULT_PAGE_SIZE: PageSize = 25;

/**
 * The `?limit=` parameter, read defensively — the same contract as `pageParam`.
 *
 * ── WHY THIS CLAMPS RATHER THAN PASSES THROUGH ──────────────────────────────
 *
 * `limit` is user-editable text in the address bar, and the backend caps it at
 * 100. A hand-edited `?limit=5000` passed through would be a request the API
 * rejects, so a bookmark somebody saved becomes an error page instead of a
 * list. Anything not in `PAGE_SIZES` therefore lands on the default, which is
 * the same rule `pageParam` applies to a malformed page: an out-of-range value
 * is a request for a list, and the default page size is the list.
 *
 * A NEARBY value is deliberately not substituted — `?limit=30` becomes 25 and
 * not "the closest offered size". The pager can only display a size it offers,
 * so rounding to 25 while showing 25 in the selector keeps the control and the
 * request describing the same thing; snapping 30 to 25 vs 50 would be a guess
 * about intent that the selector could not then represent.
 *
 * `parseInt`, not `Number`, for the reason `pageParam` gives: the money lint
 * rule bans `Number()` outright on these paths rather than guessing which
 * strings are amounts. A page size is a small ordinal, so this says so.
 */
export function limitParam(raw: string): PageSize {
  const parsed = parseInt(raw, 10);
  return PAGE_SIZES.find((size) => size === parsed) ?? DEFAULT_PAGE_SIZE;
}

/** Which way a cursor page walks — the API's `?dir=`. Absent: the first page, or Next. */
export type PageDir = 'prev' | 'last';
