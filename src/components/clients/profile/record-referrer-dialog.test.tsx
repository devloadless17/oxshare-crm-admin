import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { RecordReferrerDialog, refusalMessage } from './record-referrer-dialog';

/**
 * RECORDING A MISSING REFERRING PARTNER.
 *
 * The gap: `referredByIbUserId` is written at registration and nowhere else, so
 * a client who arrived on a partner's link but lost the code was attributed to
 * nobody, permanently. `resolveReferral` logs an unknown code rather than
 * refusing the signup — correctly — which means a LOST code and a TYPO'D code
 * had the identical outcome.
 *
 * These pin the two things the screen adds over the route.
 */
describe('the record-referrer dialog', () => {
  const props = {
    clientName: 'Grace Hopper',
    loading: false,
    error: '',
    onCancel: vi.fn(),
    onConfirm: vi.fn().mockResolvedValue(undefined),
  };

  it('refuses to submit an empty code', () => {
    renderWithProviders(<RecordReferrerDialog {...props} />);

    expect(screen.getByRole('button', { name: /record partner/i })).toBeDisabled();
  });

  it('sends the code TRIMMED, as support will have pasted it', async () => {
    /*
     * Support is copying out of a ticket, so leading and trailing space is the
     * normal case rather than the odd one. The API trims and upper-cases too —
     * this is not the guarantee, it is not making the operator fix whitespace to
     * get past a disabled button.
     */
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(<RecordReferrerDialog {...props} onConfirm={onConfirm} />);

    await user.type(screen.getByLabelText(/referral code/i), '  partner01  ');
    await user.click(screen.getByRole('button', { name: /record partner/i }));

    expect(onConfirm).toHaveBeenCalledWith('partner01');
  });

  it('says it does NOT backdate, before the operator commits', () => {
    /*
     * "Does this pay the partner for this client's history" is the first
     * question anybody asks, and the answer is no — `commission.service.ts`
     * reads attribution at ACCRUAL time, so this pays on deals not yet accrued
     * and restates nothing credited. Said before the click rather than in a
     * success toast, because a toast that promises backdating is a lie told
     * after the decision.
     */
    renderWithProviders(<RecordReferrerDialog {...props} />);

    expect(screen.getByText(/applies to future activity/i)).toBeInTheDocument();
  });
});

/**
 * The three refusals share a STATUS and not a MEANING, which is why the API
 * gives them separate codes. The mapping is what makes that split worth having:
 * rendered as one sentence they would buy nothing.
 */
describe('refusal sentences', () => {
  it('tells a typo apart from a suspended partner', () => {
    const unknown = refusalMessage('REFERRAL_CODE_UNKNOWN', 'fallback');
    const inactive = refusalMessage('REFERRAL_PARTNER_INACTIVE', 'fallback');

    expect(unknown).toMatch(/check the spelling/i);
    // The one that earns the split: the client was telling the TRUTH, and the
    // problem is a decision somebody made about that partner.
    expect(inactive).toMatch(/correct, but the partner/i);
    expect(inactive).not.toEqual(unknown);
  });

  it('names a self-referral rather than calling it an unknown code', () => {
    expect(refusalMessage('REFERRAL_SELF', 'fallback')).toMatch(/own referral code/i);
  });

  it("falls back to the API's own sentence for a code it has not mapped", () => {
    /*
     * A code we have not seen must stay READABLE. Swallowing it into a generic
     * message is how a new refusal becomes invisible to the operator who hit it.
     */
    expect(refusalMessage('SOMETHING_NEW', 'the API said this')).toBe('the API said this');
    expect(refusalMessage(undefined, 'no code at all')).toBe('no code at all');
  });
});
