import { MANUAL_ADMIN_PROVIDER, type TransactionRow } from '@/lib/api/admin';
import { t } from '@/lib/i18n';

/**
 * What a movement went through, in words (owner, 26 Sep 2026).
 *
 * Never `methodKey ?? provider` — `manual_admin`, `whish` are machine keys
 * nobody on the desk should have to read. A method's name when the movement
 * went through one; otherwise named from its provider, the one set of values a
 * screen may recognise (see MANUAL_ADMIN_PROVIDER); anything else is the
 * provider made readable, never a blank — an unknown source is still a source.
 */
export function transactionMethodLabel(row: {
  methodName: string | null | undefined;
  methodKey?: string | null;
  provider: string | null | undefined;
}): string {
  if (row.methodName) return row.methodName;
  switch (row.provider) {
    case MANUAL_ADMIN_PROVIDER:
      return t('financial.methodManualCredit');
    case 'transfer':
      return t('clientProfile.txMethodTransfer');
    case 'commission':
      return t('clientProfile.txMethodCommission');
    default: {
      const raw = row.provider ?? row.methodKey;
      if (!raw) return '—';
      const words = raw.replace(/[_-]+/g, ' ').trim();
      return words.charAt(0).toUpperCase() + words.slice(1);
    }
  }
}

/**
 * What a movement went through, in words. The list's `methodName` already falls
 * back to the raw `provider` server-side (`manual_admin`, `transfer`), so a name
 * EQUAL to the provider is that fallback, not a method — handed to the shared
 * rule, which names it ("Manual credit") instead of printing a machine key.
 */
export function movementMethodLabel(row: Pick<TransactionRow, 'methodName' | 'provider'>): string {
  return transactionMethodLabel({
    methodName: row.methodName && row.methodName !== row.provider ? row.methodName : null,
    methodKey: null,
    provider: row.provider,
  });
}

/**
 * A transfer's way, from the client's wallet's side as the list states it:
 * `withdrawal` left the wallet for a trading account, `deposit` came back.
 */
export function transferDirectionLabel(direction: string): string {
  return direction === 'deposit'
    ? t('clientProfile.txTransferToWallet')
    : t('clientProfile.txTransferToAccount');
}
