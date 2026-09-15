'use client';

import { FileText, Receipt } from 'lucide-react';
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
 * function answering for two buckets is exactly how that comes back.
 *
 * ## A PDF opens in a NEW TAB rather than embedding
 *
 * The admin CSP is `object-src 'none'` with no `frame-src`, deliberately. Do not
 * widen it to embed a bank advice — an operator opening a PDF a stranger sent is
 * the threat model, and the new tab is the answer `doc-viewer.tsx` already gives.
 */
export function DepositReceiptCell({ filename }: { filename?: string | null }) {
  if (!filename) {
    /*
     * SAID IN WORDS, never left blank. A deposit can legitimately have no
     * receipt — filed before this existed, or by an operator on the client's
     * behalf — and an empty cell reads as "the image failed to load", which
     * invites an approval on the assumption that it is there.
     */
    return <span className="text-xs text-muted-foreground">{t('deposits.noReceipt')}</span>;
  }

  const href = assetUrl(`uploads/deposit-proofs/${filename}`);
  const isPdf = filename.toLowerCase().endsWith('.pdf');

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 text-xs font-medium text-primary underline underline-offset-2"
    >
      {isPdf ? (
        <FileText className="h-4 w-4" aria-hidden />
      ) : (
        <Receipt className="h-4 w-4" aria-hidden />
      )}
      {t('deposits.openReceipt')}
    </a>
  );
}
