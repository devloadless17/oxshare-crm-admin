'use client';

import * as React from 'react';
import { Trash2 } from 'lucide-react';
import type { components } from '@/lib/api/types.gen';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
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

export type KycFieldConfig = components['schemas']['KycFieldConfigDto'];
export type KycDocumentType = components['schemas']['KycDocumentTypeDto'];

/**
 * One of the BROKER's own fields — a question on Personal Information, or a
 * question or upload on a step of their own.
 *
 * The platform's fields never come here: the client's identity is the
 * `IdentityBlock`, the documents are the `DocumentChecklist`, the selfie camera
 * is a fixed line. Each of those used to be an ordinary editable row, which is
 * how deleting First Name and adding it back produced a custom box instead of
 * the client's name (26 Sep 2026).
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
  onChange,
  onRemove,
}: {
  field: KycFieldConfig;
  /** The step's slug — it decides which types a field there may be. */
  slug: string;
  /** The server's refusal about THIS field, from the last save. */
  error?: string;
  onChange: (patch: Partial<KycFieldConfig>) => void;
  onRemove: () => void;
}) {
  /*
   * THE RAW TEXT IS LOCAL STATE. Deriving it from the array deletes the comma
   * the operator just typed ("Passport," parses to ['Passport'] and re-renders
   * without the comma), so the string being edited lives here and the array is
   * derived FROM it. The parent row's `key` remounts this for another field.
   */
  const [optionsText, setOptionsText] = React.useState(() => (field.options ?? []).join(', '));
  const offered = fieldTypesForStep(slug);

  const setOptions = (raw: string) => {
    setOptionsText(raw);
    onChange({
      options: raw
        .split(',')
        .map((option) => option.trim())
        .filter((option) => option.length > 0),
    });
  };

  return (
    <div
      className={`rounded-xl border bg-card/60 p-3.5 ${error ? 'border-destructive/60' : 'border-border'}`}
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
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `error-${field.id}` : undefined}
            className="h-8 text-xs"
          />
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
            className="h-8 text-xs"
          />
        </div>
      </div>

      {/*
       * Choices only for `select` and `checkbox` — on any other type the box
       * would be a control with no effect. On a checkbox they are optional: none
       * is a single tick box, some make it "tick all that apply".
       */}
      {(field.type === 'select' || field.type === 'checkbox') && (
        <div className="mt-3 space-y-1">
          <Label className="text-[11px]" htmlFor={`options-${field.id}`}>
            {field.type === 'select' ? t('builder.fieldOptions') : t('builder.checkboxChoices')}
          </Label>
          <Input
            id={`options-${field.id}`}
            value={optionsText}
            onChange={(e) => setOptions(e.target.value)}
            placeholder={
              field.type === 'select'
                ? t('builder.fieldOptionsPlaceholder')
                : t('builder.checkboxChoicesPlaceholder')
            }
            className="h-8 text-xs"
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
        </div>
      )}

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
  );
}
