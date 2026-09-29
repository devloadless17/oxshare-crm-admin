/**
 * RBAC-03 field masking, on the reading side.
 *
 * The backend is what ENFORCES this: a masked field is omitted from the
 * response before it leaves the process, and `maskedFields` on the response
 * says which (R-4.1 — the backend enforces, the frontend only hides). Nothing
 * here is a security control. What it is for is telling the operator the truth
 * about WHY a value is not on screen.
 *
 * ── The distinction this whole file exists to preserve ──────────────────────
 *
 * "Hidden from you" and "this client has none" are different answers, and
 * collapsing them into one em dash is the failure mode. A compliance reviewer
 * looking at a client with a blank phone number concludes the client never gave
 * one — a statement about the client — when the truth is a statement about the
 * reviewer's own permissions. That is how someone acts on the wrong belief.
 *
 * So a field has THREE states here, not two, and the components downstream
 * render all three differently.
 */

export type FieldVisibility = 'visible' | 'masked' | 'empty';

/** Whether this catalog key is hidden from the current viewer. */
export function isMasked(field: string, masked: readonly string[] | undefined): boolean {
  return masked?.includes(field) ?? false;
}

/**
 * Which of the three states a field is in.
 *
 * `masked` WINS over a present value, deliberately. If the backend ever lists a
 * field in `maskedFields` while forgetting to strip it, rendering the value
 * would be exactly the leak this feature exists to prevent — so the two signals
 * disagreeing resolves in the safe direction rather than the convenient one.
 * The `field-masking-http.spec.ts` suite asserts the API never gets into that
 * state; this is what happens if it ever does.
 */
export function fieldVisibility(
  value: unknown,
  field: string,
  masked: readonly string[] | undefined,
): FieldVisibility {
  if (isMasked(field, masked)) return 'masked';
  if (value === null || value === undefined || value === '') return 'empty';
  return 'visible';
}

/**
 * A readable list of what is hidden, for the banner above a table.
 *
 * Labels rather than raw keys: `client.phone` is a catalog key, and an operator
 * reading "2 fields are hidden: client.phone, client.email" is being shown the
 * database's vocabulary rather than their own.
 *
 * ⚠️ It said that and did the opposite. The fallback was `labels[key] ?? key`,
 * so any key the caller's map did not know printed raw — and `maskedFields`
 * carries the catalog's ALIASES, which exist to strip the same person from
 * OTHER responses. Hiding a client's first name produced:
 *
 *   "Some columns are hidden by your permissions: Name,
 *    client.referrer.firstName, client.referredClients.firstName"
 *
 * Two of those three are not columns of this table and name nothing an
 * operator can see. Reported from the running console.
 *
 * So an unlabelled key is DROPPED rather than printed. The map is per-screen
 * and lists exactly the columns that screen can hide; a key outside it is
 * either an alias about a different response or a column this table does not
 * render, and in both cases the honest banner does not mention it.
 *
 * Deduplicated for the same reason: `client.firstName` and `client.lastName`
 * both label as "Name", and "hidden: Name, Name" reads as a bug in the
 * console rather than a fact about permissions.
 */
export function maskedFieldLabels(
  masked: readonly string[] | undefined,
  labels: Readonly<Record<string, string>>,
): string[] {
  const seen = new Set<string>();
  const unlabelled: string[] = [];
  for (const key of masked ?? []) {
    const label = labels[key];
    if (label === undefined) unlabelled.push(key);
    else seen.add(label);
  }
  /*
   * The earlier version PRINTED these, reasoning that "saying one field is
   * hidden without naming it is worse than showing the raw key". The concern
   * was right and the remedy was not: the keys it printed were catalog
   * ALIASES, so the banner named fields that are not on the screen at all.
   *
   * Warning in development keeps the concern — a column this screen really
   * does hide, whose key the map forgot, is now noisy for the DEVELOPER
   * instead of for the operator. Same shape as `assertPermissionKeysExist`.
   */
  if (process.env.NODE_ENV === 'development' && unlabelled.length > 0) {
    console.warn(
      `[masking] no label for hidden field(s): ${unlabelled.join(', ')}. ` +
        'If any of these is a COLUMN this screen renders, add it to the ' +
        "screen's FIELD_LABELS map — otherwise it is a catalog alias and is " +
        'correctly not announced here.',
    );
  }
  return [...seen];
}

/**
 * The fields a role or an administrator can actually be asked to hide — what
 * the field-visibility pickers list.
 *
 * Unmaskable fields (the Portal ID, client type, account status, verification
 * level, payout destination…) are LEFT OUT rather than shown disabled (the
 * owner, 29 Sep 2026): a list of boxes nobody can tick is noise between the
 * ones that matter. The server still refuses them (`assertMaskable`).
 */
export function maskableFields<F extends { maskable: boolean }>(
  catalog: Record<string, { fields: F[] }>,
): F[] {
  return Object.values(catalog)
    .flatMap((group) => group.fields)
    .filter((field) => field.maskable);
}
