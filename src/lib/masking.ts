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
 */
export function maskedFieldLabels(
  masked: readonly string[] | undefined,
  labels: Readonly<Record<string, string>>,
): string[] {
  return (masked ?? []).map((key) => labels[key] ?? key);
}
