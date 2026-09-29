import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { DataTable, compareValues } from './data-table';

/** The reader's own mask, per test — null admin (nothing hidden) by default. */
let readerMask: string[] | undefined;
vi.mock('@/context/AdminAuthContext', () => ({
  useAdmin: () => ({ admin: readerMask ? { maskedFields: readerMask } : null }),
}));

/**
 * The table sorted money as text, and that is a money bug.
 *
 * The comparator was `if (valA < valB)` on `unknown`. For strings that is a
 * LEXICOGRAPHIC comparison, and amounts arrive from the API as fixed-8dp decimal
 * strings (ARCHITECTURE §6.1 — money crosses every boundary as a string). So on
 * the withdrawals queue, sorting by amount descending put `9.00000000` above
 * `100.00000000`: an admin triaging payouts by size was shown the wrong order,
 * with nothing in the UI to suggest it.
 *
 * PLATFORM-CONVENTIONS R-2.5 flagged this table for sorting within a page. It
 * did not catch that the ordering was also wrong WITHIN that page, which is the
 * more serious half — a page-scoped sort is at least correct about what it
 * holds.
 *
 * These are unit tests on the comparator rather than screen tests, because the
 * defect is entirely in the comparison and this is where a regression would
 * reappear.
 */

describe('compareValues — money is compared as a decimal, never as text', () => {
  it('orders amounts by value, not by leading character', () => {
    // THE regression. Lexicographically '1' < '9', so the old comparator put
    // 100 before 9 ascending — and above it descending, on the payout queue.
    expect(compareValues('100.00000000', '9.00000000', 'money')).toBeGreaterThan(0);
    expect(compareValues('9.00000000', '100.00000000', 'money')).toBeLessThan(0);
  });

  it('handles the full 8-decimal scale the API sends', () => {
    expect(compareValues('0.00000002', '0.00000001', 'money')).toBeGreaterThan(0);
    expect(compareValues('0.00000001', '0.00000001', 'money')).toBe(0);
  });

  it('stays exact past the precision a float would lose', () => {
    // Number('12345678901234567.89') is already wrong before any comparison —
    // which is why this path uses decimal.js and why Number() is lint-banned on
    // the money screens.
    expect(compareValues('12345678901234567.89', '12345678901234567.88', 'money')).toBeGreaterThan(
      0,
    );
  });

  it('orders negatives correctly', () => {
    // Ledger entries are signed: debits are negative.
    expect(compareValues('-50.00000000', '10.00000000', 'money')).toBeLessThan(0);
    expect(compareValues('-100.00000000', '-9.00000000', 'money')).toBeLessThan(0);
  });

  it('falls back to text rather than throwing on an unparseable amount', () => {
    // A data problem must not take the table down mid-render.
    expect(() => compareValues('not-a-number', '10.00', 'money')).not.toThrow();
  });
});

describe('compareValues — the other column types', () => {
  it('orders dates chronologically, not as strings', () => {
    expect(compareValues('2026-08-04T09:00:00Z', '2026-08-04T10:00:00Z', 'date')).toBeLessThan(0);
  });

  it('orders numbers numerically', () => {
    expect(compareValues(9, 100, 'number')).toBeLessThan(0);
    expect(compareValues('9', '100', 'number')).toBeLessThan(0);
  });

  it('orders text with localeCompare, so case does not split the alphabet', () => {
    // `<` compares code units, so 'Z' < 'a' and every capital sorts before
    // every lower-case letter — which looks like a broken sort to a user.
    expect(compareValues('apple', 'Banana', 'text')).toBeLessThan(0);
  });
});

describe('compareValues — missing values', () => {
  it('sorts blanks last ascending, whatever the type', () => {
    // An empty cell is not "smaller", it is unknown. Burying it is the useful
    // default on a queue where the populated rows are the actionable ones.
    for (const type of ['text', 'money', 'number', 'date'] as const) {
      expect(compareValues(null, '1', type)).toBeGreaterThan(0);
      expect(compareValues(undefined, '1', type)).toBeGreaterThan(0);
      expect(compareValues('', '1', type)).toBeGreaterThan(0);
      expect(compareValues('1', null, type)).toBeLessThan(0);
    }
  });

  it('treats two blanks as equal', () => {
    expect(compareValues(null, undefined, 'money')).toBe(0);
  });
});

/**
 * The scope note — the mitigation the code claimed but did not have.
 *
 * A comment in DataTable said callers needing a true ordering must not mark a
 * column sortable, "and `sortScopeNote` below is what tells the operator which
 * they are looking at." No such identifier existed anywhere in the repo. The
 * only stated mitigation for a page-local sort was fiction, which is worse than
 * an acknowledged gap: a reader checking this behaviour found a reassuring
 * sentence and stopped.
 *
 * It exists now, and these pin when it appears. The condition is the point —
 * a note that showed on every sort would be ignored, and one that never showed
 * on a misleading sort would be useless.
 */
describe('sort scope note', () => {
  const rows = [
    { id: '1', amount: '9.00000000' },
    { id: '2', amount: '100.00000000' },
  ];
  const columns = [
    {
      header: 'Amount',
      sortable: true,
      sortKey: 'amount',
      sortType: 'money' as const,
      cell: (r: { amount: string }) => r.amount,
    },
  ];
  const pagination = {
    pageNumber: 1,
    pageSize: 25,
    showing: 2,
    canGoBack: false,
    canGoForward: true,
    onBack: () => {},
    onNext: () => {},
  };

  const render = (props: Record<string, unknown>) =>
    renderWithProviders(
      <DataTable rows={rows} columns={columns} rowKey={(r: { id: string }) => r.id} {...props} />,
    );

  const NOTE = /sorted within this page only/i;

  it('says nothing until a sort is actually applied', () => {
    render({ cursorPagination: pagination });
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });

  it('warns once a client-side sort is active and more pages exist', async () => {
    const user = userEvent.setup();
    render({ cursorPagination: pagination });
    await user.click(screen.getByRole('button', { name: /amount/i }));

    expect(await screen.findByText(NOTE)).toBeInTheDocument();
  });

  it('stays quiet when this is the only page — the sort is then complete', async () => {
    const user = userEvent.setup();
    render({ cursorPagination: { ...pagination, canGoForward: false } });
    await user.click(screen.getByRole('button', { name: /amount/i }));

    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });

  it('stays quiet when the caller sorts server-side', async () => {
    // onSortChange means the ordering is real and covers the whole set, so a
    // warning would be false and would train the operator to ignore it.
    const user = userEvent.setup();
    render({ cursorPagination: pagination, onSortChange: () => {} });
    await user.click(screen.getByRole('button', { name: /amount/i }));

    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });
});

/**
 * A column with no `sortKey` is NOT sortable — the contract the header-text
 * fallback silently broke.
 *
 * `sortKey` used to fall back to the header TEXT, so every column with a string
 * header offered a sort whatever the caller intended. Both outcomes were
 * silent, and each app hit a different one:
 *
 *   admin   the click set `?sort=Kind` in the URL, the page's allow-list check
 *           dropped it, and the request went out unsorted — a header that
 *           toggles an arrow and reorders nothing. /commissions had two.
 *   portal  the value was sent as `?sort=`, the API answered 400, and the
 *           screen rendered "Could not load your transactions" over an empty
 *           page. That is how it was reported.
 *
 * Asserted on the RENDERED header rather than on the internals, because the
 * fallback lived in two places and a test of one would have passed while the
 * other still broke the screen.
 */
describe('sortability is declared, never inferred from the header text', () => {
  const rows = [{ id: '1', amount: '9.00000000' }];
  const rowKey = (r: { id: string }) => r.id;

  it('renders no sort control for a column that names no sortKey', () => {
    renderWithProviders(
      <DataTable
        rows={rows}
        rowKey={rowKey}
        columns={[{ header: 'Method', cell: () => 'Whish' }]}
        onSortChange={() => {}}
      />,
    );

    expect(screen.queryByRole('button', { name: /method/i })).not.toBeInTheDocument();
    expect(screen.getByText('Method')).toBeInTheDocument();
  });

  it('offers exactly the declared sortKeys, and hands back nothing else', async () => {
    const user = userEvent.setup();
    const seen: (string | null)[] = [];
    renderWithProviders(
      <DataTable
        rows={rows}
        rowKey={rowKey}
        columns={[
          { header: 'Method', cell: () => 'Whish' },
          { header: 'Amount', sortKey: 'amount', sortType: 'money', cell: (r) => r.amount },
        ]}
        onSortChange={(key) => seen.push(key)}
      />,
    );

    // Click EVERY sort control the table chose to render, not the one column
    // this test knows about: the fallback's whole effect was rendering extra
    // ones, so a test that clicks only the keyed column cannot see it.
    const headers = screen.getAllByRole('columnheader');
    for (const header of headers) {
      const control = within(header).queryByRole('button');
      if (control) await user.click(control);
    }

    expect(seen).toEqual(['amount']);
  });
});

describe('a sort the reader’s mask forbids is not offered (D-82)', () => {
  const rows = [{ id: '1', amount: '9.00000000' }];
  const rowKey = (r: { id: string }) => r.id;
  const columns = [
    { header: 'Client', sortKey: 'userEmail', cell: () => 'x' },
    { header: 'Amount', sortKey: 'amount', cell: (r: { amount: string }) => r.amount },
  ];

  it('drops the client-email sort for a role that hides client emails — the API would 400', () => {
    readerMask = ['client.email'];
    renderWithProviders(
      <DataTable rows={rows} rowKey={rowKey} columns={columns} onSortChange={() => {}} />,
    );
    expect(screen.queryByRole('button', { name: /client/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /amount/i })).toBeInTheDocument();
    readerMask = undefined;
  });

  it('offers it when the field is visible', () => {
    renderWithProviders(
      <DataTable rows={rows} rowKey={rowKey} columns={columns} onSortChange={() => {}} />,
    );
    expect(screen.getByRole('button', { name: /client/i })).toBeInTheDocument();
  });
});
