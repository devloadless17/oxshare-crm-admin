'use client';

import { Camera, Lock, Plus, Trash2 } from 'lucide-react';
import type { components } from '@/lib/api/types.gen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldEditor, type KycDocumentType, type KycFieldConfig } from './field-editor';
import { IdentityBlock } from './identity-block';
import { DocumentChecklist } from './document-checklist';
import { isAlwaysOn, isCoreStep, isSystemField, ownFields, takesOwnFields } from './field-types';
import { SortableList, SortableRow } from './sortable-row';
import { t } from '@/lib/i18n';

export type KycStepConfig = components['schemas']['KycStepConfigDto'];

/** What the server refused about this step and its fields, from the last save. */
export interface StepRefusal {
  step?: string;
  fields: Record<string, string>;
}

/**
 * One step of the onboarding flow, shown as what it IS (26 Sep 2026).
 *
 * The four BUILT-IN steps are the platform's: their names are fixed, none can
 * be deleted, and Personal Information and Identity Document are always on —
 * Selfie and Proof of Address can be switched off. Each shows what it holds:
 *
 *   Personal Information   the client's identity (fixed), then YOUR questions
 *   Identity Document      the documents it accepts — a checklist
 *   Proof of Address       the same, for address documents
 *   Selfie                 one live selfie — nothing to configure
 *
 * A step of the broker's own is theirs entirely: name, description, questions
 * and uploads, on or off, kept or deleted.
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
  catalogue = [],
  refusal,
}: {
  step: KycStepConfig;
  /** Holds `kyc.delete` — deleting a step is its own power. */
  canDelete: boolean;
  onToggleEnabled: () => void;
  onDelete: () => void;
  onPatch: (patch: Partial<KycStepConfig>) => void;
  onAddField: () => void;
  onPatchField: (fieldId: string, patch: Partial<KycFieldConfig>) => void;
  onRemoveField: (fieldId: string) => void;
  /** The step's whole field list — its own fields reordered, or the documents re-ticked. */
  onReorderFields: (fields: KycFieldConfig[]) => void;
  catalogue?: KycDocumentType[];
  refusal?: StepRefusal;
}) {
  const core = isCoreStep(step);
  const alwaysOn = isAlwaysOn(step);
  const own = ownFields(step.fields);
  const platform = step.fields.filter(isSystemField);

  /** The platform's fields stay where they are; only the broker's own move. */
  const reorderOwn = (next: KycFieldConfig[]) =>
    onReorderFields([...step.fields.filter((field) => !own.includes(field)), ...next]);

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
                {alwaysOn
                  ? t('builder.alwaysOn')
                  : step.enabled
                    ? t('builder.active')
                    : t('builder.disabled')}
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{step.description}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {!alwaysOn && (
            <Button
              variant={step.enabled ? 'outline' : 'default'}
              size="sm"
              onClick={onToggleEnabled}
              className="h-8 px-2.5 text-xs"
            >
              {step.enabled ? t('builder.disable') : t('builder.enable')}
            </Button>
          )}
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
          {/* A built-in step keeps its name — every client and every reviewer knows it by it. */}
          {!core && (
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor={`title-${step.id}`}>
                {t('builder.stepTitle')}
              </Label>
              <Input
                id={`title-${step.id}`}
                value={step.title}
                onChange={(e) => onPatch({ title: e.target.value })}
              />
            </div>
          )}
          <div className={`space-y-1.5 ${core ? 'md:col-span-2' : ''}`}>
            <Label className="text-xs" htmlFor={`desc-${step.id}`}>
              {t('builder.stepDescription')}
            </Label>
            <Input
              id={`desc-${step.id}`}
              value={step.description}
              onChange={(e) => onPatch({ description: e.target.value })}
            />
          </div>
        </div>

        {step.slug === 'personal' && <IdentityBlock fields={platform} />}
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
            {t('builder.selfieFixed')}
          </p>
        )}

        {takesOwnFields(step.slug) && (
          <div className="space-y-4 border-t border-border pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                  {step.slug === 'personal' ? t('builder.yourQuestions') : t('builder.fieldsTitle')}
                </h4>
                <p className="mt-1 max-w-prose text-[11px] text-muted-foreground">
                  {step.slug === 'personal' ? t('builder.holdsPersonal') : t('builder.holdsAdded')}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={onAddField}
                className="h-8 gap-1.5 border-primary/30 text-xs text-link hover:bg-primary/10"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  {step.slug === 'personal' ? t('builder.addQuestion') : t('builder.addField')}
                </span>
              </Button>
            </div>

            {own.length === 0 ? (
              <div className="rounded-xl border border-dashed py-6 text-center text-xs text-muted-foreground">
                {step.slug === 'personal' ? t('builder.noQuestions') : t('builder.noFieldsHint')}
              </div>
            ) : (
              <SortableList items={own} onReorder={reorderOwn}>
                <div className="space-y-3">
                  {own.map((field) => (
                    <SortableRow
                      key={field.id}
                      id={field.id}
                      handleLabel={t('builder.reorderField', { label: field.label })}
                    >
                      <FieldEditor
                        field={field}
                        slug={step.slug}
                        error={refusal?.fields[field.id]}
                        onChange={(patch) => onPatchField(field.id, patch)}
                        onRemove={() => onRemoveField(field.id)}
                      />
                    </SortableRow>
                  ))}
                </div>
              </SortableList>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
