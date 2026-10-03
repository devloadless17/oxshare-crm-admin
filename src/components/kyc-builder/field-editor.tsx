'use client';

import { Trash2 } from 'lucide-react';
import type { components } from '@/lib/api/types.gen';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ChipInput } from '@/components/ui/chip-input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { t } from '@/lib/i18n';
import { fieldTypesForStep } from './field-types';
import { ArabicHelper, ArabicInput, FieldError } from './arabic-input';

export type KycFieldConfig = components['schemas']['KycFieldConfigDto'];
export type KycDocumentType = components['schemas']['KycDocumentTypeDto'];

/** The server's bounds (`KycFieldDto`): label 200, hint 500, one choice's Arabic 200. */
const LABEL_AR_MAX = 200;
const HINT_AR_MAX = 500;
const OPTION_AR_MAX = 200;

/** Properties this editor shows a refusal under; any other is listed below the field. */
const SHOWN_IN_PLACE = new Set(['label', 'hint', 'options', 'labelAr', 'hintAr', 'optionsAr']);

/**
 * The Arabic of the choices that still exist, after the English list changed.
 * Keyed by the English value, so reordering keeps every translation and a
 * removed (or renamed) choice drops its own. `undefined` when none is left.
 */
export function keepArabicFor(
  optionsAr: KycFieldConfig['optionsAr'],
  options: readonly string[],
): KycFieldConfig['optionsAr'] {
  if (!optionsAr) return undefined;
  const kept = Object.fromEntries(
    Object.entries(optionsAr).filter(([value]) => options.includes(value)),
  );
  return Object.keys(kept).length > 0 ? kept : undefined;
}

/**
 * One of the BROKER's own fields — a question or an upload, on any step
 * (Phase 2, 29 Sep 2026). "Move to…" sends it to another step, and the answers
 * clients already gave follow it: an answer is found by its key wherever the
 * question sits now.
 *
 * The platform's fields never come here: an identity detail is an `IdentityRow`
 * (placed and required or not, never relabelled), the documents are the
 * `DocumentChecklist`, the selfie camera is a fixed line. Each of those used to
 * be an ordinary editable row, which is how deleting First Name and adding it
 * back produced a custom box instead of the client's name (26 Sep 2026).
 *
 * The KEY is not shown at all: it is a storage identifier the builder generates
 * (`customField_<timestamp>`), and a box for it taught operators it was theirs
 * to think about. What the server refuses about a field — a label that names
 * something the platform already collects, say — is shown under it (`error`).
 */
export function FieldEditor({
  field,
  slug,
  error,
  errors = {},
  onChange,
  onRemove,
  moveTargets = [],
  onMove,
}: {
  field: KycFieldConfig;
  /** The step's slug — it decides which types a field there may be. */
  slug: string;
  /** The server's refusal about THIS field, from the last save. */
  error?: string;
  /** The server's refusals of single inputs of this field, by property (`labelAr`). */
  errors?: Record<string, string>;
  onChange: (patch: Partial<KycFieldConfig>) => void;
  onRemove: () => void;
  /** The other steps this question may move to — its answers follow it (Phase 2). */
  moveTargets?: readonly { id: string; title: string }[];
  onMove?: (stepId: string) => void;
}) {
  const offered = fieldTypesForStep(slug);
  const hasChoices = field.type === 'select' || field.type === 'checkbox';
  // A refusal of a property this editor has no box for still has to be read.
  const otherErrors = Object.entries(errors)
    .filter(([property]) => !SHOWN_IN_PLACE.has(property))
    .map(([, message]) => message);
  const invalid = Boolean(error) || Object.keys(errors).length > 0;

  return (
    <div
      className={`rounded-xl border bg-card/60 p-3.5 ${invalid ? 'border-destructive/60' : 'border-border'}`}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-[11px]" htmlFor={`label-${field.id}`}>
            {t('builder.fieldLabel')}
          </Label>
          <Input
            id={`label-${field.id}`}
            value={field.label}
            onChange={(e) => onChange({ label: e.target.value })}
            aria-invalid={Boolean(error || errors.label)}
            aria-describedby={
              error ? `error-${field.id}` : errors.label ? `label-${field.id}-error` : undefined
            }
            className="h-8 text-xs"
          />
          {errors.label && <FieldError id={`label-${field.id}-error`}>{errors.label}</FieldError>}
        </div>

        <div className="space-y-1">
          <Label className="text-[11px]" htmlFor={`type-${field.id}`}>
            {t('builder.inputType')}
          </Label>
          <Select
            value={field.type}
            onValueChange={(value) => onChange({ type: value as KycFieldConfig['type'] })}
          >
            <SelectTrigger id={`type-${field.id}`} className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {offered.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {t(option.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-[11px]" htmlFor={`hint-${field.id}`}>
            {t('builder.fieldHint')}
          </Label>
          <Input
            id={`hint-${field.id}`}
            value={field.hint ?? ''}
            onChange={(e) => onChange({ hint: e.target.value })}
            placeholder={t('builder.fieldHintPlaceholder')}
            aria-invalid={errors.hint ? true : undefined}
            className="h-8 text-xs"
          />
          {errors.hint && <FieldError id={`hint-${field.id}-error`}>{errors.hint}</FieldError>}
        </div>
      </div>

      {/*
       * Choices only for `select` and `checkbox` — on any other type the box
       * would be a control with no effect. On a checkbox they are optional: none
       * is a single tick box, some make it "tick all that apply".
       */}
      {hasChoices && (
        <div className="mt-3 space-y-1">
          <Label className="text-[11px]" htmlFor={`options-${field.id}`}>
            {field.type === 'select' ? t('builder.fieldOptions') : t('builder.checkboxChoices')}
          </Label>
          {/* Chips: type a choice and press Enter; pasting "A, B, C" adds each. */}
          <ChipInput
            id={`options-${field.id}`}
            value={field.options ?? []}
            // The Arabic is keyed by the English choice: a choice still there
            // keeps its Arabic, a removed one takes its Arabic with it.
            onChange={(options) =>
              onChange({ options, optionsAr: keepArabicFor(field.optionsAr, options) })
            }
            ariaLabel={
              field.type === 'select' ? t('builder.fieldOptions') : t('builder.checkboxChoices')
            }
            placeholder={
              field.type === 'select'
                ? t('builder.fieldOptionsPlaceholder')
                : t('builder.checkboxChoicesPlaceholder')
            }
          />
          <p className="text-[11px] text-muted-foreground">
            {field.type === 'select'
              ? (field.options ?? []).length === 0
                ? t('builder.fieldOptionsEmpty')
                : t('builder.fieldOptionsCount', { count: (field.options ?? []).length })
              : (field.options ?? []).length === 0
                ? t('builder.checkboxSingle')
                : t('builder.checkboxMany', { count: (field.options ?? []).length })}
          </p>
          {errors.options && (
            <FieldError id={`options-${field.id}-error`}>{errors.options}</FieldError>
          )}
        </div>
      )}

      <section
        aria-label={t('builder.arabicSection')}
        className="mt-3 space-y-3 rounded-lg border border-dashed border-border p-3"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h5 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {t('builder.arabicSection')}
          </h5>
          <ArabicHelper />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ArabicInput
            id={`labelAr-${field.id}`}
            label={t('arabic.label')}
            labelClassName="text-[11px]"
            value={field.labelAr ?? ''}
            onChange={(labelAr) => onChange({ labelAr })}
            maxLength={LABEL_AR_MAX}
            error={errors.labelAr}
            className="h-8 text-xs"
          />
          <ArabicInput
            id={`hintAr-${field.id}`}
            label={t('arabic.hint')}
            labelClassName="text-[11px]"
            value={field.hintAr ?? ''}
            onChange={(hintAr) => onChange({ hintAr })}
            maxLength={HINT_AR_MAX}
            error={errors.hintAr}
            className="h-8 text-xs"
          />
        </div>
        {hasChoices && (field.options ?? []).length > 0 && (
          <ChoicesArabic
            field={field}
            error={errors.optionsAr}
            onChange={(optionsAr) => onChange({ optionsAr })}
          />
        )}
      </section>

      {otherErrors.map((message) => (
        <p key={message} role="alert" className="mt-3 text-[11px] font-medium text-destructive">
          {message}
        </p>
      ))}

      {error && (
        <p
          id={`error-${field.id}`}
          role="alert"
          className="mt-3 text-[11px] font-medium text-destructive"
        >
          {error}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox
            checked={field.required}
            onCheckedChange={(checked) => onChange({ required: checked === true })}
          />
          <span className="text-[11px] font-medium">{t('builder.requiredField')}</span>
        </label>

        <div className="flex items-center gap-2">
          {onMove && moveTargets.length > 0 && (
            <Select value="" onValueChange={onMove}>
              <SelectTrigger
                className="h-7 w-auto gap-1.5 text-xs"
                aria-label={t('builder.moveFieldNamed', { label: field.label })}
              >
                <SelectValue placeholder={t('builder.moveTo')} />
              </SelectTrigger>
              <SelectContent>
                {moveTargets.map((target) => (
                  <SelectItem key={target.id} value={target.id}>
                    {target.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            aria-label={t('builder.removeFieldNamed', { label: field.label })}
            className="h-7 gap-1.5 text-xs text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t('builder.removeField')}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * One Arabic box per English choice, each labelled with the choice it
 * translates. What a client picks is still stored as the English value; the
 * Arabic is only what an Arabic reader is SHOWN for it. A blank box removes the
 * entry, so a choice without Arabic shows its English — and the count says how
 * many do, because a half-translated list is easy to miss in a long one.
 */
function ChoicesArabic({
  field,
  error,
  onChange,
}: {
  field: KycFieldConfig;
  error?: string;
  onChange: (optionsAr: KycFieldConfig['optionsAr']) => void;
}) {
  const options = field.options ?? [];
  const arabic = field.optionsAr ?? {};
  const missing = options.filter((option) => !arabic[option]?.trim()).length;

  const set = (option: string, value: string) => {
    const next = { ...keepArabicFor(arabic, options) };
    if (value === '') delete next[option];
    else next[option] = value;
    onChange(Object.keys(next).length > 0 ? next : undefined);
  };

  return (
    <fieldset className="space-y-2">
      <legend className="text-[11px] font-semibold">{t('builder.choicesArabic')}</legend>
      <ul className="space-y-1.5">
        {options.map((option, index) => {
          const id = `optionAr-${field.id}-${index}`;
          return (
            <li
              key={option}
              className="grid grid-cols-1 items-center gap-1 sm:grid-cols-2 sm:gap-3"
            >
              <label htmlFor={id} className="truncate text-xs text-muted-foreground" title={option}>
                {option}
              </label>
              <input
                id={id}
                dir="rtl"
                lang="ar"
                value={arabic[option] ?? ''}
                maxLength={OPTION_AR_MAX}
                onChange={(e) => set(option, e.target.value)}
                aria-label={t('builder.choiceArabicNamed', { choice: option })}
                className="h-8 w-full rounded-lg border border-input bg-card px-3 text-right text-xs focus-outline"
              />
            </li>
          );
        })}
      </ul>
      {missing > 0 && (
        <p className="text-[11px] text-warning">
          {t('builder.choicesArabicMissing', { missing, count: options.length })}
        </p>
      )}
      {error && <FieldError id={`optionsAr-${field.id}-error`}>{error}</FieldError>}
    </fieldset>
  );
}
