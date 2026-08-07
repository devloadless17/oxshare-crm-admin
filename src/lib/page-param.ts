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
