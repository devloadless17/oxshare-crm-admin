'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Minus, Plus, RotateCw, X } from 'lucide-react';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { buildKycDocUrl } from '@/lib/kyc-doc-url';
import { t } from '@/lib/i18n';

export interface LightboxDoc {
  filePath: string;
  label: string;
  fileName?: string;
}

const ZOOM_STEP = 0.5;
const MIN_ZOOM = 1;
const MAX_ZOOM = 6;

/**
 * A KYC document at full size, with zoom, pan and rotation.
 *
 * ## Why this exists
 *
 * The review screen showed each document in a fixed box. Even at
 * `object-contain` that is a thumbnail: a reviewer deciding whether a passport
 * number matches a typed value, or whether a utility bill's date is inside the
 * accepted window, cannot do it at 220px. The only way to see the document
 * properly was to open its raw URL in a browser tab — which meant leaving the
 * review, losing the other documents, and tabbing back and forth to compare the
 * selfie against the ID.
 *
 * Rotation matters more than it looks. NOTHING in the pipeline corrects
 * orientation — not the portal, not the upload path, not this app — so a
 * reviewer regularly receives a sideways ID. Without a way to turn it they
 * reject it as unreadable, and the client is asked days later to re-photograph
 * a document that was perfectly legible and merely rotated.
 *
 * ## What it deliberately does not do
 *
 * The zoom and rotation are presentational and are never sent anywhere. The
 * stored file is evidence; a viewing aid must not be able to alter it, and a
 * "corrected" copy written back would be a different document from the one the
 * client submitted.
 *
 * Every action has a button. Scroll-to-zoom and pinch are conveniences that some
 * devices and some pointer setups do not offer, and a reviewer who cannot zoom
 * is back to rejecting readable documents.
 */
export function DocLightbox({
  docs,
  index,
  onClose,
  onNavigate,
}: {
  docs: LightboxDoc[];
  index: number;
  onClose: () => void;
  onNavigate: (nextIndex: number) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [turns, setTurns] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragFrom = useRef<{ x: number; y: number } | null>(null);

  useFocusTrap(panelRef, true, onClose);

  const doc = docs[index];
  const isPdf = doc?.filePath.toLowerCase().endsWith('.pdf');

  /*
   * A new document is a new view: carrying the previous zoom and rotation over
   * would leave the reviewer looking at a corner of something they have not
   * seen whole.
   *
   * Reset HERE rather than in an effect keyed on `index`. Resetting in an effect
   * is derived state pretending to be synchronisation — it renders the new
   * document at the old zoom, then renders again — and the type-aware lint rule
   * says so. Every index change goes through this function, and a lightbox
   * opened at a new index mounts fresh with the defaults.
   */
  const navigate = useCallback(
    (next: number) => {
      setZoom(1);
      setTurns(0);
      setOffset({ x: 0, y: 0 });
      onNavigate(next);
    },
    [onNavigate],
  );

  const go = useCallback(
    (delta: number) => {
      if (docs.length < 2) return;
      navigate((index + delta + docs.length) % docs.length);
    },
    [docs.length, index, navigate],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP));
      else if (e.key === '-') setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP));
      else if (e.key === 'r') setTurns((n) => (n + 1) % 4);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  if (!doc) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/85 backdrop-blur-sm"
      // The backdrop closes, but only from the backdrop itself — a drag that
      // ends outside the image must not dismiss the document being read.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={doc.label}
        className="contents"
      >
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{doc.label}</p>
            {doc.fileName && <p className="truncate text-xs text-white/60">{doc.fileName}</p>}
          </div>

          <div className="flex items-center gap-1">
            <LightboxButton
              onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP))}
              disabled={zoom <= MIN_ZOOM || isPdf}
              label={t('kycReview.zoomOut')}
            >
              <Minus className="h-4 w-4" />
            </LightboxButton>
            <span className="w-12 text-center text-xs font-semibold text-white/80">
              {Math.round(zoom * 100)}%
            </span>
            <LightboxButton
              onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP))}
              disabled={zoom >= MAX_ZOOM || isPdf}
              label={t('kycReview.zoomIn')}
            >
              <Plus className="h-4 w-4" />
            </LightboxButton>
            <LightboxButton
              onClick={() => setTurns((n) => (n + 1) % 4)}
              disabled={isPdf}
              label={t('kycReview.rotate')}
            >
              <RotateCw className="h-4 w-4" />
            </LightboxButton>
            <LightboxButton onClick={onClose} label={t('common.close')}>
              <X className="h-4 w-4" />
            </LightboxButton>
          </div>
        </header>

        <div className="relative flex flex-1 items-center justify-center overflow-hidden">
          {docs.length > 1 && (
            <LightboxNav side="left" onClick={() => go(-1)} label={t('kycReview.previousDoc')} />
          )}

          {isPdf ? (
            // A PDF is not an image: zoom and rotation belong to the viewer, and
            // an <embed> inside a modal is worse than the browser's own.
            <a
              href={buildKycDocUrl(doc.filePath)}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-white/10 px-6 py-4 text-sm font-semibold text-white hover:bg-white/20 focus-outline"
            >
              {t('kycReview.viewDocumentPdf')}
            </a>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element -- served from
               the API origin behind auth; next/image would proxy identity
               documents through the optimizer and cache them on disk. */
            <img
              src={buildKycDocUrl(doc.filePath)}
              alt={doc.label}
              draggable={false}
              onMouseDown={(e) => {
                if (zoom <= 1) return;
                dragFrom.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
              }}
              onMouseMove={(e) => {
                if (!dragFrom.current) return;
                setOffset({ x: e.clientX - dragFrom.current.x, y: e.clientY - dragFrom.current.y });
              }}
              onMouseUp={() => (dragFrom.current = null)}
              onMouseLeave={() => (dragFrom.current = null)}
              style={{
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom}) rotate(${turns * 90}deg)`,
                cursor: zoom > 1 ? 'grab' : 'default',
              }}
              className="max-h-[80vh] max-w-[92vw] select-none object-contain transition-transform duration-100"
            />
          )}

          {docs.length > 1 && (
            <LightboxNav side="right" onClick={() => go(1)} label={t('kycReview.nextDoc')} />
          )}
        </div>

        {docs.length > 1 && (
          <footer className="flex items-center justify-center gap-2 border-t border-white/10 px-4 py-2">
            {docs.map((d, i) => (
              <button
                key={d.filePath}
                type="button"
                onClick={() => navigate(i)}
                aria-current={i === index}
                className={`rounded px-2 py-1 text-xs font-semibold focus-outline ${
                  i === index ? 'bg-white text-black' : 'text-white/70 hover:text-white'
                }`}
              >
                {d.label}
              </button>
            ))}
          </footer>
        )}
      </div>
    </div>
  );
}

function LightboxButton({
  onClick,
  label,
  disabled,
  children,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-white/80 hover:bg-white/15 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 focus-outline"
    >
      {children}
    </button>
  );
}

function LightboxNav({
  side,
  onClick,
  label,
}: {
  side: 'left' | 'right';
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`absolute ${side === 'left' ? 'left-2' : 'right-2'} z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/25 focus-outline`}
    >
      {side === 'left' ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
    </button>
  );
}
