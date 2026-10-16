'use client';

import type * as React from 'react';
import type { TransactionRow } from '@/lib/api/admin';
import { PermittedLink } from '@/components/permitted-link';
import { formatMoney } from '@/lib/money';
import { t } from '@/lib/i18n';
import { OnwardLine } from './movement-cells';
import { effectLabel, endText, methodText, originLabel, typeLabel } from './movement-vocabulary';

/**
 * EVERYTHING about one movement, as label/value pairs (16 Oct 2026) — what a detail panel lists
 * under the row's own columns, so an admin never needs a second screen to answer "from where to
 * where, who, why, and what did it cost". The record sheet's `extraFields` and the client
 * profile's details window both render THIS, so the two can never disagree. An empty value is
 * left out by the panel rather than shown as a dash.
 */
export function movementDetailFields(
  row: TransactionRow,
): Array<{ label: string; value: React.ReactNode }> {
  const money = (value: string | null | undefined) =>
    value ? formatMoney(value, row.currency) : null;
  const when = (value: string | null | undefined) =>
    value ? new Date(value).toLocaleString() : null;
  const person = (who: TransactionRow['approvedBy']) =>
    who
      ? [who.name ?? t('movement.by.someone'), who.at ? new Date(who.at).toLocaleString() : null]
          .filter(Boolean)
          .join(' · ')
      : null;
  const end = (side: TransactionRow['from']) => {
    const { title, detail } = endText(side);
    return detail ? `${title} · ${detail}` : title;
  };

  const fields: Array<{ label: string; value: React.ReactNode }> = [
    {
      label: t('movement.field.type'),
      value: `${typeLabel(row.type)} · ${effectLabel(row.effect)}`,
    },
    { label: t('movement.field.from'), value: end(row.from) },
    {
      label: t('movement.field.to'),
      value:
        row.type === 'withdrawal' && row.destination
          ? `${end(row.to)} · ${row.destination}`
          : end(row.to),
    },
    {
      label: t('financial.colMethod'),
      value: (() => {
        const method = methodText(row);
        return method ? [method.title, method.detail].filter(Boolean).join(' · ') : null;
      })(),
    },
    {
      label: t('movement.field.onward'),
      value: row.onward ? <OnwardLine onward={row.onward} /> : null,
    },
    { label: t('movement.field.origin'), value: row.origin ? originLabel(row.origin) : null },
    {
      label: t('movement.field.source'),
      value: row.source ? (
        <PermittedLink
          href={`/financial?open=${row.source.transactionId}`}
          className="text-link underline-offset-2 hover:underline"
        >
          {[row.source.reference ?? t('movement.sourceCredit'), row.source.methodLabel]
            .filter(Boolean)
            .join(' · ')}
        </PermittedLink>
      ) : null,
    },
    { label: t('movement.field.requestedBy'), value: person(row.requestedBy) },
    { label: t('movement.field.approvedBy'), value: person(row.approvedBy) },
    { label: t('movement.field.decidedBy'), value: person(row.decidedBy) },
    {
      label: t('movement.field.reason'),
      value: row.deskReason ? [row.deskReason, row.deskReasonAr].filter(Boolean).join(' — ') : null,
    },
    { label: t('movement.field.requested'), value: money(row.requestedAmount) },
    { label: t('movement.field.providerRequest'), value: money(row.providerRequestAmount) },
    { label: t('movement.field.fee'), value: money(row.providerFee) },
    { label: t('movement.field.net'), value: money(row.providerNetAmount) },
    { label: t('movement.field.received'), value: money(row.providerAmountReceived) },
    { label: t('movement.field.providerStatus'), value: row.providerStatus },
    { label: t('movement.field.payoutId'), value: row.providerPayoutId },
    {
      label: t('movement.field.environment'),
      value:
        row.providerEnvironment && row.providerEnvironment !== 'live'
          ? row.providerEnvironment
          : null,
    },
    { label: t('movement.field.submitted'), value: when(row.providerSubmittedAt) },
    { label: t('movement.field.checked'), value: when(row.providerCheckedAt) },
  ];

  // The postings it made — present only for a `ledger.view` holder on a single-record read.
  if (row.ledger) {
    fields.push({
      label: t('movement.field.ledger'),
      value: row.ledger.length ? (
        <ul className="flex flex-col gap-0.5 font-mono text-xs">
          {row.ledger.map((posting) => (
            <li key={`${posting.walletId}-${posting.createdAt}-${posting.entryType}`}>
              {t('movement.ledgerLine', {
                entry: posting.entryType,
                amount: formatMoney(posting.amount, row.currency),
                wallet: posting.walletNumber ?? posting.walletId,
                balance: formatMoney(posting.balanceAfter, row.currency),
              })}
            </li>
          ))}
        </ul>
      ) : (
        t('movement.ledgerNone')
      ),
    });
  }

  fields.push({
    label: t('movement.field.history'),
    value: (
      <PermittedLink
        href={`/audit-log?subjectId=${row.id}`}
        className="text-link underline-offset-2 hover:underline"
      >
        {t('movement.historyLink')}
      </PermittedLink>
    ),
  });

  return fields.filter(
    (field) => field.value !== null && field.value !== undefined && field.value !== '',
  );
}
