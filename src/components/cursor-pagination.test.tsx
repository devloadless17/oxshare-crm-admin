import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { CursorPagination } from './cursor-pagination';

/**
 * The footer under every paginated list.
 *
 * It had no test, which is how it shipped reading **"Page {number} 1"** on every
 * screen in the app — `t('pagination.page')` called without its interpolation
 * object, with the number concatenated beside it. `data-table.tsx` renders this
 * component, so the clients, KYC, partners and withdrawals tables all carried it,
 * as did /ledger and /audit-log directly.
 *
 * The scan in `lib/i18n/i18n.test.ts` now catches that class structurally. This
 * file pins what a person actually reads.
 */

const props = {
  pageSize: 25,
  showing: 5,
  canGoBack: false,
  canGoForward: false,
  onBack: vi.fn(),
  onNext: vi.fn(),
};

describe('what the footer says', () => {
  it('says "10,000+" when the server stopped counting, grouped in the reader\'s locale', () => {
    // Totals stop at 10,000 so counting costs the same at any size (9 Oct 2026).
    renderWithProviders(<CursorPagination {...props} showing={25} total={10000} totalCapped />);
    expect(screen.getByText(/of 10,000\+/)).toBeInTheDocument();
  });

  it('leaves no unsubstituted placeholder anywhere in the footer', () => {
    // Broader than the line above: any `{word}` surviving to the DOM is a
    // translation call that lost its values, wherever it came from.
    const { container } = renderWithProviders(
      <CursorPagination {...props} showing={5} total={140} />,
    );

    expect(container.textContent ?? '').not.toMatch(/\{[a-zA-Z_][a-zA-Z0-9_]*\}/);
  });

  it('counts what is on THIS page when no total is known', () => {
    // Cursor paging cannot know the total without a full scan, so the honest
    // number is the row count of the page in front of you.
    renderWithProviders(<CursorPagination {...props} showing={5} />);
    expect(screen.getByText(/showing 5 entries/i)).toBeInTheDocument();
  });

  it('uses the singular noun for exactly one row', () => {
    // Count/noun agreement is the reason these are single keys rather than
    // concatenated fragments.
    renderWithProviders(<CursorPagination {...props} showing={1} />);
    expect(screen.getByText(/showing 1 entry/i)).toBeInTheDocument();
  });

  it('shows the total when the caller supplied one', () => {
    renderWithProviders(<CursorPagination {...props} showing={25} total={140} />);
    expect(screen.getByText(/of 140/i)).toBeInTheDocument();
  });

  it('takes the caller’s noun, so a client list does not say "entries"', () => {
    renderWithProviders(<CursorPagination {...props} showing={5} noun={['client', 'clients']} />);
    expect(screen.getByText(/showing 5 clients/i)).toBeInTheDocument();
  });
});

describe('navigation', () => {
  it('disables both directions at the end of a single-page list', () => {
    renderWithProviders(<CursorPagination {...props} />);
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });

  it('moves forward only when there is somewhere to go', async () => {
    const onNext = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<CursorPagination {...props} canGoForward onNext={onNext} />);

    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('hides the page-size control when the caller cannot act on it', () => {
    // `onPageSizeChange` is optional and this used to render regardless, so on
    // /ledger and /audit-log — neither of which passes it — an operator could
    // choose 50 rows and watch the list stay at 25. A dropdown that silently
    // does nothing is worse than no dropdown; it reads as a broken page.
    renderWithProviders(<CursorPagination {...props} />);

    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByText(/rows per page/i)).toBeNull();
  });

  it('offers it when the caller does handle it, and reports the new size', async () => {
    const onPageSizeChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<CursorPagination {...props} onPageSizeChange={onPageSizeChange} />);

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: '50' }));

    expect(onPageSizeChange).toHaveBeenCalledWith(50);
  });

  it('goes to the First and Last page when the caller offers them', async () => {
    const onFirst = vi.fn();
    const onLast = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <CursorPagination {...props} canGoBack canGoForward onFirst={onFirst} onLast={onLast} />,
    );

    await user.click(screen.getByRole('button', { name: /first page/i }));
    await user.click(screen.getByRole('button', { name: /last page/i }));
    expect(onFirst).toHaveBeenCalledTimes(1);
    expect(onLast).toHaveBeenCalledTimes(1);
  });

  it("offers 500 rows a page — the buyer's ask — and no 10", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CursorPagination {...props} onPageSizeChange={vi.fn()} />);

    await user.click(screen.getByRole('combobox'));
    expect(await screen.findByRole('option', { name: '500' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '10' })).toBeNull();
  });
});
