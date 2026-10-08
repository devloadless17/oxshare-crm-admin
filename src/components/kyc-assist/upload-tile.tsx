'use client';

import * as React from 'react';
import { Loader2, RefreshCw, Upload } from 'lucide-react';
import { DocViewer } from '@/components/kyc-review/doc-viewer';
import { normaliseDocumentImage } from '@/lib/image-capture';
import { apiErrorMessage } from '@/lib/api/errors';
import { t } from '@/lib/i18n';

/** What the KYC bucket takes — the server decides from the bytes; this only filters the picker. */
const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';
/** The server's ceiling (`MAX_UPLOAD_BYTES`), said before a doomed upload starts. */
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * One upload slot on the "Complete KYC" page — a document page, the selfie, or
 * a broker's upload question. Staff drop or choose a file; a photo is cleaned
 * the way the portal cleans the client's own (`lib/image-capture.ts`, a twin:
 * turned upright, location data dropped, a huge photo shrunk); the server
 * stores it in the client's record as uploaded by them.
 *
 * With a file on record the tile shows it (`DocViewer`) and offers Replace: a
 * new version, never an edit — the old one stays in the client's history.
 */
export function UploadTile({
  id,
  label,
  required,
  hint,
  filePath,
  returned,
  disabled,
  onUpload,
  onOpen,
}: {
  id: string;
  label: string;
  required: boolean;
  hint?: string;
  filePath?: string;
  returned: boolean;
  disabled: boolean;
  onUpload: (file: File) => Promise<void>;
  onOpen?: () => void;
}) {
  const input = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const blocked = disabled || busy;

  const send = async (picked: File | undefined) => {
    if (!picked || blocked) return;
    setError(null);
    setBusy(true);
    try {
      const { file } = await normaliseDocumentImage(picked);
      if (file.size > MAX_BYTES) {
        setError(t('kycAssist.fileTooBig'));
        return;
      }
      await onUpload(file);
    } catch (refusal) {
      // The server's own sentence: a HEIC photo, an unreadable file, a closed KYC.
      setError(apiErrorMessage(refusal, t('kycAssist.uploadFailed')));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const choose = () => input.current?.click();

  return (
    <div className="space-y-2" id={id}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">
          {label}
          {required ? (
            <span className="text-destructive"> *</span>
          ) : (
            <span className="font-normal text-muted-foreground"> · {t('kycAssist.optional')}</span>
          )}
        </span>
        {filePath && !disabled && (
          <button
            type="button"
            onClick={choose}
            disabled={blocked}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-link hover:underline focus-outline disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
            )}
            {busy ? t('kycAssist.uploading') : t('kycAssist.replace')}
            <span className="sr-only"> {label}</span>
          </button>
        )}
      </div>

      {filePath ? (
        <DocViewer filePath={filePath} label={label} returned={returned} onOpen={onOpen} />
      ) : (
        <button
          type="button"
          onClick={choose}
          disabled={blocked}
          onDragOver={(event) => {
            event.preventDefault();
            if (!blocked) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void send(event.dataTransfer.files[0]);
          }}
          className={`flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-7 text-center text-xs transition-colors focus-outline disabled:cursor-not-allowed disabled:opacity-60 ${
            returned
              ? 'border-destructive/60 bg-destructive/5'
              : dragging
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/60 hover:bg-muted/40'
          }`}
        >
          {busy ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
          ) : (
            <Upload className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          )}
          <span className="font-semibold text-foreground">
            {busy ? t('kycAssist.uploading') : t('kycAssist.dropOrChoose')}
          </span>
          <span className="text-[11px] text-muted-foreground">{t('kycAssist.fileTypes')}</span>
          <span className="sr-only">{label}</span>
        </button>
      )}

      {hint && !error && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      {error && (
        <p role="alert" className="text-[11px] font-medium text-destructive">
          {error}
        </p>
      )}
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => void send(event.target.files?.[0])}
      />
    </div>
  );
}
