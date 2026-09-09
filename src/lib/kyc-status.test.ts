import { describe, expect, it } from 'vitest';
import { KYC_STATUSES, kycStatusLabel } from './kyc-status';
import { t } from '@/lib/i18n';
import { messages } from '@/lib/i18n/messages';

/**
 * The words the review desk uses for a submission's state.
 *
 * This file exists because the vocabulary has been duplicated three times and
 * drifted every time — `messages.ts` records two of the deletions in its own
 * comments ("the client list kept saying Submitted after the review desk's
 * word for it changed", "the funnel kept its own word for `submitted`"). The
 * tabs on the review queue were a fourth copy and had drifted the same way.
 *
 * So the assertions below are less about the specific words than about there
 * being exactly ONE source for them.
 */

describe('kycStatusLabel', () => {
  it('says whose move it is, for the three states that are ambiguous', () => {
    /*
     * Reported: "what is the difference between pending and needs review and
     * in progress and under review — I am a bit lost." Fair. Three of the six
     * labels described a stage without saying who was expected to act, and two
     * of them ("In progress", "Pending") sounded like the same thing while
     * meaning opposite sides of the handover.
     *
     * The client is still filling it in; the desk has not picked it up; a
     * reviewer has. Each label now names one of those three.
     */
    expect(kycStatusLabel('in_progress')).toBe('Incomplete');
    expect(kycStatusLabel('submitted')).toBe('Awaiting review');
    expect(kycStatusLabel('under_review')).toBe('In review');
  });

  it('leaves the decided states alone — they were never ambiguous', () => {
    expect(kycStatusLabel('approved')).toBe('Approved');
    expect(kycStatusLabel('rejected')).toBe('Rejected');
  });

  it('gives every known status a real label, not the raw enum value', () => {
    // The fallback below is for a status the API grows before this build
    // learns it. A SHIPPED status reaching it means a missing translation.
    for (const status of KYC_STATUSES) {
      expect(kycStatusLabel(status), `${status} has no label`).not.toBe(status.replace(/_/g, ' '));
    }
  });

  it('degrades readably for a status this build has not learned', () => {
    // Better than a blank cell or a visible `kycStatus.foo`.
    expect(kycStatusLabel('some_new_state')).toBe('some new state');
  });

  it('is the ONLY source of these words — no tab may carry its own', () => {
    /*
     * The property that keeps breaking. Four copies of this vocabulary have
     * existed; three drifted. The review queue's tabs now derive their labels
     * from `kycStatusLabel`, so a rename reaches every surface at once — and
     * the retired per-tab strings must stay retired, or the next rename
     * silently leaves the tabs behind again.
     */
    // Asserted against the message MAP rather than through `t()`: a missing
    // key returns `undefined` there, which is indistinguishable from a key
    // whose value happens to be empty.
    for (const key of [
      'kycReview.filterInProgress',
      'kycReview.filterPending',
      'kycReview.filterUnderReview',
    ]) {
      expect(
        Object.hasOwn(messages, key),
        `${key} is back — the tabs have their own copy again`,
      ).toBe(false);
    }
  });

  it('keeps a label only for the two entries that are NOT statuses', () => {
    // `needs_review` is a SET the API resolves (submitted + under_review) and
    // `all` is the absence of a filter; neither is a column value, so neither
    // can come from `kycStatusLabel`.
    expect(t('kycReview.filterNeedsReview')).toBe('Open');
    expect(t('kycReview.filterAll')).toBe('All');
  });
});
