'use client';

import * as React from 'react';
import type { TransactionRow } from '@/lib/api/admin';
import { Modal } from '@/components/ui/modal';
import { CopyableId } from '@/components/copyable-id';
import { DepositReceiptCell } from '@/components/deposits/deposit-receipt-cell';
import { TxStateBadge } from '@/components/financial/transaction-badges';
import { formatMoney } from '@/lib/money';
import { t } from '@/lib/i18n';
import { movementMethodLabel, transferDirectionLabel } from './movement-labels';

/**
 * EVERYTHING about one money movement — the profile's Details view (owner,
 * 29 Sep 2026): what it was, where it stands, what it went through, the
 * receipt when a deposit carries one, why it was refused, and when each step
 * happened. A field this movement does not have is left out rather than shown
 * as a dash, so the view reads as a description of THIS row.
 *
 * The amount is the decimal STRING the API sent, formatted and never parsed
 * into a number (§6.1).
 */
export function TransactionDetailsModal({
  row,
  onClose,
}: {
  row: TransactionRow | null;
  onClose: () => void;
}) {
  return (
    <Modal
      open={row !== null}
      onClose={onClose}
      labelledBy="client-tx-details-title"
      title={t('clientProfile.txDetailsTitle')}
    >
      {row && (
        <dl className="grid gap-x-6 gap-y-3 text-xs sm:grid-cols-2">
          <Detail label={t('clientProfile.txColAmount')}>
            <span className="tabular text-sm font-semibold">
              {formatMoney(row.amount, row.currency)}
            </span>
          </Detail>
          <Detail label={t('clientProfile.txColState')}>
            <TxStateBadge state={row.state} />
          </Detail>
          <Detail label={t('clientProfile.txColType')}>
            {row.kind === 'transfer'
              ? transferDirectionLabel(row.direction)
              : row.direction === 'deposit'
                ? t('clientProfile.txTypeDeposit')
                : t('clientProfile.txTypeWithdrawal')}
          </Detail>
          {row.kind !== 'transfer' && (
            <Detail label={t('clientProfile.txColMethod')}>{movementMethodLabel(row)}</Detail>
          )}
          {row.kind === 'payment' && row.direction === 'deposit' && (
            <Detail label={t('clientProfile.txReceipt')}>
              <DepositReceiptCell filename={row.proofFilename} />
            </Detail>
          )}
          {row.destination && (
            <Detail label={t('clientProfile.txDestination')}>
              <span className="break-all font-mono">{row.destination}</span>
            </Detail>
          )}
          {row.providerRef && (
            <Detail label={t('clientProfile.txReference')}>
              <span className="break-all font-mono">{row.providerRef}</span>
            </Detail>
          )}
          {row.rivalExternalId && (
            <Detail label={t('clientProfile.txProviderId')}>
              <span className="break-all font-mono">{row.rivalExternalId}</span>
            </Detail>
          )}
          {row.tradingAccountId && (
            <Detail label={t('clientProfile.txTradingAccount')}>
              <CopyableId value={row.tradingAccountId} copyLabel={t('common.copyId')} />
            </Detail>
          )}
          <Detail label={t('clientProfile.txCreated')}>{when(row.createdAt)}</Detail>
          {row.reviewedAt && (
            <Detail label={t('clientProfile.txReviewed')}>{when(row.reviewedAt)}</Detail>
          )}
          {row.settledAt && (
            <Detail label={t('clientProfile.txSettled')}>{when(row.settledAt)}</Detail>
          )}
          {row.rejectionReason && (
            // Refused by a person, or failed at the provider — the state says which.
            <Detail
              label={
                row.state === 'rejected'
                  ? t('clientProfile.txRejectedWhy')
                  : t('clientProfile.txFailedWhy')
              }
              wide
            >
              <span className="text-destructive">{row.rejectionReason}</span>
            </Detail>
          )}
          {row.needsAttention && (
            <Detail label={t('clientProfile.txAttention')} wide>
              <span className="text-warning">{row.attentionReason ?? '—'}</span>
            </Detail>
          )}
          <Detail label={t('clientProfile.txId')} wide>
            <CopyableId value={row.id} full copyLabel={t('common.copyId')} />
          </Detail>
        </dl>
      )}
    </Modal>
  );
}

function Detail({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: React.ReactNode;
  /** Spans both columns — for a sentence rather than a value. */
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function when(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}
