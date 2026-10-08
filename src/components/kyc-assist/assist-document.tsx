'use client';

import * as React from 'react';
import type { KycAssistDocument, KycAssistTarget } from '@/lib/api/admin';
import { UploadTile } from './upload-tile';
import { t } from '@/lib/i18n';

/**
 * A document step's evidence: choose which document (only the types the broker
 * accepts), then one tile per page of it — "Front", "Back" — each uploading to
 * the slot the SERVER named for it (`target`). The console never works out a
 * slot or a page count; a passport shows one tile because the server laid out
 * one page.
 *
 * Choosing a different type changes nothing on its own: the first page of it
 * uploaded replaces the document on file (the server's rule), and the screen
 * says so before it happens.
 */
export function AssistDocumentBlock({
  idPrefix,
  document,
  disabled,
  onUpload,
  onOpen,
}: {
  idPrefix: string;
  document: KycAssistDocument;
  disabled: boolean;
  onUpload: (file: File, target: KycAssistTarget) => Promise<void>;
  onOpen: (filePath: string, label: string) => void;
}) {
  const onFile = document.docType;
  const [picked, setPicked] = React.useState<string | undefined>(undefined);
  // What the client has on file wins until staff pick another; then the pick.
  const chosen = picked ?? onFile ?? document.types[0]?.value;
  const type = document.types.find((candidate) => candidate.value === chosen) ?? document.types[0];
  if (!type) return null;
  const current = document.types.find((candidate) => candidate.value === onFile);

  return (
    <div className="space-y-3">
      <fieldset className="space-y-1.5">
        <legend className="text-xs font-semibold text-foreground">
          {t('kycAssist.documentType')}
          {document.optional && (
            <span className="font-normal text-muted-foreground"> · {t('kycAssist.optional')}</span>
          )}
        </legend>
        <div role="radiogroup" className="flex flex-wrap gap-2">
          {document.types.map((candidate) => {
            const selected = candidate.value === type.value;
            return (
              <button
                key={candidate.value}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                onClick={() => setPicked(candidate.value)}
                className={`h-9 rounded-lg border px-3 text-xs font-semibold focus-outline disabled:opacity-60 ${
                  selected
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-input text-muted-foreground hover:bg-muted'
                }`}
              >
                {candidate.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {current && current.value !== type.value && (
        <p className="rounded-lg border border-border bg-muted/40 p-2.5 text-[11px] text-muted-foreground">
          {t('kycAssist.replacesNotice', { type: type.label, current: current.label })}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {type.pages.map((page) => {
          // The review's rule (`review-sections.ts`): a one-page document is named
          // by itself, a page of several by both ("National ID — Back Side").
          const label = type.pages.length > 1 ? `${type.label} — ${page.label}` : type.label;
          return (
            <UploadTile
              key={`${type.value}-${page.key}`}
              id={`${idPrefix}-${page.target.field}`}
              label={label}
              required={page.required && !document.optional}
              hint={page.hint}
              filePath={page.filePath}
              returned={page.returned}
              disabled={disabled}
              onUpload={(file) => onUpload(file, page.target)}
              onOpen={page.filePath ? () => onOpen(page.filePath!, label) : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}
