'use client';

import { Suspense, useState } from 'react';
import { Banknote } from 'lucide-react';
import api from '@/lib/api';
import {
  TRANSACTION_DIRECTIONS,
  TRANSACTION_KINDS,
  TRANSACTION_SORT_KEYS,
  TRANSACTION_STATES,
  type Currency,
  type TransactionDirection,
  type TransactionKind,
  type TransactionListParams,
  type TransactionListResponse,
  type TransactionSortKey,
  type TransactionRow,
  type StuckTransfers,
  type TransactionState,
  type TransactionsSummary,
} from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { useDebounced } from '@/hooks/use-debounced';
import { useTableQueryState } from '@/hooks/use-table-query-state';
import { DEFAULT_PAGE_SIZE, limitParam, pageParam } from '@/lib/page-param';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState } from '@/components/data-table';
import { ExportButton } from '@/components/export-button';
import { PageLoader } from '@/components/ui/loader';
import { QueueToolbar } from '@/components/queue-toolbar';
import { MaskedFieldsNotice } from '@/components/masked-value';
import { maskedFieldLabels } from '@/lib/masking';
import { TransactionFilters } from '@/components/financial/transaction-filters';
import { TransactionSummary } from '@/components/financial/transaction-summary';
import { transactionColumns } from '@/components/financial/transaction-columns';
import { AbandonTransferDialog } from '@/components/financial/abandon-transfer-dialog';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { StatusBanner } from '@/app/(console)/bridge/page';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * RBAC-03 — what each masked catalog key is CALLED in the notice above the
 * table. Both name halves map to one label: "Client name" hidden twice would
 * read as two different restrictions.
 */
const FIELD_LABELS: Record<string, string> = {
  'financial.user.email': t('financial.maskedLabelEmail'),
  'financial.user.firstName': t('financial.maskedLabelName'),
  'financial.user.lastName': t('financial.maskedLabelName'),
};

/**
 * The Financial page — every money movement on the platform, in one list.
 * `GET /admin/transactions`: deposits, withdrawals, wallet ⇄ account
 * transfers and commission transfers, unioned by the API with the client
 * joined onto each row.
 *
 * ## What makes this different from /transactions and /ledger
 *
 * `/transactions` is a WORK QUEUE: pending withdrawal requests an operator
 * acts on. `/ledger` is the append-only accounting record, wallet-side and
 * PII-free. This is the operational answer to "what money moved" — lifecycle
 * states, client identity and payment rails, platform-wide — which is why it
 * carries its own permission (`transactions.view`) rather than riding on
 * either of theirs.
 *
 * ## Nothing here writes
 *
 * No approve, no reject, no edit — not disabled ones, none. The desk owns the
 * withdrawal lifecycle with its idempotency keys and confirmation dialogs;
 * this page links there on the rows the desk can action and otherwise only
 * reads. Duplicating a money action onto a second screen would be two copies
 * of a lifecycle to keep honest.
 */
export default function FinancialPage() {
  // `useSearchParams()` needs a Suspense boundary at prerender or `npm run
  // build` fails — and `next dev` does not, so CI is where you would find out.
  return (
    <Suspense fallback={<PageLoader label={t('financial.loading')} />}>
      <FinancialPageContent />
    </Suspense>
  );
}

/** A URL value either names a known member or is no filter at all. */
function member<T extends string>(value: string, allowed: readonly T[]): T | undefined {
  return (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

function FinancialPageContent() {
  const url = useTableQueryState();
  const page = pageParam(url.get('page'));
  const pageSize = limitParam(url.get('limit'));

  /*
   * Validated against the same value lists the dropdowns render, so a
   * hand-edited URL cannot put the page into an error state the controls
   * cannot express — an unknown value simply filters nothing, and the API
   * never sees it (it would 400, correctly, R-2.5).
   */
  const direction = member<TransactionDirection>(url.get('direction'), TRANSACTION_DIRECTIONS);
  const kind = member<TransactionKind>(url.get('kind'), TRANSACTION_KINDS);
  const state = member<TransactionState>(url.get('state'), TRANSACTION_STATES);
  const currency = url.get('currency');
  const from = url.get('from');
  const to = url.get('to');
  // Deep-linking from a client profile — the same shape /ledger?userId= uses.
  const userId = url.get('userId');
  /*
   * Debounced, server-side, and IN the URL (the wallets pattern, not the
   * desk's local state) so "everything Jane moved this week" is a link an
   * operator can paste into a ticket.
   */
  const q = useDebounced(url.get('q').trim());

  const sortKey = member<TransactionSortKey>(url.sort.key ?? '', TRANSACTION_SORT_KEYS);

  /*
   * The list's filters and the summary's are the SAME OBJECT, minus paging
   * and sort — the tiles must describe exactly the set the table shows, and
   * two hand-built param objects would drift.
   */
  const filterParams = {
    direction,
    kind,
    state,
    userId: userId || undefined,
    currency: currency || undefined,
    q: q || undefined,
    from: from || undefined,
    to: to || undefined,
  };

  const params: TransactionListParams = {
    ...filterParams,
    limit: pageSize,
    page,
    sort: sortKey,
    // Withheld when nothing is sorted — `order` alone orders no column.
    order: sortKey ? url.sort.order : undefined,
  };

  const query = useResource<TransactionListResponse>(keys.transactions.list(params), (signal) =>
    api.admin.getTransactions(params, signal),
  );
  /*
   * The tiles IGNORE the direction/kind axis, exactly as the tabs' counts do
   * (the desk's two-axis rule): a Deposits tile must keep its total while the
   * Withdrawals tab is active, or switching tabs makes a number vanish that
   * nothing removed. Every other filter still narrows both.
   */
  const summaryParams = { ...filterParams, direction: undefined, kind: undefined };
  const summaryQuery = useResource<TransactionsSummary>(
    keys.transactions.summary(summaryParams),
    (signal) => api.admin.getTransactionsSummary(summaryParams, signal),
  );
  // The currency vocabulary from its own endpoint, never from the rows on
  // screen — the wallets page records why (paging would change the options).
  const currenciesQuery = useResource<Currency[]>(keys.currencies.all(), (signal) =>
    api.admin.getCurrencies(signal),
  );

  const rows = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  // `counts` (per state) is in the response too; this page filters state via
  // a dropdown rather than tabs, so only the direction axis renders badges.
  const directionCounts = query.data?.directionCounts ?? {};
  // RBAC-03 — the `financial.*` keys this viewer's response omitted.
  const maskedFields = query.data?.maskedFields ?? [];

  /*
   * Releasing a stuck transfer — the one ACTION on this otherwise read-only
   * screen, and the only place in the console a transfer can be acted on at
   * all (it has no desk of its own; see `transaction-columns`).
   *
   * `transfers.abandon` is the sibling of `withdrawals.settle`: both mean
   * "decide money did or did not move, on evidence outside this system".
   */
  const { admin } = useAdmin();
  const canAbandon = hasPermission(admin, 'transfers.abandon');
  const [abandonTarget, setAbandonTarget] = useState<TransactionRow | null>(null);

  /*
   * ── The stuck-transfer banner ────────────────────────────────────────────
   *
   * `TransferResumeScheduler` raises `money.transfer_stuck` at PAGE severity
   * when a transfer has been pending past its threshold. That alert is a log
   * line — §12.3 deliberately stops short of choosing a paging provider — so on
   * a deployment with no log drain it reaches a terminal nobody is watching.
   *
   * These transfers have always been rows on the table below. What was missing
   * was a REASON to look: a stuck one renders as a pending row among settled
   * history, indistinguishable from a withdrawal waiting on the desk.
   *
   * Deliberately NOT filtered by the page's own filters. It answers "is anything
   * wrong right now", which must not change because somebody narrowed the view
   * to last month — the same argument the summary tiles make for ignoring the
   * direction and kind axes.
   */
  const stuckQuery = useResource<StuckTransfers>(keys.transactions.stuck(), (signal) =>
    api.admin.getStuckTransfers(signal),
  );
  const stuck = stuckQuery.data;

  const isFiltered = Boolean(
    direction || kind || state || currency || from || to || userId || url.get('q'),
  );

  const exportFilters = new URLSearchParams();
  for (const [key, value] of Object.entries(filterParams)) {
    if (value) exportFilters.set(key, value);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('financial.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('financial.subtitle')}</p>
        </div>
        {/* The same filters as the list, never its paging — export.ts strips
            paging anyway, but not sending it keeps the intent readable. */}
        <ExportButton resource="transactions" filters={exportFilters} disabled={total === 0} />
      </div>

      {/*
        Shown ONLY when something is stuck — never a green all-clear.

        A permanent banner on a money screen trains the eye to skip the one
        element that must be read on the day it turns red. The bridge page makes
        the same call for the same reason.

        It states that no money has moved, because that is the operator's first
        question and the answer is reassuring: a wallet is debited only once MT5
        confirms. What is wrong is that a client is watching a spinner.
      */}
      {stuck && stuck.count > 0 && (
        <StatusBanner
          healthy={false}
          message={t('financial.stuckBanner', {
            count: stuck.count,
            minutes: stuck.thresholdMinutes,
          })}
        />
      )}

      <MaskedFieldsNotice labels={maskedFieldLabels(maskedFields, FIELD_LABELS)} />

      <TransactionSummary
        directionCounts={directionCounts}
        summary={summaryQuery.data}
        loading={query.status === 'loading'}
      />

      <QueueToolbar
        filters={[
          { value: '', label: t('financial.directionAll'), count: directionCounts['all'] },
          {
            value: 'deposit',
            label: t('financial.direction.deposit'),
            count: directionCounts['deposit'],
          },
          {
            value: 'withdrawal',
            label: t('financial.direction.withdrawal'),
            count: directionCounts['withdrawal'],
          },
        ]}
        active={direction ?? ''}
        onFilterChange={(value) =>
          // Direction and page written together — page 4 of "all" is usually
          // past the end of "withdrawals", and an empty table reads as an
          // empty platform.
          url.set({ direction: value || undefined, page: undefined })
        }
        search={url.get('q')}
        onSearchChange={(value) => url.set({ q: value || undefined, page: undefined })}
        searchPlaceholder={t('financial.searchPlaceholder')}
        searchAriaLabel={t('financial.searchAria')}
      />

      <TransactionFilters
        kind={kind ?? ''}
        state={state ?? ''}
        currency={currency}
        from={from}
        to={to}
        currencies={currenciesQuery.data ?? []}
        isFiltered={isFiltered}
        onChange={(patch) => url.set({ ...patch, page: undefined })}
        onClear={() => url.clear()}
      />

      <AsyncBoundary
        status={query.status}
        label={t('financial.loading')}
        endpoints={[
          'GET /admin/transactions?direction&kind&state&q&userId&currency&from&to&page&limit&sort&order',
        ]}
        onRetry={query.refetch}
        errorMessage={t('financial.loadFailed')}
        error={query.error}
        fill
      >
        <DataTable
          fill
          caption={t('financial.caption')}
          columns={transactionColumns({
            maskedFields,
            /*
             * Undefined without the permission, which is what HIDES the
             * control rather than showing one that 403s. UX only —
             * `PermissionsGuard` is the enforcement (R-4.1).
             */
            onAbandon: canAbandon ? setAbandonTarget : undefined,
          })}
          rows={rows}
          rowKey={(row) => row.id}
          dimmed={query.isFetching}
          empty={
            <EmptyState
              icon={Banknote}
              message={isFiltered ? t('financial.emptyFiltered') : t('financial.empty')}
            />
          }
          sortColumn={sortKey}
          sortDirection={url.sort.order}
          /*
           * Server-side, which is what makes the amount column safe to offer
           * at all (a true NUMERIC ordering over the whole filtered set). The
           * page is dropped with the sort; `key` is `null` on the third click.
           */
          onSortChange={(key, order) => {
            url.set({ sort: key ?? undefined, order: order ?? undefined, page: undefined });
          }}
          pagination={{
            page,
            pageSize,
            total,
            onPageChange: (next) => url.set({ page: next === 1 ? undefined : String(next) }),
            onPageSizeChange: (size) =>
              url.set({
                limit: size === DEFAULT_PAGE_SIZE ? undefined : String(size),
                page: undefined,
              }),
            noun: [t('financial.noun'), t('financial.nounPlural')],
          }}
        />
      </AsyncBoundary>

      {/*
        Mounted unconditionally and driven by its target, like every other
        confirm dialog here. It refetches on success rather than patching the
        row: the release also frees the wallet hold, and the tiles above the
        table are computed server-side from the same movements.
      */}
      <AbandonTransferDialog
        target={abandonTarget}
        onClose={() => setAbandonTarget(null)}
        onDone={async () => {
          await Promise.all([query.refetch(), summaryQuery.refetch(), stuckQuery.refetch()]);
        }}
      />
    </div>
  );
}
