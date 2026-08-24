'use client';

import { Badge } from '@/components/ui/badge';
import type { TransactionRow } from '@/lib/api/admin';
import { t } from '@/lib/i18n';

/**
 * The Financial page's three vocabularies, each as a labelled badge.
 *
 * Lifted from the client profile's activity panel (the variant logic is the
 * same mapping, kept byte-compatible on purpose) but with `t()` labels instead
 * of `className="capitalize"` on the raw enum — `commission_transfer` cannot
 * be rescued by a capitalize, and a translated screen must not print enum
 * values anywhere.
 *
 * Every label function falls back to the RAW value for something the API grew
 * and this screen has not learned — the ledger's `entryTypeLabel` rule:
 * showing the raw value is honest; inventing a label or rendering blank is not.
 */

export function directionLabel(direction: string): string {
  switch (direction) {
    case 'deposit':
      return t('financial.direction.deposit');
    case 'withdrawal':
      return t('financial.direction.withdrawal');
    default:
      return direction;
  }
}

export function kindLabel(kind: string): string {
  switch (kind) {
    case 'payment':
      return t('financial.kind.payment');
    case 'transfer':
      return t('financial.kind.transfer');
    case 'commission_transfer':
      return t('financial.kind.commission_transfer');
    default:
      return kind;
  }
}

export function stateLabel(state: string): string {
  switch (state) {
    case 'pending':
      return t('financial.state.pending');
    case 'approved':
      return t('financial.state.approved');
    case 'success':
      return t('financial.state.success');
    case 'failure':
      return t('financial.state.failure');
    case 'rejected':
      return t('financial.state.rejected');
    default:
      return state;
  }
}

/**
 * WHAT a movement is, in one cell: payments print their wallet-side direction;
 * both transfer kinds print their kind INSTEAD, because "Withdrawal" on a
 * wallet→account transfer would read as money leaving the platform — the
 * union's own documentation forbids printing the direction words for a
 * transfer (`kind` exists for exactly this).
 */
export function MovementBadge({ row }: { row: Pick<TransactionRow, 'kind' | 'direction'> }) {
  if (row.kind !== 'payment') {
    return <Badge variant="tag">{kindLabel(row.kind)}</Badge>;
  }
  return (
    <Badge variant={row.direction === 'deposit' ? 'success' : 'warning'}>
      {directionLabel(row.direction)}
    </Badge>
  );
}

/**
 * `approved` and `success` share the good colour because they are the same
 * outcome (approving a withdrawal pays it); `rejected` and `failure` share
 * the bad one; only `pending` is amber — the client profile's mapping,
 * asserted there against the real enum.
 */
export function TxStateBadge({ state }: { state: string }) {
  return (
    <Badge
      variant={
        state === 'approved' || state === 'success'
          ? 'success'
          : state === 'rejected' || state === 'failure'
            ? 'destructive'
            : 'warning'
      }
    >
      {stateLabel(state)}
    </Badge>
  );
}
