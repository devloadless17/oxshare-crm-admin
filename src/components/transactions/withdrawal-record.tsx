'use client';

import * as React from 'react';
import { clientLabel } from '@/components/clients/client-identity';
import type { Column } from '@/components/data-table';
import { RecordCallout, RecordSheet } from '@/components/record-sheet';
import type { RowAction } from '@/components/row-actions';
import type { OpenedRecordState } from '@/hooks/use-open-record';
import type { WithdrawalRow, WithdrawalState } from '@/lib/api/admin';
import { t, type MessageKey } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import { PayoutBadge } from './withdrawal-payout';
import { DepositDetailsCell } from '@/components/deposits/deposit-details-cell';

/**
 * A withdrawal's state in the desk's words and colours — ONE map, shared by the
 * table's pill and the detail panel's header, so the two cannot spell a state
 * two ways.
 */
export const WITHDRAWAL_STATE_META: Record<
  WithdrawalState,
  { labelKey: MessageKey; classes: string }
> = {
  pending: {
    labelKey: 'withdrawals.statePending',
    classes: 'bg-warning/10 text-warning border-warning/20',
  },
  /*
   * `approved` and `success` are DIFFERENT facts again, and the badge colour
   * is the distinction that matters most on this screen.
   *
   * The two were collapsed into one green "Approved" when approval paid in one
   * step — at that time `approved` was a state nothing new entered. The
   * two-lifecycle split (D-66) reversed that: on the whish rail, approval
   * submits the payout to Rival and the row WAITS here until Rival's operator
   * pays or refuses. Money has left the client's wallet (debit is at request
   * time) but has NOT reached the client — rendering that in the same green as
   * "paid" is exactly the hesitation-free misread this queue cannot afford.
   *
   * So: amber "Awaiting payout" while Rival holds it, green "Approved" once
   * settled. Historical desk rows stranded in `approved` (pre-split) render
   * amber too — for them it is still the honest colour, because nothing on
   * this console has confirmed the payout.
   */
  approved: {
    labelKey: 'withdrawals.stateAwaitingPayout',
    classes: 'bg-warning/10 text-warning border-warning/20',
  },
  success: {
    labelKey: 'withdrawals.stateApproved',
    classes: 'bg-success/10 text-success border-success/20',
  },
  rejected: {
    labelKey: 'withdrawals.stateRejected',
    classes: 'bg-destructive/10 text-destructive border-destructive/20',
  },
  failure: {
    labelKey: 'withdrawals.stateFailed',
    classes: 'bg-destructive/10 text-destructive border-destructive/20',
  },
};

export function WithdrawalStateBadge({ state }: { state: WithdrawalState }) {
  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${WITHDRAWAL_STATE_META[state].classes}`}
    >
      {t(WITHDRAWAL_STATE_META[state].labelKey)}
    </span>
  );
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

/**
 * The withdrawals desk's detail panel: the desk's own columns and actions, plus
 * what a payout needs that a table row has no room for — both references, who
 * decided and when, and WHY it ended as it did.
 *
 * The reason's label follows the STATE, never which field is set:
 * `transactions.service.ts` writes `rejectionReason` when a reviewer rejects
 * AND when a payout fails, and calling a provider error a "rejection" would
 * attribute it to a person.
 */
export function WithdrawalRecordSheet({
  open,
  columns,
  actions,
  extraActions,
}: {
  open: OpenedRecordState<{ items: WithdrawalRow[] }>;
  columns: Column<WithdrawalRow>[];
  actions: (w: WithdrawalRow) => RowAction[];
  extraActions?: (w: WithdrawalRow) => React.ReactNode;
}) {
  return (
    <RecordSheet
      open={open}
      row={open.query.data?.items[0]}
      rowKey={(w) => w.id}
      subjectKind="transaction"
      title={(w) => t('records.withdrawal', { amount: formatMoney(w.amount, w.currency) })}
      status={(w) => <WithdrawalStateBadge state={w.state} />}
      callout={(w) => (
        <>
          {(w.state === 'rejected' || w.state === 'failure') && (
            <RecordCallout
              tone={w.state === 'failure' ? 'destructive' : 'warning'}
              label={
                w.state === 'failure'
                  ? t('withdrawals.detailsFailureReason')
                  : t('withdrawals.detailsRejectionReason')
              }
            >
              {w.rejectionReason ?? t('withdrawals.detailsNoReason')}
            </RecordCallout>
          )}
          {w.providerNote && (
            <RecordCallout tone="info" label={t('transactions.providerNoteLabel')}>
              {w.providerNote}
            </RecordCallout>
          )}
          {w.needsAttention && w.attentionReason && (
            <RecordCallout tone="warning" label={t('withdrawals.payoutNeedsAttention')}>
              {w.attentionReason}
            </RecordCallout>
          )}
          {w.state === 'pending' && w.payoutPlan?.payer === 'paused' && w.payoutPlan.reason && (
            <RecordCallout tone="warning" label={t('withdrawals.payoutPaused')}>
              {w.payoutPlan.reason}
            </RecordCallout>
          )}
        </>
      )}
      omit={[t('withdrawals.colAmount'), t('withdrawals.colState')]}
      extraFields={(w) => [
        {
          label: t('withdrawals.detailsProviderRef'),
          value: w.providerRef ? (
            <span className="break-all font-mono" data-external-ref="">
              {w.providerRef}
            </span>
          ) : null,
        },
        {
          label: t('withdrawals.detailsProviderPayoutRef'),
          value: w.providerPayoutId ? (
            <span className="break-all font-mono">{w.providerPayoutId}</span>
          ) : null,
        },
        {
          label: t('withdrawals.detailsPayout'),
          value: w.state === 'approved' && !w.needsAttention ? <PayoutBadge w={w} /> : null,
        },
        {
          // WHO, then when — the id is on every decision; the name is left out
          // rather than guessed when that administrator has since been deleted.
          label: t('withdrawals.detailsReviewed'),
          value: w.reviewedAt
            ? w.reviewedByName
              ? `${w.reviewedByName} · ${formatDateTime(w.reviewedAt)}`
              : formatDateTime(w.reviewedAt)
            : null,
        },
        {
          label: t('withdrawals.detailsSettled'),
          value: w.settledAt ? formatDateTime(w.settledAt) : null,
        },
        {
          // What the rail told the client when they asked (backend 0202), as a copy.
          label: t('withdrawals.detailsShown'),
          value: w.payToDetails?.length ? <DepositDetailsCell details={w.payToDetails} /> : null,
        },
      ]}
      columns={columns}
      actions={actions}
      extraActions={extraActions}
    />
  );
}

/** "Open withdrawal of $12.50 from John Doe" — a clickable row's name. */
export function withdrawalRowLabel(w: WithdrawalRow): string {
  return t('records.openRow', {
    name: `${t('records.withdrawal', { amount: formatMoney(w.amount, w.currency) })} — ${clientLabel(w.user)}`,
  });
}
