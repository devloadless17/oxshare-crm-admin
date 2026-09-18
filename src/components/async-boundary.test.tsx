import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { AsyncBoundary } from './async-boundary';

/**
 * NEAR-TWIN of the same path in the sibling app.
 *
 * The API generates a request id, returns it in every error body, and logs it
 * alongside the failure. No screen displayed it — so a user reporting "it
 * failed" handed us nothing that could find their failure in the log, and the id
 * existed for a correlation nobody could actually make. R-6.1 asks for the id to
 * be generated AND surfaced; only the first half was built.
 */

const ERROR_WITH_ID = {
  response: { data: { message: 'Wallet unavailable.', requestId: 'req-7f21c9' } },
};

describe('AsyncBoundary on a 401', () => {
  it('paints no retry card while the interceptor is ending the session', () => {
    /*
     * A 401 that reaches a screen is one the interceptor is already acting on:
     * it refreshed, the replay still failed, and a hard navigation to sign-in
     * is in flight. "Something went wrong — Retry" in that window is the flash
     * people reported on expiry, and the button could never work.
     */
    renderWithProviders(
      <AsyncBoundary status="unauthenticated" label="Loading" endpoints={[]} onRetry={vi.fn()}>
        <p>{'never rendered'}</p>
      </AsyncBoundary>,
    );

    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/never rendered/)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

describe('AsyncBoundary error state', () => {
  it('shows the request id the API returned', () => {
    renderWithProviders(
      <AsyncBoundary
        status="error"
        label="Loading"
        endpoints={[]}
        onRetry={vi.fn()}
        errorMessage="Wallet unavailable."
        error={ERROR_WITH_ID}
      >
        <p>{'never rendered'}</p>
      </AsyncBoundary>,
    );

    expect(screen.getByText(/req-7f21c9/)).toBeInTheDocument();
    expect(screen.getByText(/Wallet unavailable\./)).toBeInTheDocument();
  });

  it('shows nothing extra when the error carries no id', () => {
    // A network failure never reached the API, so there is no id to quote.
    // Rendering "Reference: undefined" would be worse than rendering nothing.
    renderWithProviders(
      <AsyncBoundary
        status="error"
        label="Loading"
        endpoints={[]}
        onRetry={vi.fn()}
        errorMessage="Network Error"
        error={new Error('Network Error')}
      >
        <p>{'never rendered'}</p>
      </AsyncBoundary>,
    );

    expect(screen.queryByText(/Reference:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
  });

  it('still renders without the error prop at all', () => {
    // The prop is optional, so an un-migrated call site degrades to the previous
    // behaviour rather than crashing.
    renderWithProviders(
      <AsyncBoundary status="error" label="Loading" endpoints={[]} onRetry={vi.fn()}>
        <p>{'never rendered'}</p>
      </AsyncBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(/Reference:/)).not.toBeInTheDocument();
  });

  it('does not render the error branch when the resource is ready', () => {
    renderWithProviders(
      <AsyncBoundary
        status="ready"
        label="Loading"
        endpoints={[]}
        onRetry={vi.fn()}
        error={ERROR_WITH_ID}
      >
        <p>{'the children'}</p>
      </AsyncBoundary>,
    );

    // A stale error object left on a now-successful query must not leak an id
    // onto a working screen.
    expect(screen.getByText('the children')).toBeInTheDocument();
    expect(screen.queryByText(/req-7f21c9/)).not.toBeInTheDocument();
  });
});

/**
 * THE CALLER'S SENTENCE AND THE API'S, TOGETHER.
 *
 * Sixty-five screens across the two apps pass an `errorMessage` saying what
 * their own failure means, and until 10 Sep 2026 essentially none of it was
 * shown: this component rendered `apiErrorMessage(error, errorMessage ?? …)`,
 * and that helper prefers `response.data.message` — which the backend's
 * `AllExceptionsFilter` puts on EVERY error envelope. The caller's line was
 * reachable only when there was no body at all.
 *
 * The sentence that made the cost concrete is the KYC queue's: *"Failed to load
 * the review queue. This is NOT an empty queue — submissions may be waiting."*
 * Written to stop a reviewer reading an outage as a cleared backlog, written
 * for exactly the server-side case, and invisible in it.
 *
 * These pin BOTH halves, because each direction has its own way of being wrong
 * and fixing one by breaking the other is the trap: dropping the API's message
 * makes an unrecognised sort (a 400, per R-2.5, so the operator learns what they
 * got wrong) render as "Failed to load clients."
 */
describe('AsyncBoundary shows the domain sentence AND the API message', () => {
  const domainSentence = 'Failed to load the review queue. This is NOT an empty queue.';

  it("shows the caller's sentence for a 500 that carries a server message", () => {
    renderWithProviders(
      <AsyncBoundary
        status="error"
        label="Loading"
        endpoints={[]}
        onRetry={vi.fn()}
        errorMessage={domainSentence}
        error={{ response: { data: { message: 'Internal server error' } } }}
      >
        <p>{'never rendered'}</p>
      </AsyncBoundary>,
    );

    // The half that was dead. This is the regression that matters.
    expect(
      screen.getByText(domainSentence),
      "the screen's own warning is being replaced by the API's message again",
    ).toBeInTheDocument();
    // And the half that must not be lost fixing it.
    expect(screen.getByText('Internal server error')).toBeInTheDocument();
  });

  it('keeps a 400 validation message readable (R-2.5), under the context line', () => {
    /*
     * The failure this component was ORIGINALLY changed to fix, and the reason
     * the fix cannot simply be "prefer the caller's line". An unrecognised sort
     * is a 400 precisely so the operator learns what they got wrong; printing
     * only "Failed to load clients." over the top of it is a 400 with the
     * usefulness of a 500.
     */
    renderWithProviders(
      <AsyncBoundary
        status="error"
        label="Loading"
        endpoints={[]}
        onRetry={vi.fn()}
        errorMessage="Failed to load clients."
        error={{ response: { data: { message: 'sort must be one of: createdAt, email' } } }}
      >
        <p>{'never rendered'}</p>
      </AsyncBoundary>,
    );

    expect(screen.getByText('Failed to load clients.')).toBeInTheDocument();
    expect(screen.getByText(/sort must be one of/)).toBeInTheDocument();
  });

  it('does not print the same sentence twice', () => {
    // A screen whose own copy already matches what the API said should read as
    // one statement, not as an echo.
    renderWithProviders(
      <AsyncBoundary
        status="error"
        label="Loading"
        endpoints={[]}
        onRetry={vi.fn()}
        errorMessage="Wallet unavailable."
        error={{ response: { data: { message: 'Wallet unavailable.' } } }}
      >
        <p>{'never rendered'}</p>
      </AsyncBoundary>,
    );

    expect(screen.getAllByText('Wallet unavailable.')).toHaveLength(1);
  });

  it("falls back to the API's message when the caller passes no sentence", () => {
    renderWithProviders(
      <AsyncBoundary
        status="error"
        label="Loading"
        endpoints={[]}
        onRetry={vi.fn()}
        error={{ response: { data: { message: 'Rate limit exceeded.' } } }}
      >
        <p>{'never rendered'}</p>
      </AsyncBoundary>,
    );

    expect(screen.getByText('Rate limit exceeded.')).toBeInTheDocument();
  });
});

describe('AsyncBoundary on a 403', () => {
  const SCOPED_REFUSAL =
    'Reconciliation is a whole-platform integrity control. Your account is scoped to a ' +
    'client territory, and a reconciliation over part of the ledger cannot answer whether ' +
    'the ledger balances. Ask an administrator without a territory to run it.';

  it("shows the server's explanation instead of a bare denial", () => {
    /*
     * Reported as "the reconciliation page does not open" by an admin with
     * scoped tags. The endpoint refuses on purpose and says exactly why and what
     * to do — and this component threw that away for a generic "you do not have
     * permission", which reads as a broken page rather than a deliberate rule.
     */
    renderWithProviders(
      <AsyncBoundary
        status="forbidden"
        label="Loading reconciliation"
        endpoints={[]}
        onRetry={vi.fn()}
        error={{ response: { data: { message: SCOPED_REFUSAL } } }}
      >
        <p>{'never rendered'}</p>
      </AsyncBoundary>,
    );

    expect(screen.getByText(/Ask an administrator without a territory/i)).toBeInTheDocument();
    expect(screen.queryByText('never rendered')).not.toBeInTheDocument();
  });

  it('falls back to the generic sentence when the refusal carries no message', () => {
    // Most 403s are a bare permission check with nothing useful to add, and an
    // empty paragraph would be worse than the generic line.
    renderWithProviders(
      <AsyncBoundary status="forbidden" label="Loading" endpoints={[]} onRetry={vi.fn()}>
        <p>{'never rendered'}</p>
      </AsyncBoundary>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/permission|denied|not allowed/i);
  });
});
