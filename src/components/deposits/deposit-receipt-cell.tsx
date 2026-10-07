'use client';

import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import * as React from 'react';
import { FileText, Receipt } from 'lucide-react';
import { DocLightbox } from '@/components/kyc-review/doc-lightbox';
import { assetUrl } from '@/lib/asset-url';
import { t } from '@/lib/i18n';

/**
 * The client's transfer receipt, in a queue row.
 *
 * ## The URL is built with `assetUrl`, never `buildKycDocUrl`
 *
 * That helper prefixes `uploads/kyc/` for anything not already starting with
 * `uploads/`, and its own comment records the `/uploads/kyc/kyc/<file>` incident
 * that broke every document. A receipt lives in a different folder, so one
 * function answering for two buckets is exactly how that comes back — which is
 * why the lightbox below takes `buildUrl` as a prop and is handed THIS one.
 *
 * ## An image opens in the LIGHTBOX, a PDF still opens in a new tab
 *
 * Approving credits real money against this photograph, and the decision is
 * whether the amount, the date and the sender on a phone snapshot match the row.
 * A new tab meant leaving the queue to do that, losing the row being judged and
 * tabbing back to compare — the same problem the KYC reviewer had, answered by
 * the same component rather than a second one that drifts from it.
 *
 * The PDF branch does not change. The admin CSP is `object-src 'none'` with no
 * `frame-src`, deliberately: an operator opening a PDF a stranger sent is the
 * threat model, and widening the policy to embed a bank advice is not worth a
 * modal. The lightbox makes the same call for its own PDFs.
 */
export function DepositReceiptCell({ filename }: { filename?: string | null }) {
  const [open, setOpen] = React.useState(false);
  const { admin } = useAdmin();
  const mayOpen =
    hasPermission(admin, 'deposits.proofs.view') || hasPermission(admin, 'deposits.approve');

  if (!filename) {
    /*
     * SAID IN WORDS, never left blank. A deposit can legitimately have no
     * receipt — filed before this existed, or by an operator on the client's
     * behalf — and an empty cell reads as "the image failed to load", which
     * invites an approval on the assumption that it is there.
     */
    return <span className="text-xs text-muted-foreground">{t('deposits.noReceipt')}</span>;
  }

  /*
   * The file opens with `deposits.proofs.view`, or `deposits.approve`, which the
   * API treats as implying it. Without either the link could only answer 403
   * (Oct 2026 audit) — so say a receipt exists, and that this role can't open it.
   */
  if (!mayOpen) {
    return <span className="text-xs text-muted-foreground">{t('deposits.receiptNotAllowed')}</span>;
  }

  const path = `uploads/deposit-proofs/${filename}`;
  const isPdf = filename.toLowerCase().endsWith('.pdf');

  const className =
    'inline-flex items-center gap-2 text-xs font-medium text-primary underline underline-offset-2';
  const label = (
    <>
      {isPdf ? (
        <FileText className="h-4 w-4" aria-hidden />
      ) : (
        <Receipt className="h-4 w-4" aria-hidden />
      )}
      {t('deposits.openReceipt')}
    </>
  );

  if (isPdf) {
    return (
      <a href={assetUrl(path)} target="_blank" rel="noreferrer" className={className}>
        {label}
      </a>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`${className} cursor-pointer`}>
        {label}
      </button>
      {open && (
        <DocLightbox
          docs={[{ filePath: path, label: t('deposits.colReceipt') }]}
          index={0}
          onClose={() => setOpen(false)}
          /* One receipt per row, so navigation never fires — but the prop is
             required and a no-op is honest about there being nowhere to go. */
          onNavigate={() => undefined}
          buildUrl={(filePath) => assetUrl(filePath) ?? ''}
        />
      )}
    </>
  );
}
