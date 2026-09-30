import { MessageSquareWarning } from 'lucide-react';
import { t } from '@/lib/i18n';

/**
 * The payment provider OPERATOR's own note on a refused payout (backend 0172)
 * — "AML flag", "duplicate of 88231". Admin eyes only: the client was told a
 * fixed sentence, which is what `rejectionReason` shows beside this. Labelled
 * as the provider's, so nobody reads it as something the client saw.
 */
export function ProviderNote({ note }: { note: string | null | undefined }) {
  if (!note) return null;
  return (
    <div
      className="mt-1 flex max-w-[220px] items-start gap-1 text-[11px] text-muted-foreground"
      title={`${t('transactions.providerNoteLabel')}: ${note}`}
    >
      <MessageSquareWarning className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="truncate">
        <span className="font-semibold">{t('transactions.providerNoteLabel')}:</span> {note}
      </span>
    </div>
  );
}
