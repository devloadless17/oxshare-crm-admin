'use client';

import { useState } from 'react';
import { buildKycDocUrl } from '@/lib/kyc-doc-url';
import { t } from '@/lib/i18n';

/**
 * One uploaded KYC document: image inline, PDF as a link, and an honest fallback
 * when the file cannot be rendered.
 *
 * ## Why this is `object-contain` and not `object-cover`
 *
 * It used to be `h-44 object-cover`, which is a rule that says "fill this box,
 * crop whatever does not fit". For a passport bio page or a utility bill —
 * documents whose EDGES carry the number, the date and the address — that crops
 * away exactly what the reviewer is checking. The whole document is now shown,
 * letterboxed, at a size where a reviewer can tell whether it is worth opening.
 *
 * ## Why there is a rotate control
 *
 * Nothing anywhere in the pipeline corrects orientation: not the portal, not the
 * upload path, not this app. Phone photos carry EXIF rotation, and an ID that
 * arrives sideways to the reviewer gets rejected as unreadable — so the client
 * is asked, days later, to re-photograph a document that was perfectly legible
 * and merely turned. The reviewer needed one button, and had a new browser tab.
 *
 * The rotation is presentational and per-document: it is never sent anywhere and
 * never persisted, because the stored file is evidence and this is a viewing aid.
 */
export function DocViewer({
  filePath,
  label,
  fileName,
}: {
  filePath?: string;
  label: string;
  /** The name the client uploaded it under, when the submission carries one. */
  fileName?: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const [quarterTurns, setQuarterTurns] = useState(0);
  const isPdf = filePath?.toLowerCase().endsWith('.pdf');
  const url = buildKycDocUrl(filePath);

  // A quarter turn swaps the rendered width and height, so at 90°/270° the image
  // must be sized against the box's other axis or it overflows its container.
  const turned = quarterTurns % 2 === 1;

  return (
    <div className="flex flex-col gap-2 p-4 rounded-xl border border-border bg-card/60">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        {filePath && !isPdf && !imgFailed && (
          <button
            type="button"
            onClick={() => setQuarterTurns((n) => (n + 1) % 4)}
            title={t('kycReview.rotate')}
            aria-label={t('kycReview.rotate')}
            className="rounded-md border border-input px-2 py-0.5 text-[11px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground focus-outline cursor-pointer"
          >
            {t('kycReview.rotate')}
          </button>
        )}
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
            title={t('kycReview.openFullSize')}
            className="flex h-56 items-center justify-center overflow-hidden rounded-lg border border-border/80 bg-muted/30"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- KYC documents are
                served from the API origin behind auth; next/image would proxy them
                through the optimizer and cache identity documents on disk. */}
            <img
              src={url}
              alt={label}
              onError={() => setImgFailed(true)}
              style={{ transform: `rotate(${quarterTurns * 90}deg)` }}
              className={`${turned ? 'max-h-full w-auto max-w-[14rem]' : 'max-h-full max-w-full'} object-contain transition-transform duration-200 hover:opacity-90 cursor-pointer`}
            />
          </a>
        )
      ) : (
        <div className="text-xs italic text-muted-foreground py-6 text-center border border-dashed border-border/50 rounded-lg">
          {t('kycReview.notUploaded')}
        </div>
      )}
      {/* The name the client chose. `scan_0001.jpg` and `IMG_4821.HEIC` tell a
          reviewer something a thumbnail does not — and it is already on the wire. */}
      {filePath && fileName && (
        <div className="truncate text-[11px] text-muted-foreground" title={fileName}>
          {fileName}
        </div>
      )}
    </div>
  );
}
