'use client';

import { ExternalLink } from 'lucide-react';
import type { Column } from '@/components/data-table';
import { PermittedLink } from '@/components/permitted-link';
import { MovementBadge, TxStateBadge } from '@/components/financial/transaction-badges';
import {
  MANUAL_ADMIN_PROVIDER,
  type TransactionRow,
  type TransactionSortKey,
} from '@/lib/api/admin';
import { isMasked } from '@/lib/masking';
import { formatMoney } from '@/lib/money';
import { t } from '@/lib/i18n';

/**
 * The Financial table's columns, extracted so the page stays a composition.
 *
 * READ-ONLY by contract: no approve, no reject, no edit — the withdrawal desk
 * (`/transactions`) owns those actions, with their idempotency keys and
 * confirmation dialogs, and duplicating them here would be two lifecycles to
 * keep honest. The one affordance is a LINK to that desk on the rows it can
 * action, and `PermittedLink` melts it into plain text for an operator
 * without `withdrawals.view`.
 */

const sortableBy = (key: TransactionSortKey) => ({ sortable: true as const, sortKey: key });

export function transactionColumns({
  maskedFields,
}: {
  /** RBAC-03 — the `financial.*` keys the response removed for this viewer. */
  maskedFields: readonly string[];
}): Column<TransactionRow>[] {
  const hidden = (field: string) => isMasked(field, maskedFields);
  const nameHidden = hidden('financial.user.firstName') && hidden('financial.user.lastName');
  const emailHidden = hidden('financial.user.email');

  return [
    {
      header: t('financial.colClient'),
      // NOT sortable: the union cannot serve a joined-column sort from its
      // per-arm indexes, so the endpoint does not offer `userEmail` (R-2.5 —
      // declaring it here would produce a 400, not an ordering).
      sortable: false,
      /*
       * RBAC-03: hidden parts are DROPPED, and the notice above the table
       * says so once (the clients-list pattern) — 25 rows of `••••` would
       * spend a column communicating one fact about the viewer. When
       * everything readable is hidden the cell falls back to the client id,
       * which the catalog keeps unmaskable because rows are addressed by it.
       */
      cell: (row) => {
        const name = nameHidden
          ? undefined
          : [
              hidden('financial.user.firstName') ? undefined : row.user.firstName,
              hidden('financial.user.lastName') ? undefined : row.user.lastName,
            ]
              .filter(Boolean)
              .join(' ');
        const email = emailHidden ? undefined : row.user.email;
        if (!name && !email) {
          return <span className="font-mono text-xs">{row.user.id}</span>;
        }
        return (
          <div className="min-w-0">
            {name && <div className="font-medium text-foreground">{name}</div>}
            {email && <div className="truncate text-xs text-muted-foreground">{email}</div>}
          </div>
        );
      },
    },
    {
      header: t('financial.colMovement'),
      sortable: false,
      cell: (row) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <MovementBadge row={row} />
          {/*
            A payment's method name earns a second line only when it says more
            than the badge — 'Whish Money' does, the transfer kinds' provider
            fallbacks ('transfer', 'commission') repeat the badge and stay off.
            `manual_admin` is the one provider a screen may recognise by name
            (see MANUAL_ADMIN_PROVIDER): such a row went through no payment
            method, so its fallback is a machine key nobody should read.
          */}
          {row.kind === 'payment' && (
            <span className="text-xs text-muted-foreground" title={row.provider}>
              {row.methodName === MANUAL_ADMIN_PROVIDER
                ? t('financial.methodManualCredit')
                : row.methodName}
            </span>
          )}
        </div>
      ),
    },
    {
      header: t('financial.colAmount'),
      align: 'right',
      // Server-side ordering on the NUMERIC column — a true decimal ordering
      // over the whole filtered set, which is what makes this safe to offer.
      ...sortableBy('amount'),
      /*
       * FORMATTED through decimal.js, never coerced (§6.1) — `amount` is a
       * string and stays one to the DOM. The raw stored value rides on
       * `title` so an operator can read the full 8-decimal figure the ledger
       * holds without the column shouting it at everyone.
       */
      cell: (row) => <span title={row.amount}>{formatMoney(row.amount, row.currency)}</span>,
      cellClassName: 'font-mono font-semibold text-foreground whitespace-nowrap tabular',
    },
    {
      header: t('financial.colCurrency'),
      sortable: false,
      cell: (row) => <span className="font-mono text-xs font-semibold">{row.currency}</span>,
    },
    {
      header: t('financial.colState'),
      ...sortableBy('state'),
      cell: (row) => (
        <div className="flex flex-col items-start gap-1">
          <TxStateBadge state={row.state} />
          {row.providerRef && (
            <span className="font-mono text-[11px] text-muted-foreground" title={row.providerRef}>
              {row.providerRef}
            </span>
          )}
          {/*
            The desk link, only where the desk can actually act: a PENDING
            payment withdrawal. The desk's q-filter lands on this client's
            requests (state=all so an already-actioned row still resolves) —
            unless the email is masked for this viewer, in which case the link
            goes to the whole desk rather than smuggling the hidden value into
            a URL.
          */}
          {row.kind === 'payment' && row.direction === 'withdrawal' && row.state === 'pending' && (
            <PermittedLink
              href={
                row.user.email && !emailHidden
                  ? `/transactions?state=all&q=${encodeURIComponent(row.user.email)}`
                  : '/transactions?state=all'
              }
              className="focus-outline inline-flex items-center gap-1 text-xs text-link underline-offset-2 hover:underline"
            >
              {t('financial.openInDesk')}
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </PermittedLink>
          )}
        </div>
      ),
    },
    {
      header: t('financial.colCreated'),
      ...sortableBy('createdAt'),
      cell: (row) => new Date(row.createdAt).toLocaleString(),
      cellClassName: 'text-muted-foreground whitespace-nowrap',
    },
    {
      header: t('financial.colSettled'),
      sortable: false,
      // A dash is honest here: a pending movement has not settled, and
      // printing the created date instead would claim it had.
      cell: (row) => (row.settledAt ? new Date(row.settledAt).toLocaleString() : '—'),
      cellClassName: 'text-muted-foreground whitespace-nowrap',
    },
  ];
}
