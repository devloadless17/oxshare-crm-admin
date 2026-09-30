import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import type { Column } from '@/components/data-table';
import type { RowAction } from '@/components/row-actions';
import type { OpenedRecordState } from '@/hooks/use-open-record';
import type { ResourceStatus } from '@/hooks/use-resource';
import { RecordSheet } from './record-sheet';

/**
 * A record's detail panel over a money desk. What matters is integrity: it
 * shows ONLY the record the URL names (never the previous one a cache kept,
 * with its Approve live), its buttons are the desk's own actions, and it reads
 * the record's task only once the record was actually shown.
 */

const markSubjectRead = vi.hoisted(() => vi.fn());
vi.mock('@/components/notifications/use-mark-subject-read', () => ({
  useMarkSubjectRead: markSubjectRead,
}));

interface Row {
  id: string;
  amount: string;
}
const columns: Column<Row>[] = [
  { header: 'Amount', cell: (row) => row.amount },
  { header: 'Actions', cell: () => 'MENU', sticky: 'end' },
];

function state(
  openId: string | undefined,
  status: ResourceStatus,
  isFetching = false,
): OpenedRecordState<unknown> {
  return {
    openId,
    malformed: false,
    open: vi.fn(),
    close: vi.fn(),
    query: {
      status,
      data: undefined,
      isFetching,
      error: undefined,
      updatedAt: 0,
      refetch: vi.fn(),
      refreshFailed: false,
    },
  };
}

function draw(
  open: OpenedRecordState<unknown>,
  row: Row | undefined,
  actions: (row: Row) => RowAction[] = () => [],
) {
  return renderWithProviders(
    <RecordSheet
      open={open}
      row={row}
      rowKey={(r) => r.id}
      subjectKind="transaction"
      title={(r) => `Deposit · ${r.amount}`}
      columns={columns}
      actions={actions}
    />,
  );
}

beforeEach(() => markSubjectRead.mockClear());

describe('RecordSheet', () => {
  it('shows the named record from the desk’s own columns, and reads its task', () => {
    draw(state('tx-2', 'ready'), { id: 'tx-2', amount: '250.00 USD' });
    expect(screen.getByRole('dialog', { name: 'Deposit · 250.00 USD' })).toBeInTheDocument();
    expect(screen.getByText('250.00 USD')).toBeInTheDocument();
    // The actions column is the desk's menu, not a field.
    expect(screen.queryByText('MENU')).not.toBeInTheDocument();
    expect(markSubjectRead).toHaveBeenLastCalledWith('transaction', 'tx-2');
  });

  it('never shows the PREVIOUS record while the named one loads', () => {
    // A second notification followed on the same desk: the cache still holds tx-1.
    draw(state('tx-2', 'ready', true), { id: 'tx-1', amount: '999.00 USD' }, () => [
      { label: 'Approve', onSelect: vi.fn() },
    ]);
    expect(screen.queryByText('999.00 USD')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.getAllByText(/opening the record/i).length).toBeGreaterThan(0);
    expect(markSubjectRead).toHaveBeenLastCalledWith('transaction', undefined);
  });

  it.each(['notFound', 'forbidden'] as const)(
    'says a %s record is not available, and reads nothing',
    (status) => {
      draw(state('tx-2', status), undefined);
      expect(screen.getByText(/this record is not available/i)).toBeInTheDocument();
      expect(markSubjectRead).toHaveBeenLastCalledWith('transaction', undefined);
    },
  );

  it('answers an empty page (outside the territory) and a malformed id as not available', () => {
    const { unmount } = draw(state('tx-2', 'ready'), undefined);
    expect(screen.getByText(/this record is not available/i)).toBeInTheDocument();
    unmount();
    draw({ ...state('garbage', 'loading'), malformed: true }, undefined);
    expect(screen.getByText(/this record is not available/i)).toBeInTheDocument();
  });

  it('offers the desk’s actions as real buttons, and runs them', async () => {
    const approve = vi.fn();
    const reject = vi.fn();
    draw(state('tx-2', 'ready'), { id: 'tx-2', amount: '1.00 USD' }, () => [
      { label: 'Approve', onSelect: approve },
      { label: 'Reject', onSelect: reject, destructive: true },
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(approve).toHaveBeenCalledOnce();
    expect(reject).toHaveBeenCalledOnce();
  });

  it('is closed while the URL opens nothing, and closing puts the record away', async () => {
    const { rerender } = draw(state(undefined, 'loading'), undefined);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const open = state('tx-2', 'ready');
    rerender(
      <RecordSheet
        open={open}
        row={{ id: 'tx-2', amount: '1.00 USD' }}
        rowKey={(r) => r.id}
        subjectKind="transaction"
        title={(r) => `Deposit · ${r.amount}`}
        columns={columns}
        actions={() => []}
      />,
    );
    await userEvent.keyboard('{Escape}');
    expect(open.close).toHaveBeenCalled();
  });
});
