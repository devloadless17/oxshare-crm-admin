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
