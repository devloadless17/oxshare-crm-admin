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

export type KycFieldConfig = components['schemas']['KycFieldConfigDto'];
export type KycDocumentType = components['schemas']['KycDocumentTypeDto'];

/**
 * EVERY type in the schema, in one place.
 *
 * The union lives in `types.gen.ts` and TypeScript checks this list against it
 * — `satisfies` below means a type added to the API and not added here is a
 * compile error rather than a silently unofferable option. The builder was
 * previously missing `camera` for exactly that reason: the hand-written copy of
 * the union omitted it.
 */
export const FIELD_TYPES = [
  { value: 'text', label: 'builder.typeText' },
  { value: 'date', label: 'builder.typeDate' },
  { value: 'phone', label: 'builder.typePhone' },
  { value: 'select', label: 'builder.typeSelect' },
  { value: 'file', label: 'builder.typeFile' },
  { value: 'camera', label: 'builder.typeCamera' },
  { value: 'checkbox', label: 'builder.typeCheckbox' },
] as const satisfies readonly { value: KycFieldConfig['type']; label: string }[];

/**
 * Every document is an INPUT TYPE, listed beside `text` and `date`.
 *
 * A step offering three ways to prove identity is three fields — one typed
 * `doc:passport`, one `doc:national_id`, one `doc:driving_license` — so the
 * builder reads the way the step reads to the client.
 *
 * The list comes from the API's catalogue rather than being hard-coded here:
 * how many photos a passport needs is a fact the client portal renders from
 * too, and two copies of it would drift the moment one was edited.
 */
function documentFieldTypes(catalogue: KycDocumentType[]) {
  return catalogue.map((doc) => ({
    value: `doc:${doc.value}`,
    label: doc.label,
    parts: doc.parts?.length ?? 0,
  }));
}

/**
 * One field inside a step.
 *
 * ## `options` and `hint` are editable here for the first time
 *
 * Both are in `KycFieldConfigDto` and neither had an editor. For `select` that
 * was not cosmetic: a select with no options renders an empty dropdown in the
 * client portal, so the only way to configure one was to edit the database. The
 * options input appears exactly when the type is `select`, because for every
 * other type the value is meaningless and a permanently visible empty box
 * invites filling it in.
 */
export function FieldEditor({
  field,
  catalogue = [],
  onChange,
  onRemove,
}: {
  field: KycFieldConfig;
  /** The documents a `document` field may accept. Served by the API. */
  catalogue?: KycDocumentType[];
  onChange: (patch: Partial<KycFieldConfig>) => void;
  onRemove: () => void;
}) {
  /*
   * THE RAW TEXT IS LOCAL STATE. Deriving it from the array does not work, and
   * the failure is worth spelling out because it looks like it should.
   *
   * Deriving means `value={options.join(', ')}` with a parse on every
   * keystroke. Type "Passport," and the parse drops the empty trailing entry,
   * so the array is `['Passport']` and the input re-renders as "Passport" —
   * the comma the operator just typed is deleted under the cursor. Type the
   * space and it goes too. The result is "PassportDrivinglicence": one option,
   * every separator eaten. A test caught exactly this.
   *
   * So the string the operator is editing lives here, and the array is derived
   * FROM it on the way out. `useState` seeds from the prop, and the `key` on
   * the parent row means a different field remounts this component with its own
   * text rather than inheriting the previous one's.
   */
  const [optionsText, setOptionsText] = React.useState(() => (field.options ?? []).join(', '));

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
    <div className="rounded-xl border border-border bg-card/60 p-3.5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-[11px]" htmlFor={`label-${field.id}`}>
            {t('builder.fieldLabel')}
          </Label>
          <Input
            id={`label-${field.id}`}
            value={field.label}
            onChange={(e) => onChange({ label: e.target.value })}
            className="h-8 text-xs"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-[11px]" htmlFor={`name-${field.id}`}>
            {t('builder.keyName')}
          </Label>
          <Input
            id={`name-${field.id}`}
            value={field.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className="h-8 font-mono text-xs"
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
              {FIELD_TYPES.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {t(option.label as Parameters<typeof t>[0])}
                </SelectItem>
              ))}
              {/* The photo count rides on the option because it is what an
                  operator is choosing between: a passport costs the client one
                  upload, an ID card two. */}
              {documentFieldTypes(catalogue).map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label} · {t('builder.documentParts', { count: option.parts })}
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
       * Only for `select`. See the header: an options box on a `text` field is
       * a control with no effect, and an operator who fills it in has been
       * misled rather than helped.
       */}
      {field.type === 'select' && (
        <div className="mt-3 space-y-1">
          <Label className="text-[11px]" htmlFor={`options-${field.id}`}>
            {t('builder.fieldOptions')}
          </Label>
          <Input
            id={`options-${field.id}`}
            value={optionsText}
            onChange={(e) => setOptions(e.target.value)}
            placeholder={t('builder.fieldOptionsPlaceholder')}
            className="h-8 text-xs"
          />
          <p className="text-[11px] text-muted-foreground">
            {(field.options ?? []).length === 0
              ? t('builder.fieldOptionsEmpty')
              : t('builder.fieldOptionsCount', { count: (field.options ?? []).length })}
          </p>
        </div>
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
