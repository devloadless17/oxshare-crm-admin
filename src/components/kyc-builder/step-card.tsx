'use client';

import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { components } from '@/lib/api/types.gen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldEditor, type KycDocumentType, type KycFieldConfig } from './field-editor';
import { lockedReason } from './field-types';
import { SortableList, SortableRow } from './sortable-row';
import { t } from '@/lib/i18n';

export type KycStepConfig = components['schemas']['KycStepConfigDto'];

/** What each built-in step collects, in the operator's words; any other step is one they added. */
const STEP_HOLDS: Partial<Record<string, Parameters<typeof t>[0]>> = {
  personal: 'builder.holdsPersonal',
  document: 'builder.holdsDocument',
  address: 'builder.holdsDocument',
  selfie: 'builder.holdsSelfie',
};

/**
 * One step in the onboarding flow, and every field inside it.
 *
 * ## Both reorder affordances, deliberately
 *
 * The card carries a drag handle AND the Up/Down buttons it used to have.
 * Dropping the buttons for drag would have removed an ability rather than
 * added one: a single-position nudge is more precise with a button, and the
 * buttons work under any assistive technology without the operator having to
 * discover that Space picks a row up.
 */
export function StepCard({
  step,
  index,
  total,
  onMove,
  onToggleEnabled,
  onDelete,
  onPatch,
  onAddField,
  onPatchField,
  onRemoveField,
  onReorderFields,
  catalogue,
}: {
  step: KycStepConfig;
  index: number;
  total: number;
  onMove: (direction: 'up' | 'down') => void;
  onToggleEnabled: () => void;
  onDelete: () => void;
  onPatch: (patch: Partial<KycStepConfig>) => void;
  onAddField: () => void;
  onPatchField: (fieldId: string, patch: Partial<KycFieldConfig>) => void;
  onRemoveField: (fieldId: string) => void;
  onReorderFields: (fields: KycFieldConfig[]) => void;
  /** Documents a `document` field may accept — threaded from the page. */
  catalogue?: KycDocumentType[];
}) {
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
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                  step.enabled ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
                }`}
              >
                {step.enabled ? t('builder.active') : t('builder.disabled')}
              </span>
              <span className="text-[10px] font-medium text-muted-foreground">
                {t('builder.fieldsCount', { count: step.fields.length })}
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{step.description}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => onMove('up')}
            className="focus-outline flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30"
            title={t('kycBuilder.moveStepUp')}
          >
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            disabled={index === total - 1}
            onClick={() => onMove('down')}
            className="focus-outline flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30"
            title={t('kycBuilder.moveStepDown')}
          >
            <ArrowDown className="h-4 w-4" aria-hidden="true" />
          </button>

          <Button
            variant={step.enabled ? 'outline' : 'default'}
            size="sm"
            onClick={onToggleEnabled}
            className="h-8 px-2.5 text-xs"
          >
            {step.enabled ? t('builder.disable') : t('builder.enable')}
          </Button>

          <button
            type="button"
            onClick={onDelete}
            /*
             * THE LAST STEP CANNOT BE DELETED, and this is not the rule the
             * owner retired.
             *
             * That rule was about WHICH steps may go — it pinned `personal`,
             * `document`, `selfie` and `address`, and it refused deletions an
             * operator legitimately wanted. This refuses only the deletion that
             * leaves NOTHING behind. Zero steps is not a configuration anyone
             * could choose; it is the absence of one, and no client can ever
             * verify again.
             *
             * Refused at the CLICK rather than at the save. `PUT
             * /admin/kyc-config` is a full replace, so a rejection arrives
             * after every edit in the session has been made — it tells an
             * operator their work was refused without telling them which of
             * four confirmed deletions caused it. The screen knows which one is
             * last; it should say so at the moment it matters.
             */
            disabled={total <= 1}
            className="focus-outline ms-1 flex h-8 w-8 items-center justify-center rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
            title={total <= 1 ? t('builder.deleteLastStepRefused') : t('builder.deleteStep')}
            aria-label={
              total <= 1
                ? t('builder.deleteLastStepRefused')
                : t('builder.deleteStepNamed', { title: step.title })
            }
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/*
       * ALWAYS OPEN. This used to be an accordion body behind `isExpanded`,
       * which made sense when every step was stacked on one page. A step now
       * has its own tab, so reaching this card IS the act of opening it — a
       * second collapse control inside would be a fold within a fold.
       */}
      <div className="space-y-6 rounded-b-2xl border-t border-border bg-muted/10 p-4 md:p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor={`slug-${step.id}`}>
              {t('builder.slugIdentifier')}
            </Label>
            <Input
              id={`slug-${step.id}`}
              value={step.slug}
              /*
               * READ-ONLY for the same reason as a field's key, and with a
               * sharper failure behind it: the slug decides which column a
               * step's answers are written to (`step-slugs.ts`), and
               * `KycService.saveStep` refuses a slug it has no column for. A
               * renamed slug saved cleanly here and then stopped every client
               * who pressed Continue — an error nobody configuring it could see.
               */
              readOnly
              aria-readonly
              title={t('builder.slugLocked')}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
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

        <div className="space-y-4 border-t border-border pt-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                {t('builder.fieldsCount', { count: step.fields.length })}
              </h4>
              <p className="text-[11px] text-muted-foreground">
                {step.fields.length > 1 ? t('builder.dragHint') : t('builder.fieldsHint')}
              </p>
              {/* Why the type list is what it is — see `fieldTypesForStep`. */}
              <p className="mt-1 max-w-prose text-[11px] text-muted-foreground">
                {t(STEP_HOLDS[step.slug] ?? 'builder.holdsAdded')}
              </p>
            </div>
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

          {step.fields.length === 0 ? (
            <div className="rounded-xl border border-dashed py-6 text-center text-xs text-muted-foreground">
              {t('builder.noFieldsHint')}
            </div>
          ) : (
            <SortableList items={step.fields} onReorder={onReorderFields}>
              <div className="space-y-3">
                {step.fields.map((field) => (
                  <SortableRow
                    key={field.id}
                    id={field.id}
                    handleLabel={t('builder.reorderField', { label: field.label })}
                  >
                    <FieldEditor
                      field={field}
                      slug={step.slug}
                      catalogue={catalogue}
                      locked={lockedReason(step.slug, field, step.fields)}
                      onChange={(patch) => onPatchField(field.id, patch)}
                      onRemove={() => onRemoveField(field.id)}
                    />
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
