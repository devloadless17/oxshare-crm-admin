'use client';

import { CheckCircle2, CircleAlert, Undo2 } from 'lucide-react';
import type { KycAssistStep, KycAssistTarget } from '@/lib/api/admin';
import { Badge } from '@/components/ui/badge';
import { AssistFieldInput } from './assist-field';
import { AssistDocumentBlock } from './assist-document';
import { UploadTile } from './upload-tile';
import { t } from '@/lib/i18n';

/** The chip beside a step's title — the server's verdict, never the console's. */
function StepChip({ step }: { step: KycAssistStep }) {
  if (step.returned.length > 0) {
    return (
      <Badge variant="destructive" className="gap-1">
        <Undo2 className="h-3 w-3" aria-hidden="true" />
        {t('kycAssist.stepReturned')}
      </Badge>
    );
  }
  if (step.complete) {
    return (
      <Badge variant="success" className="gap-1">
        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
        {t('kycAssist.stepDone')}
      </Badge>
    );
  }
  return (
    <Badge variant="warning" className="gap-1">
      <CircleAlert className="h-3 w-3" aria-hidden="true" />
      {t('kycAssist.stepMissing', { count: step.missing.length })}
    </Badge>
  );
}

/**
 * One step of the client's KYC form, as the broker set it up: its questions,
 * its document and its uploads, in the form's own order — the same steps the
 * client sees in the portal, laid out by the server.
 */
export function AssistStepCard({
  step,
  number,
  values,
  errors,
  disabled,
  onChange,
  onUpload,
  onOpen,
}: {
  step: KycAssistStep;
  number: number;
  values: Record<string, string>;
  errors: Record<string, string>;
  disabled: boolean;
  onChange: (field: string, value: string) => void;
  onUpload: (file: File, target: KycAssistTarget) => Promise<void>;
  onOpen: (filePath: string, label: string) => void;
}) {
  const prefix = `assist-${step.slug}`;
  return (
    <section
      id={`assist-step-${step.slug}`}
      aria-labelledby={`${prefix}-title`}
      className="scroll-mt-24 rounded-2xl border border-border bg-card p-5 shadow-sm"
    >
      <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-0.5">
          <h2 id={`${prefix}-title`} className="text-sm font-semibold text-foreground">
            <span className="me-2 text-muted-foreground tabular">
              {t('kycAssist.stepNumber', { number })}
            </span>
            {step.title}
          </h2>
          {step.description && <p className="text-xs text-muted-foreground">{step.description}</p>}
        </div>
        <StepChip step={step} />
      </header>

      {step.returned.length > 0 && (
        <ul className="mb-4 space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          {step.returned.map((item) => (
            <li key={item.id}>{t('kycAssist.returnedItem', { label: item.label })}</li>
          ))}
        </ul>
      )}

      <div className="space-y-5">
        {step.fields.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {step.fields.map((field) =>
              field.upload ? (
                <UploadTile
                  key={field.name}
                  id={`${prefix}-${field.name}`}
                  label={field.label}
                  required={field.required}
                  hint={field.hint}
                  filePath={field.upload.filePath}
                  returned={field.upload.returned}
                  disabled={disabled || field.hidden}
                  onUpload={(file) => onUpload(file, field.upload!.target)}
                  onOpen={
                    field.upload.filePath
                      ? () => onOpen(field.upload!.filePath!, field.label)
                      : undefined
                  }
                />
              ) : (
                <AssistFieldInput
                  key={field.name}
                  id={`${prefix}-${field.name}`}
                  field={field}
                  value={values[field.name] ?? ''}
                  error={errors[field.name]}
                  disabled={disabled || field.hidden}
                  onChange={(next) => onChange(field.name, next)}
                />
              ),
            )}
          </div>
        )}

        {step.document && (
          <AssistDocumentBlock
            idPrefix={prefix}
            document={step.document}
            disabled={disabled}
            onUpload={onUpload}
            onOpen={onOpen}
          />
        )}

        {step.selfie && (
          <div className="sm:w-1/2">
            <UploadTile
              id={`${prefix}-selfie`}
              label={t('kycAssist.selfie')}
              required={!step.selfie.optional}
              filePath={step.selfie.filePath}
              returned={step.selfie.returned}
              disabled={disabled}
              onUpload={(file) => onUpload(file, step.selfie!.target)}
              onOpen={
                step.selfie.filePath
                  ? () => onOpen(step.selfie!.filePath!, t('kycAssist.selfie'))
                  : undefined
              }
            />
          </div>
        )}
      </div>
    </section>
  );
}
