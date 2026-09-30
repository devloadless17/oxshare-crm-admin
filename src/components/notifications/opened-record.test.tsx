import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import type { Column } from '@/components/data-table';
import type { OpenedRecordState } from '@/hooks/use-open-record';
import type { ResourceStatus } from '@/hooks/use-resource';
import { OpenedRecord } from './opened-record';

/**
 * The record a notification opened, held above a money desk. What matters is
 * integrity: it shows ONLY the record the URL names (never the previous one a
 * cache kept, with its Approve live), and it reads the task only once that
 * record was actually shown.
 */

const markSubjectRead = vi.hoisted(() => vi.fn());
vi.mock('./use-mark-subject-read', () => ({ useMarkSubjectRead: markSubjectRead }));

interface Row {
  id: string;
  amount: string;
}
const columns: Column<Row>[] = [{ header: 'Amount', cell: (row) => row.amount }];

function state(
  openId: string | undefined,
  status: ResourceStatus,
  isFetching = false,
): OpenedRecordState<unknown> {
  return {
    openId,
    malformed: false,
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

function draw(open: OpenedRecordState<unknown>, row: Row | undefined) {
  return renderWithProviders(
    <OpenedRecord
      open={open}
      row={row}
      columns={columns}
      rowKey={(r) => r.id}
      subjectKind="transaction"
    />,
  );
}

beforeEach(() => markSubjectRead.mockClear());

describe('OpenedRecord', () => {
  it('shows the named record and reads its task', () => {
    draw(state('tx-2', 'ready'), { id: 'tx-2', amount: '250.00 USD' });
    expect(screen.getByText('250.00 USD')).toBeInTheDocument();
    expect(markSubjectRead).toHaveBeenLastCalledWith('transaction', 'tx-2');
  });

  it('never shows the PREVIOUS record while the named one loads', () => {
    // A second notification followed on the same desk: the cache still holds tx-1.
    draw(state('tx-2', 'ready', true), { id: 'tx-1', amount: '999.00 USD' });
    expect(screen.queryByText('999.00 USD')).not.toBeInTheDocument();
    expect(screen.getByText(/opening the record/i)).toBeInTheDocument();
    expect(markSubjectRead).toHaveBeenLastCalledWith('transaction', undefined);
  });

  it.each(['notFound', 'forbidden'] as const)(
    'says a %s record is unavailable, and reads nothing',
    (status) => {
      draw(state('tx-2', status), undefined);
      expect(screen.getByText(/not available to you/i)).toBeInTheDocument();
      expect(markSubjectRead).toHaveBeenLastCalledWith('transaction', undefined);
    },
  );

  it('answers a link naming no record as unavailable at once, never a spinner', () => {
    draw({ ...state('garbage', 'loading'), malformed: true }, undefined);
    expect(screen.getByText(/not available to you/i)).toBeInTheDocument();
    expect(screen.queryByText(/opening the record/i)).not.toBeInTheDocument();
  });

  it('treats an empty page (outside the territory) as unavailable, not an empty queue', () => {
    draw(state('tx-2', 'ready'), undefined);
    expect(screen.getByText(/not available to you/i)).toBeInTheDocument();
  });

  it('draws nothing when the URL opens nothing, and closes on request', async () => {
    const { rerender } = draw(state(undefined, 'loading'), undefined);
    expect(screen.queryByRole('region', { name: /opened from a notification/i })).toBeNull();

    const open = state('tx-2', 'ready');
    rerender(
      <OpenedRecord
        open={open}
        row={{ id: 'tx-2', amount: '1.00 USD' }}
        columns={columns}
        rowKey={(r) => r.id}
        subjectKind="transaction"
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /close the opened record/i }));
    expect(open.close).toHaveBeenCalled();
  });
});
