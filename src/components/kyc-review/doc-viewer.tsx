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
  returned = false,
  onOpen,
}: {
  filePath?: string;
  label: string;
  /**
   * The reviewer returned this file and it is still with the client: the tile
   * says so in red, as a returned answer does in the summary.
   */
  returned?: boolean;
  /**
   * Open this document in the lightbox. When absent the tile falls back to a
   * new browser tab, which is what it did before the lightbox existed and is
   * still the right behaviour for a PDF.
   */
  onOpen?: () => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  /*
   * ONE retry before "Could not load". An image cannot refresh a session or wait
   * out a limit the way the page's own requests do, so a blip — the API
   * restarting, a burst of reads — used to leave the tile failed until a reload
   * (reported from local testing, 30 Sep 2026). The query string only makes the
   * browser ask again; the route ignores it.
   */
  const [retried, setRetried] = useState(false);
  const [quarterTurns, setQuarterTurns] = useState(0);
  const isPdf = filePath?.toLowerCase().endsWith('.pdf');
  const url = buildKycDocUrl(filePath);

  // A quarter turn swaps the rendered width and height, so at 90°/270° the image
  // must be sized against the box's other axis or it overflows its container.
  const turned = quarterTurns % 2 === 1;

  return (
    <div
      className={`flex flex-col gap-2 p-4 rounded-xl border bg-card/60 ${returned ? 'border-destructive/60' : 'border-border'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {label}
          </div>
          {returned && (
            <span className="text-xs font-bold text-destructive">
              {t('kycReview.pageReturned')}
            </span>
          )}
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
          <button
            type="button"
            onClick={onOpen}
            title={t('kycReview.openFullSize')}
            className="flex h-56 w-full cursor-zoom-in items-center justify-center overflow-hidden rounded-lg border border-border/80 bg-muted/30 focus-outline"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- KYC documents are
                served from the API origin behind auth; next/image would proxy them
                through the optimizer and cache identity documents on disk. */}
            <img
              src={retried ? `${url}${url.includes('?') ? '&' : '?'}retry=1` : url}
              alt={label}
              onError={() => {
                if (retried) setImgFailed(true);
                else window.setTimeout(() => setRetried(true), 1500);
              }}
              style={{ transform: `rotate(${quarterTurns * 90}deg)` }}
              className={`${turned ? 'max-h-full w-auto max-w-[14rem]' : 'max-h-full max-w-full'} object-contain transition-transform duration-200 hover:opacity-90`}
            />
          </button>
        )
      ) : (
        <div className="text-xs italic text-muted-foreground py-6 text-center border border-dashed border-border/50 rounded-lg">
          {t('kycReview.notUploaded')}
        </div>
      )}
      {/* No filename under the tile: what the client called the file is not kept
          (backend 0160, D-84) — it carried names and document numbers whatever a
          role hid. The label says what the document IS. */}
    </div>
  );
}
