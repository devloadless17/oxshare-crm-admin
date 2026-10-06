'use client';

import { AlertTriangle, CheckCircle2, ExternalLink, Unlock } from 'lucide-react';
import type { Column } from '@/components/data-table';
import { RowActions, actionsColumn, type RowAction } from '@/components/row-actions';
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
import { ClientIdentity } from '@/components/clients/client-identity';
import { ProviderNote } from '@/components/transactions/provider-note';

/**
 * The Financial table's columns, extracted so the page stays a composition.
 *
 * READ-ONLY for anything with a desk of its own: no approve, no reject, no
 * edit — the withdrawal desk (`/transactions`) owns those actions, with their
 * idempotency keys and confirmation dialogs, and duplicating them here would be
 * two lifecycles to keep honest. The one affordance is a LINK to that desk on
 * the rows it can action, and `PermittedLink` melts it into plain text for an
 * operator without `withdrawals.view`.
 *
 * ## The ONE exception: releasing a stuck transfer
 *
 * A transfer has no desk. It is machine-driven end to end — requested in the
 * portal, executed against MT5 by the bridge, settled by a scheduler — so this
 * table is the only screen in the console where one is ever looked at.
 *
 * When the bridge loses its MT5 session mid-call the transfer stays pending with
 * the client's money HELD, and nothing expires it. Sending an operator to a desk
 * that does not exist is why the only previous repair was hand-written SQL. The
 * action is offered here, gated on `transfers.abandon`, and everything dangerous
 * about it lives in the dialog rather than in this cell.
 *
 * ## And marking a flagged payment RESOLVED
 *
 * A deposit the payment platform reported differently, reversed, or paid after
 * it failed has no desk either — it is not waiting in any queue, it is a
 * settled row a person must reconcile. The badge says so on the row, and "Mark
 * resolved" (per direction: `deposits.approve` / `withdrawals.settle`, the
 * keys the API asks for) is how the admin task about it ends (backend 0140).
 */

const sortableBy = (key: TransactionSortKey) => ({ sortable: true as const, sortKey: key });

export function transactionColumns({
  maskedFields,
  onAbandon,
  onResolve,
  canResolve,
}: {
  /** RBAC-03 — the `financial.*` keys the response removed for this viewer. */
  maskedFields: readonly string[];
  /**
   * Opens the release-hold dialog for a stuck transfer.
   *
   * `undefined` when the viewer lacks `transfers.abandon`, which is what hides
   * the control — a button that comes back 403 is worse than no button.
   * UX only: `PermissionsGuard` is the enforcement (R-4.1).
   */
  onAbandon?: (row: TransactionRow) => void;
  /** Opens "Mark resolved" on a flagged payment; `undefined` hides it for everyone. */
  onResolve?: (row: TransactionRow) => void;
  /** Whether THIS viewer may resolve THIS row — the permission follows the direction. */
  canResolve?: (row: TransactionRow) => boolean;
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
       * spend a column communicating one fact about the viewer. The Portal ID
       * is never masked, so when everything readable is hidden it alone still
       * names the row.
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
        return <ClientIdentity name={name} email={email} portalId={row.user.portalId} />;
      },
    },
    {
      header: t('financial.colMovement'),
      sortable: false,
      cell: (row) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <MovementBadge row={row} />
        </div>
      ),
    },
    {
      /*
       * THE METHOD, a column of its own (the buyer: "a payment method is the
       * most important field in any transaction"). Only a payment has one; a
       * transfer's provider fallback ('transfer', 'commission') would repeat
       * the Movement badge, so it reads "—". `manual_admin` is the one provider
       * a screen may recognise by name (MANUAL_ADMIN_PROVIDER): such a row went
       * through no payment method, so its fallback is a machine key nobody
       * should read. Never the raw key on hover — the console never shows one
       * (backend 0161); the CSV's Provider column carries it.
       */
      header: t('financial.colMethod'),
      sortable: false,
      cell: (row) =>
        row.kind === 'payment' ? (
          <span className="whitespace-nowrap text-sm">
            {row.methodName === MANUAL_ADMIN_PROVIDER
              ? t('financial.methodManualCredit')
              : row.methodName}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
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
        /*
         * References are TRUNCATED, with the whole value on `title`. A provider
         * reference is whatever the provider issued — a uuid-length one widened
         * this column until `Created` slid under the pinned Actions column.
         * The full value is one hover away, and in the export.
         */
        <div className="flex max-w-[13rem] flex-col items-start gap-1">
          <TxStateBadge state={row.state} />
          {/*
            A payment only a PERSON can settle — with WHY on the row, because
            the flag alone reads as "the system is broken" and sends the
            operator to the logs. The full reason is on `title`.
          */}
          {row.needsAttention && (
            <>
              <span className="inline-flex items-center gap-1 rounded border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                {t('attention.badge')}
              </span>
              {row.attentionReason && (
                <span
                  className="block max-w-full truncate text-[11px] text-warning/90"
                  title={row.attentionReason}
                >
                  {row.attentionReason}
                </span>
              )}
            </>
          )}
          <ProviderNote note={row.providerNote} />
          {row.providerRef && (
            <span
              className="block max-w-full truncate font-mono text-[11px] text-muted-foreground"
              title={row.providerRef}
              data-external-ref=""
            >
              {row.providerRef}
            </span>
          )}
          {/*
            The payment provider's OWN id, under ours (`providerPaymentId`,
            backend 0173, every provider).
            A support ticket about a payment needs BOTH: theirs is the one
            the provider looks up directly, ours is what confirms it is the
            right row. It was stored from day one of the integration and rendered
            nowhere, so an operator had half the pair and an engineer had to
            run SQL for the other half.
            `title` carries a prefix because two bare monospace strings
            stacked are indistinguishable at 11px.
          */}
          {row.providerPaymentId && (
            <span
              className="block max-w-full truncate font-mono text-[11px] text-muted-foreground/70"
              title={`${t('financial.providerRefTitle')}: ${row.providerPaymentId}`}
              data-external-ref=""
            >
              {row.providerPaymentId}
            </span>
          )}
          {/*
            The desk link, only where the desk can actually act: a PENDING
            payment withdrawal. It opens THIS withdrawal's detail panel on the
            desk (`?open=`, its id is the desk's id) — never a search for the
            client's email, which listed every request of theirs and put an
            address a role may hide into a URL.
          */}
          {row.kind === 'payment' && row.direction === 'withdrawal' && row.state === 'pending' && (
            <PermittedLink
              href={`/transactions?open=${row.id}`}
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
    /*
     * Actions — the shared menu, so this table's one action sits where an
     * operator already looks for actions on every other table in the console.
     *
     * `RowActions` renders NOTHING when its items are empty, which is most rows
     * here: the column is quiet on a settled payment and grows a trigger only
     * on the rows that can actually be acted on.
     */
    actionsColumn<TransactionRow>((row) => (
      <RowActions
        items={transactionActions(row, { onAbandon, onResolve, canResolve })}
        label={t('financial.rowActionsLabel')}
      />
    )),
  ];
}

/**
 * What may be done to a movement — the row menu and the detail panel alike.
 * Each action is offered only where it can succeed for THIS viewer; the API
 * enforces the same rules (R-4.1).
 */
export function transactionActions(
  row: TransactionRow,
  {
    onAbandon,
    onResolve,
    canResolve,
  }: {
    onAbandon?: (row: TransactionRow) => void;
    onResolve?: (row: TransactionRow) => void;
    canResolve?: (row: TransactionRow) => boolean;
  },
): RowAction[] {
  const items: RowAction[] = [];

  /*
   * Release-hold, on a PENDING transfer only.
   *
   * Both transfer kinds qualify: a commission transfer moves money to a
   * trading account through the same bridge call and wedges the same way.
   *
   * Deliberately NOT offered on a pending PAYMENT — that one is waiting on a
   * person at the withdrawal desk, which is a queue working normally, not a
   * movement nobody will ever answer for.
   */
  if (
    onAbandon &&
    (row.kind === 'transfer' || row.kind === 'commission_transfer') &&
    row.state === 'pending'
  ) {
    items.push({
      label: t('financial.abandon'),
      icon: Unlock,
      onSelect: () => onAbandon(row),
      destructive: true,
    });
  }

  // Mark resolved — on a flagged PAYMENT, for a viewer holding the key its
  // direction needs. Transfers carry no flag, so they never qualify.
  if (onResolve && row.kind === 'payment' && row.needsAttention && canResolve?.(row)) {
    // An open HOSTED deposit is FINISHED there (credit what arrived, or close).
    const hostedOpen =
      row.direction === 'deposit' &&
      Boolean(row.providerPaymentId) &&
      (row.state === 'pending' || row.state === 'failure');
    items.push({
      label: hostedOpen ? t('attention.finishDeposit') : t('attention.resolve'),
      icon: CheckCircle2,
      onSelect: () => onResolve(row),
    });
  }
  return items;
}
