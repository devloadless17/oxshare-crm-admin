'use client';

import { Suspense } from 'react';
import Decimal from 'decimal.js';
import { Coins } from 'lucide-react';
import api from '@/lib/api';
import {
  IB_ACCRUAL_SORT_KEYS,
  type IbAccrual,
  type IbAccrualPage,
  type IbAccrualSortKey,
} from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { useTableQueryState } from '@/hooks/use-table-query-state';
import { DEFAULT_PAGE_SIZE, limitParam, pageParam } from '@/lib/page-param';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { PageLoader } from '@/components/ui/loader';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatMoney } from '@/lib/money';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * The commission ledger — `GET /admin/ib/accruals`.
 *
 * ## Why this screen exists
 *
 * It did not, and neither did the endpoint behind it. The commission engine
 * wrote a row to `ib_accruals` on every settled deposit and NOTHING ever read
 * one back: no screen, no export, no API. An operator could manage partners and
 * levels but could not see a single commission — not who had earned what, not
 * pending against confirmed, not which client generated it. "What do we owe our
 * partners this month" was a question only a database client could answer.
 *
 * ## Every row shows the WORKING, not just the payout
 *
 * `baseAmount × rateValue = amount`. A commission an operator cannot recompute
 * from the row is one they cannot defend when a partner disputes it, and the
 * three figures together are what make the number checkable rather than merely
 * displayed.
 *
 * ## Two people per row, deliberately kept apart
 *
 * The PARTNER earned it; the CLIENT generated it. They are different columns
 * because conflating them makes the ledger unreadable — a commission row is a
 * statement about a relationship.
 *
 * ## The totals come from the SERVER
 *
 * Summed in SQL over the whole filtered set. A total computed here would be the
 * total of one page — a number that looks like an answer and is not — and it
 * would be float arithmetic over decimal strings on top of that.
 */

const sortableBy = (key: IbAccrualSortKey) => ({ sortable: true as const, sortKey: key });

/**
 * `'70.0000'` → `'70'`, `'2.5000'` → `'2.5'`.
 *
 * A RATE, not money, so `formatMoney` is wrong for it: that pads to exactly two
 * places and prefixes a currency symbol, and `70.00%` is as much noise as
 * `70.0000%` was. The stored scale is four places because a rate can need them;
 * one that does not should not display them.
 *
 * Through decimal.js rather than `parseFloat`, for the same reason as money —
 * these are NUMERIC strings on a money path. `toFixed()` with no argument drops
 * trailing zeros without going near a float.
 */
function formatRate(value: string): string {
  try {
    return new Decimal(value).toFixed();
  } catch {
    // An unparseable rate shows as it arrived rather than as NaN: the row stays
    // readable and the odd value stays visible.
    return value;
  }
}

/**
 * A status, translated — falling back to the RAW value for one the app does not
 * know.
 *
 * `t()` takes a typed key and has no fallback, so a template-literal key would
 * be a compile error here and a blank cell at runtime if the enum ever grows.
 * An unfamiliar status must look unfamiliar rather than invisible: a value added
 * server-side should be readable here before anybody redeploys the console.
 */
function statusLabel(status: string): string {
  if (status === 'confirmed') return t('commissions.status.confirmed');
  if (status === 'reversed') return t('commissions.status.reversed');
  if (status === 'pending') return t('commissions.status.pending');
  return status;
}

export default function CommissionsPage() {
  // `useSearchParams()` needs a Suspense boundary at prerender or `npm run
  // build` fails — and `next dev` does not, so CI is where you would find out.
  return (
    <Suspense fallback={<PageLoader label={t('commissions.loading')} />}>
      <CommissionsPageContent />
    </Suspense>
  );
}

function CommissionsPageContent() {
  const url = useTableQueryState();
  const page = pageParam(url.get('page'));
  const pageSize = limitParam(url.get('limit'));
  const status = url.get('status');
  /*
   * ONE partner's ledger, when the URL names one.
   *
   * `GET /admin/ib/accruals` has always taken `ibUserId`; this screen simply
   * never passed it, so the filter existed on the API and was unreachable from
   * the console. The client profile's actions menu links here with it set,
   * which is what makes "what has this partner earned, line by line" a place an
   * operator can go rather than a query somebody runs by hand.
   */
  const ibUserId = url.get('ibUserId');

  const sortKey = IB_ACCRUAL_SORT_KEYS.includes(url.sort.key as IbAccrualSortKey)
    ? (url.sort.key as IbAccrualSortKey)
    : undefined;

  const params = {
    page,
    limit: pageSize,
    status: status || undefined,
    ibUserId: ibUserId || undefined,
    sort: sortKey,
    // Withheld when nothing is sorted: `order` alone describes an ordering of no
    // column, and sending it would cache one result set under two query keys.
    order: sortKey ? url.sort.order : undefined,
  };

  const query = useResource<IbAccrualPage>(keys.ibAccruals.list(params), (signal) =>
    api.admin.getIbAccruals(params, signal),
  );

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const totals = query.data?.totals ?? [];

  const columns: Column<IbAccrual>[] = [
    {
      header: t('commissions.colDate'),
      ...sortableBy('createdAt'),
      cell: (r) => new Date(r.accrual.createdAt).toLocaleString(),
      cellClassName: 'text-muted-foreground whitespace-nowrap',
    },
    {
      header: t('commissions.colPartner'),
      sortable: false,
      cell: (r) => (
        <div className="min-w-0">
          <div className="font-medium text-foreground">
            {[r.partner.firstName, r.partner.lastName].filter(Boolean).join(' ') || '—'}
          </div>
          <div className="truncate text-xs text-muted-foreground">{r.partner.email}</div>
        </div>
      ),
    },
    {
      header: t('commissions.colClient'),
      sortable: false,
      cell: (r) => (
        <div className="min-w-0">
          <div className="text-foreground">
            {[r.client.firstName, r.client.lastName].filter(Boolean).join(' ') || '—'}
          </div>
          <div className="truncate text-xs text-muted-foreground">{r.client.email}</div>
        </div>
      ),
    },
    {
      /*
       * THE WORKING. `baseAmount × rateValue` is what produced `amount`, and
       * showing all three is what lets an operator answer a partner who asks
       * where the figure came from.
       */
      header: t('commissions.colBasis'),
      sortable: false,
      align: 'right',
      cell: (r) => (
        <span className="text-xs text-muted-foreground">
          {formatMoney(r.accrual.baseAmount, r.accrual.currency)} ×{' '}
          {formatRate(r.accrual.rateValue)}%
        </span>
      ),
      cellClassName: 'font-mono whitespace-nowrap',
    },
    {
      header: t('commissions.colAmount'),
      align: 'right',
      ...sortableBy('amount'),
      // Formatted through decimal.js, never coerced (§6.1) — same rule as the
      // wallets list, and this is a column an operator scans.
      cell: (r) => formatMoney(r.accrual.amount, r.accrual.currency),
      cellClassName: 'font-mono font-semibold text-foreground whitespace-nowrap tabular',
    },
    {
      /*
       * DEPTH, not the rung it replaced (0102). "How far above the client was
       * this partner on this trade" is the question a ledger row answers; the
       * rung answered "where do they sit", which the money never used.
       */
      header: t('commissions.colDepth'),
      align: 'right',
      ...sortableBy('depth'),
      cell: (r) => r.accrual.depth,
      cellClassName: 'tabular',
    },
    {
      /* The TERMS. Null only on a row accrued before the column existed —
         rendered as a dash rather than blank, so "we cannot say" reads
         differently from "nothing there". */
      header: t('commissions.colProgramme'),
      cell: (r) => r.accrual.programName ?? '—',
      cellClassName: 'whitespace-nowrap text-muted-foreground',
    },
    {
      header: t('commissions.colStatus'),
      ...sortableBy('status'),
      cell: (r) => <AccrualStatus status={r.accrual.status} />,
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">{t('commissions.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('commissions.subtitle')}</p>
      </div>

      {/*
        The totals, by status, over the WHOLE filtered set. Pending and confirmed
        are shown apart rather than summed: they are different promises. Pending
        is what the engine has calculated, confirmed is what the platform has
        actually credited, and a single "total commissions" figure would hide
        which of the two anybody is looking at.
      */}
      <div className="flex shrink-0 flex-wrap gap-3">
        {totals.map((row) => (
          <div key={row.status} className="rounded-xl border border-border bg-card px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {statusLabel(row.status)}
            </div>
            <div className="mt-0.5 font-mono text-lg font-bold tabular-nums">
              {/* USD assumed for the roll-up: the ledger is single-currency
                  today. If a second settlement currency ever appears these have
                  to be grouped by currency, because summing across them is the
                  cross-currency addition `largestBalance` refuses to do. */}
              {formatMoney(row.amount, 'USD')}
            </div>
          </div>
        ))}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <Select
          value={status || 'all'}
          onValueChange={(value) =>
            url.set({ status: value === 'all' ? undefined : value, page: undefined })
          }
        >
          <SelectTrigger className="h-9 w-48" aria-label={t('commissions.filterStatus')}>
            <SelectValue placeholder={t('commissions.filterStatusAll')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('commissions.filterStatusAll')}</SelectItem>
            <SelectItem value="pending">{t('commissions.status.pending')}</SelectItem>
            <SelectItem value="confirmed">{t('commissions.status.confirmed')}</SelectItem>
            <SelectItem value="reversed">{t('commissions.status.reversed')}</SelectItem>
          </SelectContent>
        </Select>

        {status && (
          <button
            type="button"
            onClick={() => url.clear()}
            className="focus-outline h-9 rounded-lg border border-input bg-card px-3 text-xs font-medium hover:bg-muted"
          >
            {t('commissions.clearFilters')}
          </button>
        )}
      </div>

      <AsyncBoundary
        status={query.status}
        label={t('commissions.loading')}
        endpoints={['GET /admin/ib/accruals']}
        onRetry={query.refetch}
        errorMessage={t('commissions.loadFailed')}
        error={query.error}
        fill
      >
        <DataTable
          fill
          caption={t('commissions.title')}
          columns={columns}
          rows={rows}
          rowKey={(r) => r.accrual.id}
          dimmed={query.isFetching}
          empty={<EmptyState icon={Coins} message={t('commissions.empty')} />}
          sortColumn={sortKey}
          sortDirection={url.sort.order}
          /*
           * Server-side, which is what makes the amount column safe to offer:
           * the ordering happens on the NUMERIC column, so "the largest
           * commission" means the largest of all of them rather than of the
           * twenty-five on screen. The page is dropped with the sort, because
           * reordering renumbers every page.
           */
          onSortChange={(column, direction) =>
            url.set({
              sort: column ?? undefined,
              order: direction ?? undefined,
              page: undefined,
            })
          }
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
            noun: [t('commissions.noun'), t('commissions.nounPlural')],
          }}
        />
      </AsyncBoundary>
    </div>
  );
}

/**
 * Pending, confirmed or reversed — and the three are not interchangeable.
 *
 * `pending` is what the engine calculated and the platform has NOT yet paid;
 * `confirmed` is credited money. Rendering them alike would let an operator
 * quote a partner a figure that has not been settled.
 */
function AccrualStatus({ status }: { status: string }) {
  if (status === 'confirmed')
    return <Badge variant="success">{t('commissions.status.confirmed')}</Badge>;
  if (status === 'reversed')
    return <Badge variant="destructive">{t('commissions.status.reversed')}</Badge>;
  return <Badge variant="warning">{t('commissions.status.pending')}</Badge>;
}
