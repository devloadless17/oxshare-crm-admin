import type { MovementEnd, MovementType, TransactionRow, TransferOrigin } from '@/lib/api/admin';
import { t } from '@/lib/i18n';

/**
 * The words for what a movement IS and where its money went (16 Oct 2026).
 *
 * The server classifies (`type`, `effect`, `from`, `to`, `origin` — backend `movement-type.ts`,
 * `movement-details.ts`); this file only names. Every function falls back to the RAW value for
 * something the API grew and this console has not learned — the ledger's `entryTypeLabel` rule:
 * showing the raw value is honest, inventing a label or rendering blank is not.
 */

export function typeLabel(type: string): string {
  switch (type as MovementType) {
    case 'deposit':
      return t('movement.type.deposit');
    case 'desk_credit':
      return t('movement.type.desk_credit');
    case 'withdrawal':
      return t('movement.type.withdrawal');
    case 'desk_debit':
      return t('movement.type.desk_debit');
    case 'transfer_to_account':
      return t('movement.type.transfer_to_account');
    case 'transfer_to_wallet':
      return t('movement.type.transfer_to_wallet');
    case 'commission_to_wallet':
      return t('movement.type.commission_to_wallet');
    default:
      return type;
  }
}

export function effectLabel(effect: string): string {
  switch (effect) {
    case 'in':
      return t('movement.effect.in');
    case 'out':
      return t('movement.effect.out');
    case 'internal':
      return t('movement.effect.internal');
    default:
      return effect;
  }
}

/** Where a transfer's money came from, in the desk's words. */
export function originLabel(origin: string): string {
  switch (origin as TransferOrigin) {
    case 'client':
      return t('movement.origin.client');
    case 'deposit':
      return t('movement.origin.deposit');
    case 'desk_credit':
      return t('movement.origin.desk_credit');
    case 'desk_wallet':
      return t('movement.origin.desk_wallet');
    case 'desk_debit':
      return t('movement.origin.desk_debit');
    case 'commission':
      return t('movement.origin.commission');
    default:
      return origin;
  }
}

/**
 * One end — a PLACE — as a headline and a detail line: "Wallet · USD" over the wallet number,
 * "MT5 5000001" over "Live", External (outside the platform), or the company's own money.
 */
export function endText(end: MovementEnd): { title: string; detail: string | null } {
  switch (end.kind) {
    case 'wallet':
      return {
        title: t(
          end.walletKind === 'commission' ? 'movement.end.commissionWallet' : 'movement.end.wallet',
          { currency: end.currency ?? '' },
        ),
        detail: end.walletNumber ?? null,
      };
    case 'trading_account':
      return {
        title: end.login
          ? t('movement.end.account', { login: end.login })
          : t('movement.end.accountNoLogin'),
        detail:
          end.environment === 'demo'
            ? t('movement.end.demo')
            : end.environment === 'live'
              ? t('movement.end.live')
              : null,
      };
    case 'external':
      return { title: t('movement.end.external'), detail: null };
    case 'company':
      return { title: t('movement.end.company'), detail: null };
    default:
      return { title: end.kind, detail: null };
  }
}

/**
 * The rail a PAYMENT crossed the platform on — its own column, never an end (16 Oct 2026): the
 * method's desk label (or its provider when the method is gone), its network, and a sandbox mark.
 * The desk's own credit and debit read as such. `null` for a transfer or a commission move.
 */
export function methodText(
  row: Pick<TransactionRow, 'method' | 'type'>,
): { title: string; detail: string | null } | null {
  if (!row.method) return null;
  if (row.type === 'desk_credit') return { title: t('financial.methodManualCredit'), detail: null };
  if (row.type === 'desk_debit') return { title: t('financial.methodManualDebit'), detail: null };
  const { label, providerCode, channelCode, environment } = row.method;
  const network =
    channelCode && !QUIET_CHANNELS.has(channelCode) ? channelCode.toUpperCase() : null;
  const sandbox = environment && environment !== 'live' ? environment : null;
  return {
    title: label ?? providerCode ?? t('movement.end.method'),
    detail: [network, sandbox].filter(Boolean).join(' · ') || null,
  };
}

/** Channels that name no network a desk would quote (the desk's adjustment, a manual offline rail). */
const QUIET_CHANNELS = new Set(['adjustment', 'offline']);

/**
 * Where an account's money came from and went: its transfers, all time. The link the
 * Trading accounts desk and the client's Accounts tab offer on an account with a login.
 */
export function transfersHrefFor(login: string): string {
  return `/transfers?account=${encodeURIComponent(login)}&range=all`;
}

/**
 * Where a ledger posting's reference opens (16 Oct 2026): the movement it records, in the page
 * that owns it — so the accounting record and the movement are read side by side, never by
 * copying a uuid. A refund posting (`<id>:refund`) opens the payment it refunds. A reference this
 * console does not know stays plain text.
 */
export function ledgerReferenceLink(
  referenceType: string,
  referenceId: string | null | undefined,
): { href: string; label: string } | null {
  if (!referenceId) return null;
  const [id = ''] = referenceId.split(':');
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  switch (referenceType) {
    case 'transaction':
      return uuid
        ? {
            href: `/financial?open=${id}`,
            label: referenceId.endsWith(':refund')
              ? t('ledger.ref.refund')
              : t('ledger.ref.transaction'),
          }
        : null;
    case 'transfer':
      return uuid ? { href: `/transfers?open=${id}`, label: t('ledger.ref.transfer') } : null;
    case 'ib_transfer':
      return uuid ? { href: `/transfers?open=${id}`, label: t('ledger.ref.ibTransfer') } : null;
    case 'accrual':
    case 'accrual_reversal':
      return uuid
        ? {
            href: `/commissions?open=${id}`,
            label: referenceType === 'accrual' ? t('ledger.ref.accrual') : t('ledger.ref.reversal'),
          }
        : null;
    case 'accrual_batch':
      return { href: '/commissions', label: t('ledger.ref.batch') };
    default:
      return null;
  }
}
