import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReviewDock } from './review-dock';

/**
 * The dock a reviewer acts from — and, until now, the place a claim went to die.
 *
 * Claiming a submission was a one-way door: `submitted → under_review` had no
 * reverse, the dock hid Claim from everyone afterwards, and nothing named the
 * holder. The dock justified hiding the button with "the status pill in the
 * header already says who has it"; the pill said "In review" and nothing else.
 * So the one state where a reviewer needs to know whether to walk over to a
 * colleague or simply take the work told them neither, and offered no way out.
 */

const props = {
  loading: false,
  onApprove: vi.fn(),
  onReject: vi.fn(),
  onClaim: vi.fn(),
  onRelease: vi.fn(),
};

const claimButton = () => screen.queryByRole('button', { name: /claim/i });
const releaseButton = () => screen.queryByRole('button', { name: /hand this submission back/i });

describe('ReviewDock', () => {
  it('offers Claim on an unclaimed submission, and no way to hand back', () => {
    render(<ReviewDock {...props} status="submitted" />);
    expect(claimButton()).toBeTruthy();
    expect(releaseButton(), 'nothing to hand back — it is already in the queue').toBeNull();
  });

  it('names the holder and offers the way out once it is claimed', () => {
    render(<ReviewDock {...props} status="under_review" reviewedByName="Rita Reviewer" />);
    // Both halves matter: a name with no release leaves a colleague's absence
    // unresolvable, and a release with no name makes taking somebody's work
    // back a guess.
    expect(screen.getByText(/being reviewed by rita reviewer/i)).toBeTruthy();
    expect(releaseButton()).toBeTruthy();
    expect(claimButton(), 'a claimed submission cannot be claimed again').toBeNull();
  });

  it('says it is being reviewed even when the holder cannot be named', () => {
    /*
     * `reviewedByName` is null when the administrator who claimed it has since
     * been deleted. "Being reviewed" is still true and still useful; a blank
     * would read as a rendering fault, and the raw id would answer nobody.
     */
    render(<ReviewDock {...props} status="under_review" reviewedByName={null} />);
    expect(screen.getByText(/being reviewed$/i)).toBeTruthy();
    expect(releaseButton()).toBeTruthy();
  });

  it('hands back on click', async () => {
    const onRelease = vi.fn();
    render(
      <ReviewDock {...props} onRelease={onRelease} status="under_review" reviewedByName="Rita" />,
    );
    await userEvent.click(releaseButton()!);
    expect(onRelease).toHaveBeenCalledOnce();
  });

  it('disables every action while one is in flight', () => {
    // A second click during the request is a second write against a row whose
    // state is already moving — the exact race `transition` settles server-side.
    render(<ReviewDock {...props} loading status="under_review" reviewedByName="Rita" />);
    expect(releaseButton()).toHaveProperty('disabled', true);
  });

  it('offers neither once the submission is decided', () => {
    for (const status of ['approved', 'rejected']) {
      const { unmount } = render(<ReviewDock {...props} status={status} />);
      expect(claimButton(), `${status} still offers Claim`).toBeNull();
      expect(releaseButton(), `${status} still offers a hand back`).toBeNull();
      unmount();
    }
  });
});
