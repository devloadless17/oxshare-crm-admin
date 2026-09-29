import type { ProofDetail } from '@/lib/api/admin';
import { CopyableId } from '@/components/copyable-id';
import { t } from '@/lib/i18n';

/**
 * What the client gave with an offline deposit to identify the payment — the
 * phone it was sent from, a transfer code (backend 0163) — beside the receipt.
 *
 * Each answer under the question AS THE CLIENT WAS ASKED, which the server
 * stored with it: a detail the admin has since renamed or removed still reads
 * the way the client saw it. Never masked (the owner's ruling) — it is the
 * proof the desk approves on. Copyable, because the next step is usually
 * pasting it into the provider's own search.
 */
export function DepositDetailsCell({ details }: { details?: ProofDetail[] | null }) {
  if (!details || details.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <dl className="space-y-1">
      {details.map((detail) => (
        <div key={detail.fieldId} className="min-w-0">
          <dt className="text-[11px] text-muted-foreground">{detail.label}</dt>
          <dd className="font-mono text-xs">
            <CopyableId
              value={detail.value}
              full
              copyLabel={t('deposits.copyDetail', { label: detail.label })}
            />
          </dd>
        </div>
      ))}
    </dl>
  );
}
