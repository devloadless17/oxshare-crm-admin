import { describe, expect, it } from 'vitest';
import { fieldVisibility, isMasked, maskedFieldLabels } from './masking';

/**
 * RBAC-03, on the reading side.
 *
 * Nothing here is a security control — the backend omits a masked value before
 * it leaves the process (R-4.1). What these cases protect is the OPERATOR'S
 * BELIEF: "hidden from you" and "this client has none" are different answers,
 * and collapsing them into one em dash is how a compliance reviewer concludes a
 * client never gave a phone number when the truth is a fact about the
 * reviewer's own permissions.
 */

describe('isMasked', () => {
  it('is true for a key in the viewer’s mask', () => {
    expect(isMasked('client.phone', ['client.phone', 'client.email'])).toBe(true);
  });

  it('is false for a key that is not', () => {
    expect(isMasked('client.country', ['client.phone'])).toBe(false);
  });

  it('treats an absent mask as nothing hidden', () => {
    // A master admin's response carries `maskedFields: []`, and an older cached
    // response may carry none at all. Neither may render as "everything hidden".
    expect(isMasked('client.phone', undefined)).toBe(false);
    expect(isMasked('client.phone', [])).toBe(false);
  });
});

describe('fieldVisibility — three states, not two', () => {
  it('is visible when the value is present and unmasked', () => {
    expect(fieldVisibility('+961 1 000 000', 'client.phone', [])).toBe('visible');
  });

  it('is empty when the client genuinely has no value', () => {
    expect(fieldVisibility(null, 'client.phone', [])).toBe('empty');
    expect(fieldVisibility(undefined, 'client.phone', [])).toBe('empty');
    // An empty string is the same statement as null on a text field, and a
    // blank cell reading as "visible" would render nothing with no explanation.
    expect(fieldVisibility('', 'client.phone', [])).toBe('empty');
  });

  it('is masked when the viewer may not see it', () => {
    expect(fieldVisibility(undefined, 'client.phone', ['client.phone'])).toBe('masked');
  });

  it('MASKED WINS over a value that is somehow still present', () => {
    /*
     * The precedence that matters.
     *
     * If the API ever lists a field in `maskedFields` while forgetting to strip
     * it, rendering the value would be exactly the leak this feature exists to
     * prevent. The two signals disagreeing has to resolve in the safe
     * direction, not the convenient one.
     *
     * `field-masking-http.spec.ts` asserts the API never reaches that state.
     * This is what happens if it ever does.
     */
    expect(fieldVisibility('+961 1 000 000', 'client.phone', ['client.phone'])).toBe('masked');
  });

  it('does not treat a falsy-but-real value as empty', () => {
    // `0` is a verification level, and `false` is an emailVerified flag. Both
    // are answers; neither is an absence.
    expect(fieldVisibility(0, 'client.verificationLevel', [])).toBe('visible');
    expect(fieldVisibility(false, 'client.emailVerified', [])).toBe('visible');
  });
});

describe('maskedFieldLabels', () => {
  it('translates catalog keys into what the operator configured', () => {
    // An operator reading "client.phone" is being shown the database's
    // vocabulary rather than their own.
    expect(maskedFieldLabels(['client.phone'], { 'client.phone': 'Phone number' })).toEqual([
      'Phone number',
    ]);
  });

  it('falls back to the key rather than dropping an unknown field', () => {
    // A key the catalog no longer describes is still hidden, and saying "one
    // field is hidden" without naming it is worse than showing the raw key.
    expect(maskedFieldLabels(['client.gone'], {})).toEqual(['client.gone']);
  });

  it('is empty when nothing is hidden', () => {
    expect(maskedFieldLabels([], {})).toEqual([]);
    expect(maskedFieldLabels(undefined, {})).toEqual([]);
  });
});
