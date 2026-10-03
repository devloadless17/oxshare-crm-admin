'use client';

import { Camera, Lock, Plus, Trash2 } from 'lucide-react';
import type { components } from '@/lib/api/types.gen';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldEditor, type KycDocumentType, type KycFieldConfig } from './field-editor';
import { AddIdentityDetail, IdentityRow } from './identity-block';
import { DocumentChecklist } from './document-checklist';
import {
  isCoreStep,
  isDocumentField,
  isIdentityField,
  isSystemField,
  takesEvidence,
} from './field-types';
import { SortableList, SortableRow } from './sortable-row';
import { ArabicHelper, ArabicInput, FieldError, FixedArabic } from './arabic-input';
import { t } from '@/lib/i18n';

export type KycStepConfig = components['schemas']['KycStepConfigDto'];

/** The server's bounds for a step's Arabic (`KycStepDto`). */
const TITLE_AR_MAX = 200;
const DESCRIPTION_AR_MAX = 2000;

/** What the server refused about this step and its fields, from the last save. */
export interface StepRefusal {
  step?: string;
  fields: Record<string, string>;
  /** A refusal of one of the step's own inputs, by property (`titleAr`). */
  properties?: Record<string, string>;
  /** A refusal of one input of a field, by field id then property (`labelAr`). */
  fieldProperties?: Record<string, Record<string, string>>;
}

/**
 * One step of the onboarding flow (Phase 2, 29 Sep 2026 — the owner's "everything
 * customizable").
 *
 * Every step is the broker's to title, describe, switch off and fill with
 * questions of any kind, uploads included. The four BUILT-IN steps cannot be
 * deleted — they are where the platform files the client's identity and
 * evidence — and each keeps its part:
 *
 *   Personal Information   the identity details, placed, ordered, required or
 *                          not, or not asked — beside your questions
 *   Identity Document      the documents it accepts — a checklist
 *   Proof of Address       the same, for address documents
 *   Selfie                 one live selfie
 *
 * The evidence steps can be made OPTIONAL: the client may skip them.
 */
export function StepCard({
  step,
  canDelete,
  onToggleEnabled,
  onDelete,
  onPatch,
  onAddField,
  onPatchField,
  onRemoveField,
  onReorderFields,
  onMoveField,
  moveTargets = [],
  identityCatalogue = [],
  catalogue = [],
  refusal,
}: {
  step: KycStepConfig;
  canDelete: boolean;
  onToggleEnabled: () => void;
  onDelete: () => void;
  onPatch: (patch: Partial<KycStepConfig>) => void;
  onAddField: () => void;
  onPatchField: (fieldId: string, patch: Partial<KycFieldConfig>) => void;
  onRemoveField: (fieldId: string) => void;
  onReorderFields: (fields: KycFieldConfig[]) => void;
  onMoveField?: (fieldId: string, stepId: string) => void;
  moveTargets?: readonly { id: string; title: string }[];
  /** Every identity detail the platform offers — for asking one the form does not. */
  identityCatalogue?: readonly KycFieldConfig[];
  catalogue?: KycDocumentType[];
  refusal?: StepRefusal;
}) {
  const core = isCoreStep(step);
  // The rows the broker arranges: identity details and questions — never a
  // document (the checklist) or the selfie camera (fixed).
  const rows = step.fields.filter(
    (field) => !isDocumentField(field) && (isIdentityField(step, field) || !isSystemField(field)),
  );
  const reorderRows = (next: KycFieldConfig[]) =>
    onReorderFields([...step.fields.filter((field) => !rows.includes(field)), ...next]);
  const placed = new Set(rows.map((field) => field.name));
  const missingIdentity =
    step.slug === 'personal' ? identityCatalogue.filter((field) => !placed.has(field.name)) : [];

  return (
    <div
      className={`rounded-2xl border transition-colors ${
        step.enabled ? 'border-border bg-card shadow-sm' : 'border-border/50 bg-muted/20 opacity-75'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 md:p-5">
        <div className="flex min-w-0 flex-1 items-center gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-link">
            {step.stepNumber}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-sm font-bold text-foreground">{step.title}</h3>
              {core && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <Lock className="h-3 w-3" aria-hidden="true" />
                  {t('builder.builtIn')}
                </span>
              )}
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                  step.enabled ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
                }`}
              >
                {step.enabled ? t('builder.active') : t('builder.disabled')}
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{step.description}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant={step.enabled ? 'outline' : 'default'}
            size="sm"
            onClick={onToggleEnabled}
            className="h-8 px-2.5 text-xs"
          >
            {step.enabled ? t('builder.disable') : t('builder.enable')}
          </Button>
          {!core && canDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="focus-outline ms-1 flex h-8 w-8 items-center justify-center rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10"
              title={t('builder.deleteStep')}
              aria-label={t('builder.deleteStepNamed', { title: step.title })}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-6 rounded-b-2xl border-t border-border bg-muted/10 p-4 md:p-6">
        {refusal?.step && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs font-medium text-destructive"
          >
            {refusal.step}
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor={`title-${step.id}`}>
              {t('builder.stepTitle')}
            </Label>
            <Input
              id={`title-${step.id}`}
              value={step.title}
              onChange={(e) => onPatch({ title: e.target.value })}
              aria-invalid={refusal?.properties?.title ? true : undefined}
            />
            {refusal?.properties?.title && (
              <FieldError id={`title-${step.id}-error`}>{refusal.properties.title}</FieldError>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor={`desc-${step.id}`}>
              {t('builder.stepDescription')}
            </Label>
            <Input
              id={`desc-${step.id}`}
              value={step.description}
              onChange={(e) => onPatch({ description: e.target.value })}
              aria-invalid={refusal?.properties?.description ? true : undefined}
            />
            {refusal?.properties?.description && (
              <FieldError id={`desc-${step.id}-error`}>{refusal.properties.description}</FieldError>
            )}
          </div>
          <ArabicInput
            id={`titleAr-${step.id}`}
            label={t('arabic.title')}
            labelClassName="text-xs"
            value={step.titleAr ?? ''}
            onChange={(titleAr) => onPatch({ titleAr })}
            maxLength={TITLE_AR_MAX}
            error={refusal?.properties?.titleAr}
          />
          <ArabicInput
            id={`descAr-${step.id}`}
            label={t('arabic.description')}
            labelClassName="text-xs"
            value={step.descriptionAr ?? ''}
            onChange={(descriptionAr) => onPatch({ descriptionAr })}
            maxLength={DESCRIPTION_AR_MAX}
            error={refusal?.properties?.descriptionAr}
          />
          <div className="md:col-span-2">
            <ArabicHelper />
            {/*
             * A built-in step arrives with the PLATFORM's Arabic while its
             * English is the platform's; reworded, the server drops it (it
             * would translate words no longer there). Saved from here, it is
             * the broker's own and stays — so a rewording needs its Arabic too.
             */}
            {core && (
              <p className="text-[11px] text-muted-foreground">{t('builder.coreArabicHint')}</p>
            )}
          </div>
        </div>

        {takesEvidence(step.slug) && (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border bg-card/60 p-3.5">
            <Checkbox
              checked={step.evidenceRequired !== false}
              onCheckedChange={(checked) => onPatch({ evidenceRequired: checked === true })}
              className="mt-0.5"
            />
            <span>
              <span className="block text-xs font-semibold text-foreground">
                {t('builder.evidenceRequired')}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                {step.evidenceRequired !== false
                  ? t('builder.evidenceRequiredHint')
                  : t('builder.evidenceOptionalHint')}
              </span>
            </span>
          </label>
        )}

        {(step.slug === 'document' || step.slug === 'address') && (
          <DocumentChecklist
            category={step.slug === 'document' ? 'identity' : 'address'}
            catalogue={catalogue}
            fields={step.fields}
            onChange={onReorderFields}
          />
        )}

        {step.slug === 'selfie' && (
          <p className="flex items-start gap-2 rounded-xl border border-border bg-card/60 p-3.5 text-xs text-muted-foreground">
            <Camera className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {t('builder.selfieFixed')}
              <FixedArabic
                className="mt-1 block"
                value={step.fields.find((field) => field.type === 'camera')?.labelAr}
              />
            </span>
          </p>
        )}

        <div className="space-y-4 border-t border-border pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                {step.slug === 'personal'
                  ? t('builder.personalRowsTitle')
                  : t('builder.fieldsTitle')}
              </h4>
              <p className="mt-1 max-w-prose text-[11px] text-muted-foreground">
                {step.slug === 'personal' ? t('builder.personalRowsBody') : t('builder.holdsAdded')}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <AddIdentityDetail
                missing={missingIdentity}
                onAdd={(field) => onReorderFields([...step.fields, { ...field, system: true }])}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={onAddField}
                className="h-8 gap-1.5 border-primary/30 text-xs text-link hover:bg-primary/10"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t('builder.addField')}</span>
              </Button>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="rounded-xl border border-dashed py-6 text-center text-xs text-muted-foreground">
              {t('builder.noFieldsHint')}
            </div>
          ) : (
            <SortableList items={rows} onReorder={reorderRows}>
              <div className="space-y-3">
                {rows.map((field) => (
                  <SortableRow
                    key={field.id}
                    id={field.id}
                    handleLabel={t('builder.reorderField', { label: field.label })}
                  >
                    {isIdentityField(step, field) ? (
                      <IdentityRow
                        field={field}
                        onRequiredChange={(required) => onPatchField(field.id, { required })}
                        onRemove={() => onRemoveField(field.id)}
                      />
                    ) : (
                      <FieldEditor
                        field={field}
                        slug={step.slug}
                        error={refusal?.fields[field.id]}
                        errors={refusal?.fieldProperties?.[field.id]}
                        onChange={(patch) => onPatchField(field.id, patch)}
                        onRemove={() => onRemoveField(field.id)}
                        moveTargets={moveTargets}
                        onMove={onMoveField ? (stepId) => onMoveField(field.id, stepId) : undefined}
                      />
                    )}
                  </SortableRow>
                ))}
              </div>
            </SortableList>
          )}
        </div>
      </div>
    </div>
  );
}
