'use client';

import { CornerDownRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { MovementEnd, TransactionRow } from '@/lib/api/admin';
import { t } from '@/lib/i18n';
import { endText, methodText, originLabel, typeLabel } from './movement-vocabulary';

/**
 * The cells every money list shares (16 Oct 2026): what a movement IS, from where to where, and
 * who moved it. Each renders ONLY what the server sent — the type, the ends and the people are the
 * server's (`movementDetails`), so the Financial page, the Transfers page and the client profile
 * cannot describe one movement three ways.
 */

/** The accounting type, coloured by its effect: money in, money out, or an internal move. */
export function MovementTypeBadge({ row }: { row: Pick<TransactionRow, 'type' | 'effect'> }) {
  const variant = row.effect === 'in' ? 'success' : row.effect === 'out' ? 'warning' : 'tag';
  return <Badge variant={variant}>{typeLabel(row.type)}</Badge>;
}

function EndLine({ end, extra }: { end: MovementEnd; extra?: string | null }) {
  const { title, detail } = endText(end);
  return (
    <span className="flex min-w-0 flex-col leading-tight">
      <span className="truncate text-sm font-medium" title={title}>
        {title}
      </span>
      {(detail || extra) && (
        <span
          className="truncate font-mono text-[11px] text-muted-foreground"
          title={[detail, extra].filter(Boolean).join(' · ')}
        >
          {[detail, extra].filter(Boolean).join(' · ')}
        </span>
      )}
    </span>
  );
}

type RouteRow = Pick<TransactionRow, 'from' | 'to' | 'onward' | 'destination' | 'type'>;

/**
 * FROM and TO are TWO columns (16 Oct 2026, the owner's call, matching the buyer's old back
 * office): an accountant reads one side down the page — every movement out of a wallet, every one
 * into an account — and the screen matches the CSV, which has always had them apart.
 */
export function MovementFrom({ row }: { row: RouteRow }) {
  return (
    <div className="flex min-w-[9rem] max-w-[14rem] flex-col">
      <EndLine end={row.from} />
    </div>
  );
}

/**
 * The receiving end, with the payout destination where this reader may see it — it rides on the
 * masked `destination` field, never on the end itself, so a role that hides payout destinations
 * hides it here too — and, for a deposit aimed at an account, where the money went next.
 */
export function MovementTo({ row }: { row: RouteRow }) {
  const destination = row.type === 'withdrawal' ? (row.destination ?? null) : null;
  return (
    <div className="flex min-w-[9rem] max-w-[14rem] flex-col gap-0.5">
      <EndLine end={row.to} extra={destination} />
      {row.onward && <OnwardLine onward={row.onward} />}
    </div>
  );
}

/** The payment method, its own column: the label over its network; a dash for internal moves. */
export function MovementMethod({ row }: { row: Pick<TransactionRow, 'method' | 'type'> }) {
  const method = methodText(row);
  if (!method) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex min-w-0 flex-col leading-tight">
      <span className="truncate text-sm" title={method.title}>
        {method.title}
      </span>
      {method.detail && (
        <span className="truncate font-mono text-[11px] text-muted-foreground">
          {method.detail}
        </span>
      )}
    </span>
  );
}

/** A deposit aimed at a trading account: where it went next — or that it never got there. */
export function OnwardLine({ onward }: { onward: NonNullable<TransactionRow['onward']> }) {
  const account = endText(onward.account).title;
  const key = !onward.transferId
    ? 'movement.onward.never'
    : onward.state === 'success'
      ? 'movement.onward.moved'
      : onward.state === 'failure'
        ? 'movement.onward.failed'
        : 'movement.onward.pending';
  const stuck = !onward.transferId || onward.state === 'failure';
  return (
    <span
      className={`mt-0.5 inline-flex items-center gap-1 text-[11px] ${stuck ? 'font-semibold text-warning' : 'text-muted-foreground'}`}
    >
      <CornerDownRight className="h-3 w-3" aria-hidden="true" />
      {t(key, { account })}
    </span>
  );
}

/**
 * WHO moved it: the client, a deposit, or the desk member — and who approved and decided. Names
 * only, as the server sends them; a desk member the directory no longer names reads "an
 * administrator", never an id.
 */
export function MovementPeople({
  row,
}: {
  row: Pick<
    TransactionRow,
    'type' | 'origin' | 'source' | 'requestedBy' | 'approvedBy' | 'decidedBy' | 'state' | 'kind'
  >;
}) {
  const name = (who: { name: string | null } | null | undefined) =>
    who?.name ?? t('movement.by.someone');
  const lines: string[] = [];

  if (row.type === 'desk_credit' || row.type === 'desk_debit' || row.origin?.startsWith('desk_')) {
    lines.push(
      row.requestedBy
        ? t('movement.by.desk', { name: name(row.requestedBy) })
        : t('movement.by.deskUnknown'),
    );
    if (row.origin) lines.push(originLabel(row.origin));
  } else if (row.origin === 'deposit') {
    lines.push(
      row.source?.reference
        ? t('movement.sourceDeposit', { reference: row.source.reference })
        : t('movement.sourceDepositNoRef'),
    );
  } else {
    lines.push(t('movement.by.client'));
  }

  // The decision trail on a client's payment: who approved, and who paid when that was someone else.
  if (row.kind === 'payment' && row.type !== 'desk_credit' && row.type !== 'desk_debit') {
    if (row.approvedBy) lines.push(t('movement.by.approved', { name: name(row.approvedBy) }));
    if (row.decidedBy && row.decidedBy.adminId !== row.approvedBy?.adminId) {
      lines.push(
        t(row.state === 'success' ? 'movement.by.paid' : 'movement.by.decided', {
          name: name(row.decidedBy),
        }),
      );
    }
    if (!row.decidedBy && !row.approvedBy && row.state === 'success') {
      lines.push(t('movement.by.provider'));
    }
  }

  return (
    <div className="flex max-w-[14rem] flex-col text-xs leading-tight">
      <span className="font-medium text-foreground">{lines[0]}</span>
      {lines.slice(1).map((line) => (
        <span key={line} className="text-muted-foreground">
          {line}
        </span>
      ))}
    </div>
  );
}
