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
import { fieldTypesForStep, isCanonicalSelfie } from './field-types';

export type KycFieldConfig = components['schemas']['KycFieldConfigDto'];
export type KycDocumentType = components['schemas']['KycDocumentTypeDto'];

/**
 * Every document is an INPUT TYPE, listed beside `text` and `date`.
 *
 * A step offering three ways to prove identity is three fields — one typed
 * `doc:passport`, one `doc:national_id`, one `doc:driving_license` — so the
 * builder reads the way the step reads to the client.
 *
 * The list comes from the API's catalogue rather than being hard-coded here:
 * how many photos a passport needs is a fact the client portal renders from
 * too, and two copies of it would drift the moment one was edited. Which of
 * them a step may offer is `fieldTypesForStep` — only the two document steps,
 * each its own kind.
 */
function documentFieldTypes(documents: KycDocumentType[]) {
  return documents.map((doc) => ({
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
  slug,
  catalogue = [],
  locked,
  onChange,
  onRemove,
}: {
  field: KycFieldConfig;
  /** The step's slug — it decides which types the step can store. */
  slug: string;
  /** Why this field cannot be removed — the step would be one nobody can complete. */
  locked?: 'selfie' | 'lastDocument';
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
  const offered = fieldTypesForStep(slug, catalogue, field);

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

        {/*
          THE KEY NAME IS NOT SHOWN AT ALL.

          It was a plain text box beside "Field Label", then a read-only one. Both
          were wrong for the same reason: it is a database identifier, and putting
          it in a form teaches an operator it is theirs to think about. Nobody ever
          has to choose one — `addFieldToStep` generates `customField_<timestamp>`,
          unique and machine-safe — so the box only ever displayed a value the
          computer had already picked correctly.

          It is still the key answers are stored under, it still appears in exports
          and in the API, and the rules protecting it are unchanged and enforced
          where they belong: `kyc-config-integrity.ts` refuses a renamed reserved
          key (`dateOfBirth`, `phone`, `country` — the server reads those literal
          strings, so a rename switches a check off while the form still looks
          correct) and refuses duplicate keys within a step. Removing the input
          removes a decision, not a safeguard.
        */}

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
              {offered.base.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {t(option.label as Parameters<typeof t>[0])}
                </SelectItem>
              ))}
              {/* The photo count rides on the option because it is what an
                  operator is choosing between: a passport costs the client one
                  upload, an ID card two. */}
              {documentFieldTypes(offered.documents).map((option) => (
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
       * Only for `select` and `checkbox`. See the header: an options box on a
       * `text` field is a control with no effect, and an operator who fills it
       * in has been misled rather than helped. On a checkbox the choices are
       * OPTIONAL — none is a single tick box whose label is what the client
       * confirms; some make it "tick all that apply" (asked for in local
       * testing: "where can I put checkbox options?").
       */}
      {field.type === 'checkbox' && (
        <div className="mt-3 space-y-1">
          <Label className="text-[11px]" htmlFor={`options-${field.id}`}>
            {t('builder.checkboxChoices')}
          </Label>
          <Input
            id={`options-${field.id}`}
            value={optionsText}
            onChange={(e) => setOptions(e.target.value)}
            placeholder={t('builder.checkboxChoicesPlaceholder')}
            className="h-8 text-xs"
          />
          <p className="text-[11px] text-muted-foreground">
            {(field.options ?? []).length === 0
              ? t('builder.checkboxSingle')
              : t('builder.checkboxMany', { count: (field.options ?? []).length })}
          </p>
        </div>
      )}
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
        {/*
         * NO "Required" ON A DOCUMENT. A document step offers its documents as
         * a CHOICE: the client picks one and must upload every page it needs,
         * because the step is enabled — `submit` asks for the chosen document
         * and never reads this flag. A checkbox here was a control that did
         * nothing, which is what an operator trusting it deserves to be told.
         */}
        {field.type.startsWith('doc:') ? (
          <span className="text-[11px] text-muted-foreground">
            {t('builder.documentChoiceNote')}
          </span>
        ) : isCanonicalSelfie(slug, field) ? (
          // Likewise the selfie: taken whenever the step is enabled, whatever
          // this flag says.
          <span className="text-[11px] text-muted-foreground">{t('builder.selfieAlwaysNote')}</span>
        ) : (
          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox
              checked={field.required}
              onCheckedChange={(checked) => onChange({ required: checked === true })}
            />
            <span className="text-[11px] font-medium">{t('builder.requiredField')}</span>
          </label>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
          // The reason is ON the control: a disabled button with no explanation
          // reads as a broken one.
          disabled={locked !== undefined}
          title={
            locked === 'selfie'
              ? t('builder.lockedSelfie')
              : locked === 'lastDocument'
                ? t('builder.lockedLastDocument')
                : undefined
          }
          aria-label={
            locked === 'selfie'
              ? t('builder.lockedSelfie')
              : locked === 'lastDocument'
                ? t('builder.lockedLastDocument')
                : t('builder.removeFieldNamed', { label: field.label })
          }
          className="h-7 gap-1.5 text-xs text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{t('builder.removeField')}</span>
        </Button>
      </div>
    </div>
  );
}
