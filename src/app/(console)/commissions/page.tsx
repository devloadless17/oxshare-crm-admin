'use client';

import { Suspense } from 'react';
import Decimal from 'decimal.js';
import { Coins } from 'lucide-react';
import api from '@/lib/api';
import {
  IB_ACCRUAL_SORT_KEYS,
  type IbAccrual,
  type IbAccrualPage,
  type IbAccrualPerson,
  type IbAccrualSortKey,
} from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { OpenedRecord, useOpenedRecord } from '@/components/notifications/opened-record';
import { useDebounced } from '@/hooks/use-debounced';
import { useTableQueryState } from '@/hooks/use-table-query-state';
import { DEFAULT_PAGE_SIZE, limitParam, pageParam } from '@/lib/page-param';
import { UrlSearchInput } from '@/components/url-search-input';
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
import { ClientIdentity, clientName } from '@/components/clients/client-identity';

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
   * COMMISSION or REBATE — the two things `ib_accruals` holds.
   *
   * One screen with a filter rather than two screens, because they are the same
   * table differing by one column: same partner, same client, same rate, same
   * rung, same reversal. Two pages would be two sets of columns, sorting,
   * permissions and masking to keep in step, and the masking is the one that
   * would eventually drift — RBAC-03 client identity is applied in the store's
   * mapper, and a second screen is a second chance to forget it.
   *
   * Absent means BOTH, which is the honest default: an operator asking "what
   * did this partner generate" wants the rebate their client received as much
   * as the commission the partner earned.
   */
  const kind = url.get('kind');
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
  /*
   * SEARCH BY THE PARTNER THIS SCREEN NAMES. The Partner column shows a name,
   * an email and a Portal ID; `ibUserId` above arrives from a partner's profile
   * (as their Portal ID, which the API resolves) — and until this landed the
   * only way to narrow to the partner whose rows you were reading was to leave
   * for another screen and copy an id back.
   *
   * It searches the PARTNER only, and the API is where that is enforced: each
   * row also names a client, whose identity is masked when they sit outside the
   * reader's territory, and a filter matching that would return the masked
   * person as a row count.
   */
  const q = useDebounced(url.get('q').trim());

  const sortKey = IB_ACCRUAL_SORT_KEYS.includes(url.sort.key as IbAccrualSortKey)
    ? (url.sort.key as IbAccrualSortKey)
    : undefined;

  const params = {
    page,
    limit: pageSize,
    status: status || undefined,
    kind: kind || undefined,
    ibUserId: ibUserId || undefined,
    q: q || undefined,
    sort: sortKey,
    // Withheld when nothing is sorted: `order` alone describes an ordering of no
    // column, and sending it would cache one result set under two query keys.
    order: sortKey ? url.sort.order : undefined,
  };

  const query = useResource<IbAccrualPage>(keys.ibAccruals.list(params), (signal) =>
    api.admin.getIbAccruals(params, signal),
  );

  // The one accrual a notification opened (`?open=`), in any status.
  const opened = useOpenedRecord(keys.ibAccruals.list, (p, signal) =>
    api.admin.getIbAccruals(p, signal),
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
      /*
       * EITHER person on this row can be outside the reader's territory, and
       * the server nulls whichever it is. A row is visible because its
       * BENEFICIARY is in territory — the partner on a commission, the client
       * on a rebate — so the other party is regularly someone this desk holds
       * no territory over.
       *
       * Said in words rather than left blank: an empty name and an empty email
       * read as missing data, and an operator goes looking for a bug that is
       * not there.
       */
      cell: (r) => <Person person={r.partner} masked={r.partnerMasked} strong />,
    },
    {
      header: t('commissions.colClient'),
      sortable: false,
      cell: (r) => <Person person={r.client} masked={r.clientMasked} />,
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
       * WHICH LEG this row is — and it earns a column precisely because the
       * list mixes them by default.
       *
       * The two are paid to DIFFERENT PEOPLE from the same trade: a commission
       * goes to the partner in the Partner column, a rebate goes to the client
       * in the Client column. Without this, two rows with the same partner,
       * client and rate look like a duplicate rather than the two halves of one
       * trade, and an operator reconciling a payout cannot tell who received
       * which amount.
       */
      header: t('commissions.colKind'),
      // NOT sortable: `kind` is absent from IB_ACCRUAL_SORT_KEYS, so the API
      // answers 400 and the whole table fails to load.
      sortable: false,
      cell: (r) => (
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
            r.accrual.kind === 'rebate'
              ? 'border-border bg-muted text-muted-foreground'
              : 'border-primary/30 bg-primary/10 text-primary'
          }`}
        >
          {r.accrual.kind === 'rebate'
            ? t('commissions.kind.rebate')
            : t('commissions.kind.commission')}
        </span>
      ),
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
      header: t('commissions.colTerms'),
      // NOT sortable, for the same reason as Kind: `termsName` is not on the
      // API's allow-list.
      sortable: false,
      cell: (r) => r.accrual.termsName ?? '—',
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

      <OpenedRecord
        open={opened}
        row={opened.query.data?.rows[0]}
        columns={columns}
        rowKey={(r) => r.accrual.id}
        subjectKind="ib_accrual"
      />

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
        <UrlSearchInput
          value={url.get('q')}
          label={t('commissions.filterPartner')}
          placeholder={t('commissions.filterPartnerPlaceholder')}
          title={t('commissions.filterPartnerHint')}
          // Filter and page written together, so narrowing always lands on page
          // one rather than past the end of the new result set.
          onChange={(next) => url.set({ q: next || undefined, page: undefined })}
        />

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

        <Select
          value={kind || 'all'}
          onValueChange={(value) =>
            url.set({ kind: value === 'all' ? undefined : value, page: undefined })
          }
        >
          <SelectTrigger className="h-9 w-48" aria-label={t('commissions.filterKind')}>
            <SelectValue placeholder={t('commissions.filterKindAll')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('commissions.filterKindAll')}</SelectItem>
            <SelectItem value="commission">{t('commissions.kind.commission')}</SelectItem>
            <SelectItem value="rebate">{t('commissions.kind.rebate')}</SelectItem>
          </SelectContent>
        </Select>

        {(status || kind || q) && (
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
/**
 * One of the two people on an accrual row, or an honest statement that this
 * reader may not see them.
 *
 * ## Why a masked person is not just a blank
 *
 * Territory decides which ROWS exist to a reader; it does not follow that both
 * people named on a visible row are in that territory. A commission is visible
 * through its partner and names a client who may be elsewhere; a rebate is
 * visible through its client and names the partner whose rung produced it, who
 * may equally be elsewhere. The server nulls the identity of whichever one is
 * out of territory and sets the flag.
 *
 * Rendering that as an em dash and an empty line makes a deliberate redaction
 * look like broken data — on a money screen, where the first response to
 * missing data is to doubt the figures beside it.
 */
function Person({
  person,
  masked,
  strong = false,
}: {
  person: IbAccrualPerson;
  masked: boolean;
  strong?: boolean;
}) {
  // Outside the reader's territory the server nulls every identifier, the
  // Portal ID included — say so rather than rendering a blank.
  if (masked) {
    return (
      <span className="text-xs text-muted-foreground italic">{t('commissions.outsideScope')}</span>
    );
  }
  return (
    <ClientIdentity
      name={clientName(person.firstName, person.lastName)}
      email={person.email}
      portalId={person.portalId}
      strong={strong}
    />
  );
}

function AccrualStatus({ status }: { status: string }) {
  if (status === 'confirmed')
    return <Badge variant="success">{t('commissions.status.confirmed')}</Badge>;
  if (status === 'reversed')
    return <Badge variant="destructive">{t('commissions.status.reversed')}</Badge>;
  return <Badge variant="warning">{t('commissions.status.pending')}</Badge>;
}
