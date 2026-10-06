'use client';

import { Suspense } from 'react';
import { Receipt } from 'lucide-react';
import api from '@/lib/api';
import type { LedgerEntry, LedgerListResponse } from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { useDebounced } from '@/hooks/use-debounced';
import { useTableQueryState } from '@/hooks/use-table-query-state';
import { DEFAULT_PAGE_SIZE, limitParam, pageParam } from '@/lib/page-param';
import { UrlSearchInput } from '@/components/url-search-input';
import { DateRangePicker, PeriodWiden } from '@/components/date-range-picker';
import { useDateRange } from '@/hooks/use-date-range';
import { AsyncBoundary } from '@/components/async-boundary';
import { MaskedFieldsNotice } from '@/components/masked-value';
import { maskedFieldLabels } from '@/lib/masking';
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
 * ADM-13 — the append-only ledger. `GET /admin/ledger`.
 *
 * ## Why this screen exists
 *
 * The endpoint has been live, scoped and wrapped in the API client for a long
 * time, and nothing rendered it: ADM-13 asks for a view of "the commission and
 * transaction ledger, supporting filtering for review and reconciliation", and
 * only the commission half had a screen (`/commissions`, over `ib_accruals`).
 * The transaction half — every deposit, withdrawal, payout, rebate and
 * adjustment that has moved money — was reachable only with a database client.
 *
 * ## What makes this different from /transactions and /reconciliation
 *
 * `/transactions` is a WORK QUEUE: withdrawal requests an operator acts on.
 * `/reconciliation` answers one yes/no question about whether the books balance.
 * This is the evidence underneath both — the immutable record you read when the
 * answer is "no" and somebody has to find out why. That is why the three are
 * separate screens rather than tabs.
 *
 * ## Nothing here writes
 *
 * `ledger_entries` is append-only and a database TRIGGER rejects UPDATE and
 * DELETE (§6.4). A correction is a new compensating row, which is why this
 * screen offers no row actions at all — not disabled ones, none. Offering an
 * edit control that the database itself would refuse would teach an operator
 * that the ledger is editable.
 */
/** Which client columns a role can hide, in the words this screen uses. */
const LEDGER_FIELD_LABELS: Record<string, string> = {
  'client.email': t('ledger.colClient'),
  'client.firstName': t('ledger.colClient'),
  'client.lastName': t('ledger.colClient'),
};

export default function LedgerPage() {
  // `useSearchParams()` needs a Suspense boundary at prerender or `npm run
  // build` fails — and `next dev` does not, so CI is where you would find out.
  return (
    <Suspense fallback={<PageLoader label={t('ledger.loading')} />}>
      <LedgerPageContent />
    </Suspense>
  );
}

/** The six values `ledger_entries.entry_type` can hold. */
const ENTRY_TYPES = [
  'deposit',
  'withdrawal',
  'commission',
  'rebate',
  'payout',
  'adjustment',
] as const;

function LedgerPageContent() {
  const url = useTableQueryState();
  const page = pageParam(url.get('page'));
  const pageSize = limitParam(url.get('limit'));
  const entryType = url.get('entryType');
  /*
   * ONE client's ledger, when the URL names one.
   *
   * `GET /admin/ledger` has always taken `userId`. Reading it from the query
   * string is what lets a client profile link straight to "every movement on
   * this account" — the same shape `/commissions?ibUserId=` uses for a partner.
   */
  const userId = url.get('userId');
  /*
   * SEARCH BY THE CLIENT THIS SCREEN NOW NAMES. The Client column gained a name
   * and an email; without this the only way to narrow to a person was `userId`
   * — a uuid printed nowhere on the page — so half the screen spoke in names
   * and the other half in ids. `userId` is untouched, because a client profile
   * links straight here with one.
   */
  const q = useDebounced(url.get('q').trim());
  /*
   * ONE wallet's ledger — the reconciliation read. `GET /admin/ledger` has
   * always taken `walletId`; nothing set it until the wallet column below.
   * Filtering keys on the uuid, which every row carries — the wallet NUMBER is
   * what the cell displays, never what the query uses.
   */
  const walletId = url.get('walletId');
  /*
   * The period opens on TODAY — the ledger only ever grows, and its whole
   * history is the last thing a reader wants by default. A deep link to one
   * client's or one wallet's ledger opens on All time: that is a
   * reconciliation, and it must start complete.
   */
  const period = useDateRange(url, userId || walletId ? 'all' : 'today');

  const params = {
    page,
    limit: pageSize,
    entryType: entryType || undefined,
    q: q || undefined,
    userId: userId || undefined,
    walletId: walletId || undefined,
    from: period.range.from,
    to: period.range.to,
  };

  const query = useResource<LedgerListResponse>(keys.ledger.list(params), (signal) =>
    api.admin.getLedger(params, signal),
  );

  const rows = query.data?.items ?? [];
  const total = query.data?.total ?? 0;

  /*
   * NO SORTING, and that is deliberate rather than unfinished.
   *
   * `GET /admin/ledger` takes no `sort` or `order`, so the only sort available
   * would be DataTable's client-side one — over the twenty-five rows on screen.
   * On a ledger that is worse than no sorting: "the largest adjustment" would
   * mean the largest of the current page, and an operator reconciling a
   * discrepancy would draw a conclusion from a slice. R-2.5 names exactly this.
   *
   * Ordering already comes from the API, newest first, which is the order this
   * screen is read in. If sorting is wanted it belongs on the endpoint.
   */
  const columns: Column<LedgerEntry>[] = [
    {
      header: t('ledger.colWhen'),
      sortable: false,
      cell: (r) => new Date(r.createdAt).toLocaleString(),
      cellClassName: 'text-muted-foreground whitespace-nowrap',
    },
    {
      header: t('ledger.colClient'),
      sortable: false,
      /*
       * WHOSE MONEY THIS IS, in words. This rendered `r.userId` — a raw uuid —
       * under a header reading "Client", on the screen an operator opens
       * precisely to ask that question. `/wallets` and `/trading-accounts` have
       * shown a named Owner all along, so the ledger was inconsistent with its
       * siblings rather than deliberately anonymous.
       *
       * Two cases leave the name and email unreadable, and they are
       * different on purpose:
       *   MASKED  -> the fields are ABSENT, because `maskByShape` removes the
       *              key rather than blanking it. The notice above the table
       *              says which columns this role hides, once — the convention
       *              `/clients` settled on rather than a redaction chip in
       *              every row. The Portal ID is never masked and names the row.
       *   DELETED -> the fields are NULL, from the LEFT join, the Portal ID
       *              with them. `ledger_entries` is append-only, so an entry
       *              whose client row has gone must still appear — and says so,
       *              rather than dropping silently or printing a bare uuid.
       */
      cell: (r) => (
        <ClientIdentity
          name={clientName(r.userFirstName, r.userLastName)}
          email={r.userEmail}
          portalId={r.userPortalId}
          removedId={String(r.userId)}
        />
      ),
    },
    {
      /*
       * The wallet a movement belongs to, as its NUMBER — the identifier the
       * rest of the console now shows. Clicking it scopes the ledger to that
       * wallet, which is the "follow one wallet down the page" read the
       * balance column exists for; the uuid stays on `title` and does the
       * actual filtering.
       */
      header: t('ledger.colWallet'),
      sortable: false,
      cell: (r) => (
        <button
          type="button"
          title={r.walletId}
          onClick={() => url.set({ walletId: r.walletId, page: undefined })}
          className="focus-outline font-mono text-xs underline-offset-2 hover:underline"
        >
          {r.walletNumber}
        </button>
      ),
    },
    {
      header: t('ledger.colType'),
      sortable: false,
      cell: (r) => <EntryType type={r.entryType} />,
    },
    {
      /*
       * SIGNED, and formatted through decimal.js (§6.1). `amount` is a string
       * and stays one all the way to the DOM — `Number()` on it is a lint error
       * on this path, because it is already wrong past 2^53 before formatting
       * begins. The sign is what distinguishes money arriving from money
       * leaving, so it is never stripped.
       */
      header: t('ledger.colAmount'),
      align: 'right',
      sortable: false,
      cell: (r) => (
        <span className={r.amount.trim().startsWith('-') ? 'text-destructive' : 'text-success'}>
          {formatMoney(r.amount, r.currency)}
        </span>
      ),
      cellClassName: 'font-mono font-semibold whitespace-nowrap tabular',
    },
    {
      /*
       * The running balance the entry PRODUCED, stored on the row rather than
       * recomputed here (§6.2). Showing it beside the amount is what makes this
       * screen usable for reconciliation: an operator can follow one wallet
       * down the page and see where it stopped agreeing.
       */
      header: t('ledger.colBalance'),
      align: 'right',
      sortable: false,
      cell: (r) => formatMoney(r.balanceAfter, r.currency),
      cellClassName: 'font-mono text-muted-foreground whitespace-nowrap tabular',
    },
    {
      header: t('ledger.colReference'),
      sortable: false,
      cell: (r) => (
        <span className="text-xs text-muted-foreground">
          {r.referenceType}
          {r.referenceId ? ` · ${r.referenceId}` : ''}
        </span>
      ),
      cellClassName: 'font-mono',
    },
  ];

  const filtered = Boolean(
    entryType || q || userId || walletId || period.choice !== period.defaultChoice,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">{t('ledger.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('ledger.subtitle')}</p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <UrlSearchInput
          value={url.get('q')}
          label={t('ledger.filterClient')}
          placeholder={t('ledger.filterClientPlaceholder')}
          title={t('ledger.filterClientHint')}
          // Filter and page written together, so narrowing always lands on page
          // one rather than past the end of the new result set.
          onChange={(next) => url.set({ q: next || undefined, page: undefined })}
        />

        <DateRangePicker
          choice={period.choice}
          custom={period.custom}
          defaultChoice={period.defaultChoice}
          onChange={period.set}
        />

        <Select
          value={entryType || 'all'}
          onValueChange={(value) =>
            url.set({ entryType: value === 'all' ? undefined : value, page: undefined })
          }
        >
          <SelectTrigger className="h-9 w-56" aria-label={t('ledger.filterType')}>
            <SelectValue placeholder={t('ledger.filterTypeAll')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('ledger.filterTypeAll')}</SelectItem>
            {ENTRY_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {entryTypeLabel(type)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {filtered && (
          <button
            type="button"
            onClick={() => url.clear()}
            className="focus-outline h-9 rounded-lg border border-input bg-card px-3 text-xs font-medium hover:bg-muted"
          >
            {t('ledger.clearFilters')}
          </button>
        )}

        {/*
          Says WHOSE ledger this is when the URL names one client. Without it a
          filtered view and the whole platform look identical, and an operator
          reconciling a shortfall could believe they were looking at everything.
        */}
        {userId && (
          <span className="text-xs text-muted-foreground">{t('ledger.scopedToClient')}</span>
        )}

        {/* Same honesty for a wallet scope: a filtered view must say so. */}
        {walletId && (
          <span className="text-xs text-muted-foreground">{t('ledger.scopedToWallet')}</span>
        )}
      </div>

      <MaskedFieldsNotice
        labels={maskedFieldLabels(query.data?.maskedFields ?? [], LEDGER_FIELD_LABELS)}
      />

      <AsyncBoundary
        status={query.status}
        label={t('ledger.loading')}
        endpoints={['GET /admin/ledger']}
        onRetry={query.refetch}
        errorMessage={t('ledger.loadFailed')}
        error={query.error}
        fill
      >
        <DataTable
          fill
          caption={t('ledger.title')}
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          dimmed={query.isFetching}
          empty={
            <EmptyState
              icon={Receipt}
              message={t('ledger.empty')}
              action={<PeriodWiden choice={period.choice} onChange={period.set} />}
            />
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
            noun: [t('ledger.noun'), t('ledger.nounPlural')],
          }}
        />
      </AsyncBoundary>
    </div>
  );
}

function entryTypeLabel(type: string): string {
  switch (type) {
    case 'deposit':
      return t('ledger.type.deposit');
    case 'withdrawal':
      return t('ledger.type.withdrawal');
    case 'commission':
      return t('ledger.type.commission');
    case 'rebate':
      return t('ledger.type.rebate');
    case 'payout':
      return t('ledger.type.payout');
    case 'adjustment':
      return t('ledger.type.adjustment');
    default:
      // A type the API grew and this screen has not learned yet. Showing the raw
      // value is honest; inventing a label or rendering blank is not.
      return type;
  }
}

/**
 * Money IN is not money OUT, and an adjustment is neither.
 *
 * The colour carries the same information as the sign on the amount, twice on
 * purpose — an operator scanning a column of figures reads the badge first.
 */
function EntryType({ type }: { type: string }) {
  const label = entryTypeLabel(type);
  if (type === 'deposit' || type === 'commission' || type === 'rebate')
    return <Badge variant="success">{label}</Badge>;
  if (type === 'withdrawal' || type === 'payout')
    return <Badge variant="destructive">{label}</Badge>;
  return <Badge variant="warning">{label}</Badge>;
}
