'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Inbox, X } from 'lucide-react';
import api from '@/lib/api';
import type { TransactionRow } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { RowActions, actionsColumn, type RowAction } from '@/components/row-actions';
import { QueueToolbar } from '@/components/queue-toolbar';
import { Badge } from '@/components/ui/badge';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { DepositReceiptCell } from '@/components/deposits/deposit-receipt-cell';
import { DepositRejectDialog } from '@/components/deposits/deposit-reject-dialog';
import { useDebounced } from '@/hooks/use-debounced';
import { useUrlSeededState } from '@/hooks/use-url-seeded-state';
import { PageLoader } from '@/components/ui/loader';
import { formatMoney } from '@/lib/money';
import { toastError, toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';
import { ClientIdentity, clientName } from '@/components/clients/client-identity';

/**
 * THE OFFLINE DEPOSIT DESK — money a client paid outside the platform.
 *
 * ## Why this is its own page and not a tab on /transactions
 *
 * That screen is the WITHDRAWALS desk, and it is 617 code lines against a lint
 * ceiling of 660 whose comment says the number only ever goes down. A second
 * list query, column set, state map, approve path and reject modal would not
 * fit — so the option was closed by a rule rather than by taste.
 *
 * It also belongs here on its own terms: Approvals is where "things a person
 * must decide" live, which is what this is.
 *
 * ## ⚠️ Approving MINTS BALANCE
 *
 * Every other decision queue in this console moves a record between states. This
 * one credits a wallet against a photograph, so the confirm dialog names the
 * client, the amount and the reference — and says so out loud when there is no
 * receipt attached to look at.
 */
const TABS = [
  { value: 'pending', labelKey: 'deposits.tabPending' as const },
  { value: 'success', labelKey: 'deposits.tabApproved' as const },
  { value: 'rejected', labelKey: 'deposits.tabRejected' as const },
];

const PAGE_SIZE = 25;

export default function DepositApprovalsPage() {
  // `useSearchParams()` needs a Suspense boundary at prerender, or the build fails.
  return (
    <Suspense fallback={<PageLoader label={t('deposits.loading')} />}>
      <DepositApprovalsContent />
    </Suspense>
  );
}

function DepositApprovalsContent() {
  const { admin } = useAdmin();
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const canApprove = hasPermission(admin, 'deposits.approve');
  const canReject = hasPermission(admin, 'deposits.reject');

  /*
   * Typed against the API's own union rather than a bare string: an invented
   * state would be a compile error here instead of a 400 at runtime.
   */
  const [state, setState] = React.useState<'pending' | 'success' | 'rejected'>('pending');
  const [page, setPage] = React.useState(1);
  // Seeded from `?q=` — a notification's link lands on this client's deposits.
  const [search, setSearch] = useUrlSeededState('q', () => setPage(1));
  const [rejectTarget, setRejectTarget] = React.useState<TransactionRow | null>(null);
  const debouncedSearch = useDebounced(search, 300);

  const params = {
    direction: 'deposit' as const,
    state,
    q: debouncedSearch || undefined,
    page,
    limit: PAGE_SIZE,
  };

  const query = useResource(keys.deposits.list(params), (signal) =>
    api.admin.getTransactions(params, signal),
  );

  const rows = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const counts = query.data?.counts;

  /*
   * One invalidate for both decisions, covering more than a rejection strictly
   * needs. Two lists that can drift apart is worse than one that over-refreshes,
   * and `deposits.all()` is a prefix of `deposits.pendingCount()`, so the queue
   * and the sidebar badge move together.
   */
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: keys.deposits.all() });
    void queryClient.invalidateQueries({ queryKey: keys.wallets.all() });
    void queryClient.invalidateQueries({ queryKey: keys.transactions.all() });
    void queryClient.invalidateQueries({ queryKey: keys.ledger.all() });
    void queryClient.invalidateQueries({ queryKey: keys.stats.all() });
  };

  /*
   * The idempotency key is DERIVED from the action and the row, never random: a
   * double click and a retry after a dropped response must collapse to one
   * credit rather than two.
   */
  const intentKey = (action: string, row: TransactionRow) => `${action}:${row.id}`;

  const approve = useMutation({
    mutationFn: (row: TransactionRow) =>
      api.admin.approveDeposit(row.id, intentKey('approve', row)),
    onSuccess: () => {
      invalidate();
      toastSuccess(t('deposits.approved'));
    },
    onError: (error) => toastError(error, t('deposits.approveFailed')),
  });

  const reject = useMutation({
    mutationFn: ({
      row,
      body,
    }: {
      row: TransactionRow;
      body: { reasonId?: string; reason?: string };
    }) => api.admin.rejectDeposit(row.id, body, intentKey('reject', row)),
    onSuccess: () => {
      setRejectTarget(null);
      invalidate();
      toastSuccess(t('deposits.rejected'));
    },
    onError: (error) => toastError(error, t('deposits.rejectFailed')),
  });

  // The Portal ID before "this client": a role that hides name and email still
  // lets the confirm dialog say WHICH client it is about to credit.
  const nameOf = (row: TransactionRow) =>
    [row.user?.firstName, row.user?.lastName].filter(Boolean).join(' ') ||
    row.user?.email ||
    (row.user?.portalId === undefined ? t('deposits.unknownClient') : `#${row.user.portalId}`);

  const askApprove = async (row: TransactionRow) => {
    const ok = await confirm({
      title: t('deposits.confirmApproveTitle', {
        amount: formatMoney(row.amount, row.currency),
      }),
      description: row.proofFilename
        ? t('deposits.confirmApprove', {
            name: nameOf(row),
            amount: formatMoney(row.amount, row.currency),
            method: row.methodName ?? '—',
            reference: row.providerRef ?? '—',
          })
        : /*
           * NO RECEIPT — said in the dialog, not left to be noticed in the row.
           * Approving credits real money; approving without having seen anything,
           * and without the dialog admitting there is nothing to see, is
           * approving blind.
           */
          t('deposits.confirmApproveNoReceipt', {
            name: nameOf(row),
            amount: formatMoney(row.amount, row.currency),
          }),
      confirmLabel: t('deposits.approve'),
    });
    if (ok) approve.mutate(row);
  };

  const columns: Column<TransactionRow>[] = [
    {
      header: t('deposits.colClient'),
      sortable: false,
      cell: (row) => (
        <ClientIdentity
          name={clientName(row.user?.firstName, row.user?.lastName)}
          email={row.user?.email}
          portalId={row.user?.portalId}
        />
      ),
    },
    {
      header: t('deposits.colAmount'),
      align: 'right',
      sortable: false,
      // Through decimal.js, never coerced (§6.1) — the same rule the wallets
      // list follows, and this is a column an operator scans.
      cell: (row) => formatMoney(row.amount, row.currency),
      cellClassName: 'font-mono font-semibold whitespace-nowrap tabular',
    },
    {
      header: t('deposits.colMethod'),
      sortable: false,
      cell: (row) => row.methodName ?? '—',
      cellClassName: 'whitespace-nowrap',
    },
    {
      header: t('deposits.colReference'),
      sortable: false,
      cell: (row) => <span data-external-ref="">{row.providerRef ?? '—'}</span>,
      cellClassName: 'font-mono text-xs whitespace-nowrap',
    },
    {
      header: t('deposits.colReceipt'),
      sortable: false,
      cell: (row) => <DepositReceiptCell filename={row.proofFilename} />,
    },
    {
      header: t('deposits.colRequested'),
      sortable: false,
      cell: (row) => new Date(row.createdAt).toLocaleString(),
      cellClassName: 'text-muted-foreground whitespace-nowrap',
    },
    {
      header: t('deposits.colState'),
      sortable: false,
      cell: (row) => (
        <div className="space-y-1">
          <Badge
            variant={
              row.state === 'success'
                ? 'success'
                : row.state === 'rejected'
                  ? 'destructive'
                  : 'warning'
            }
          >
            {row.state}
          </Badge>
          {row.rejectionReason && (
            <div className="max-w-[16rem] text-[11px] leading-snug text-muted-foreground">
              {row.rejectionReason}
            </div>
          )}
        </div>
      ),
    },
    actionsColumn<TransactionRow>((row) => {
      if (row.state !== 'pending') return null;
      const actions: RowAction[] = [];
      if (canApprove) {
        actions.push({
          label: t('deposits.approve'),
          icon: Check,
          onSelect: () => void askApprove(row),
        });
      }
      if (canReject) {
        actions.push({
          label: t('deposits.reject'),
          icon: X,
          destructive: true,
          onSelect: () => setRejectTarget(row),
        });
      }
      // Neither permission: say so, rather than render an empty menu that reads
      // as a broken control.
      if (actions.length === 0) {
        return <span className="text-xs text-muted-foreground">{t('deposits.viewOnly')}</span>;
      }
      return <RowActions items={actions} label={t('deposits.rowActionsLabel')} />;
    }),
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">{t('deposits.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('deposits.subtitle')}</p>
      </div>

      <div className="shrink-0">
        <QueueToolbar
          filters={TABS.map((tab) => ({
            value: tab.value,
            label: t(tab.labelKey),
            count: counts?.[tab.value],
          }))}
          active={state}
          onFilterChange={(value) => {
            setState(value as 'pending' | 'success' | 'rejected');
            // Page 3 of "pending" is rarely page 3 of "rejected", and landing on
            // an empty page reads as an empty queue.
            setPage(1);
          }}
          search={search}
          onSearchChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          searchPlaceholder={t('deposits.searchPlaceholder')}
          searchAriaLabel={t('deposits.searchAria')}
        />
      </div>

      <AsyncBoundary
        status={query.status}
        label={t('deposits.loading')}
        endpoints={['GET /admin/transactions?direction=deposit&state&q&page&limit']}
        onRetry={query.refetch}
        errorMessage={t('deposits.loadFailed')}
        error={query.error}
        fill
      >
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.id}
          fill
          empty={<EmptyState icon={Inbox} message={t('deposits.empty')} />}
          pagination={{
            page,
            pageSize: PAGE_SIZE,
            total,
            onPageChange: setPage,
          }}
        />
      </AsyncBoundary>

      <DepositRejectDialog
        open={rejectTarget !== null}
        clientName={rejectTarget ? nameOf(rejectTarget) : ''}
        amount={rejectTarget ? formatMoney(rejectTarget.amount, rejectTarget.currency) : ''}
        saving={reject.isPending}
        error={
          reject.isError ? apiErrorMessage(reject.error, t('deposits.rejectFailed')) : undefined
        }
        onCancel={() => setRejectTarget(null)}
        onConfirm={(body) => {
          if (rejectTarget) reject.mutate({ row: rejectTarget, body });
        }}
      />
    </div>
  );
}
