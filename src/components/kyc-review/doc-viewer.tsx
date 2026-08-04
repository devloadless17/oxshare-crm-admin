'use client';

import { useState } from 'react';
import { buildKycDocUrl } from '@/lib/kyc-doc-url';
import { t } from '@/lib/i18n';

/**
 * One uploaded KYC document: image inline, PDF as a link, and an honest fallback
 * when the file cannot be rendered.
 *
 * Extracted from the review page, which had grown to 973 lines. Behaviour is
 * unchanged — src/app/kyc/[userId]/page.test.tsx covers the review flow around it.
 */
export function DocViewer({ filePath, label }: { filePath?: string; label: string }) {
  const [imgFailed, setImgFailed] = useState(false);
  const isPdf = filePath?.toLowerCase().endsWith('.pdf');
  const url = buildKycDocUrl(filePath);

  return (
    <div className="flex flex-col gap-2 p-4 rounded-xl border border-border bg-card/60">
      <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      {filePath ? (
        isPdf ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-link hover:underline font-semibold text-xs py-3"
          >
            {t('kycReview.viewDocumentPdf')}
          </a>
        ) : imgFailed ? (
          <div className="text-xs text-destructive py-6 text-center border border-dashed border-destructive/40 rounded-lg">
            {t('kycReview.docLoadFailed')}{' '}
            <a href={url} target="_blank" rel="noreferrer" className="underline">
              {t('kycReview.openDirectly')}
            </a>
          </div>
        ) : (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="block overflow-hidden rounded-lg border border-border/80"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- KYC documents are
                served from the API origin behind auth; next/image would proxy them
                through the optimizer and cache identity documents on disk. */}
            <img
              src={url}
              alt={label}
              onError={() => setImgFailed(true)}
              className="w-full h-44 object-cover hover:opacity-90 transition-opacity cursor-pointer"
            />
          </a>
        )
      ) : (
        <div className="text-xs italic text-muted-foreground py-6 text-center border border-dashed border-border/50 rounded-lg">
          {t('kycReview.notUploaded')}
        </div>
      )}
    </div>
  );
}
