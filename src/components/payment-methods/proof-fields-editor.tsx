'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { PaymentMethodPayToField, PaymentMethodProofField } from '@/lib/api/admin';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SortableList, SortableRow } from '@/components/kyc-builder/sortable-row';
import { t } from '@/lib/i18n';
import type { MessageKey } from '@/lib/i18n/messages';

/** The API's own ceiling (`PROOF_FIELD_LIMITS.fields`, backend 0163). */
export const MAX_PROOF_FIELDS = 8;

/**
 * A new detail's permanent id — `f_` and ten base-36 characters, the API's
 * pattern. Generated here so a row has its identity from the moment it is
 * added: the client's answers are keyed by it, and a label can then be renamed
 * freely without anybody's answer losing its question.
 */
export function newProofFieldId(): string {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  let id = '';
  while (id.length < 10) {
    for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
      // 252 = 7 × 36: dropping 252–255 keeps every character equally likely.
      if (byte < 252 && id.length < 10) id += alphabet[byte % 36];
    }
  }
  return `f_${id}`;
}

/**
 * What both lists share: a named, typed, shown-or-hidden row. A question
 * (`required`) is answered by the client; a shown detail (`value`) is the
 * broker's own, read by the client.
 */
interface EditableDetail {
  id: string;
  label: string;
  type: PaymentMethodProofField['type'];
  enabled: boolean;
  hint: string | null;
  labelAr: string | null;
  hintAr: string | null;
  required?: boolean;
  value?: string;
}

interface EditorCopy {
  title: MessageKey;
  hint: MessageKey;
  empty: MessageKey;
  add: MessageKey;
  labelPlaceholder: MessageKey;
  /** The API's refusal prefix — `proofFields.<i>.<prop>` or `payToFields.<i>.<prop>`. */
  errorPrefix: 'proofFields' | 'payToFields';
}

/**
 * The details an OFFLINE method asks the client for with the receipt — the
 * phone the money was sent from, a transfer code — each named, typed, required
 * or optional, and shown or hidden (backend 0163).
 *
 * A HIDDEN detail is kept, not deleted: switching it back on restores it as it
 * was. Deleting one is safe too — every answer already filed carries the
 * question as it was asked. Refusals come back keyed `proofFields.<i>.<prop>`
 * and are shown under their row.
 */
export function ProofFieldsEditor(props: {
  fields: PaymentMethodProofField[];
  onChange: (next: PaymentMethodProofField[]) => void;
  errors?: Record<string, string>;
}) {
  return (
    <DetailsEditor
      {...props}
      copy={{
        title: 'paymentMethods.proofFieldsTitle',
        hint: 'paymentMethods.proofFieldsHint',
        empty: 'paymentMethods.proofFieldsEmpty',
        add: 'paymentMethods.proofFieldAdd',
        labelPlaceholder: 'paymentMethods.proofFieldLabelPlaceholder',
        errorPrefix: 'proofFields',
      }}
      blank={() => ({ type: 'text', required: true })}
    />
  );
}

/**
 * The details an offline method SHOWS the client — where to send the money:
 * the phone a transfer goes to, an account name (backend 0199). Same rows as
 * the questions, with the broker's VALUE in place of "Required". The client
 * reads them with a Copy button and changes nothing; each deposit keeps a copy
 * of what it was shown, so editing a number here never rewrites an old deposit.
 */
export function PayToFieldsEditor(props: {
  fields: PaymentMethodPayToField[];
  onChange: (next: PaymentMethodPayToField[]) => void;
  errors?: Record<string, string>;
}) {
  return (
    <DetailsEditor
      {...props}
      copy={{
        title: 'paymentMethods.payToFieldsTitle',
        hint: 'paymentMethods.payToFieldsHint',
        empty: 'paymentMethods.payToFieldsEmpty',
        add: 'paymentMethods.payToFieldAdd',
        labelPlaceholder: 'paymentMethods.payToFieldLabelPlaceholder',
        errorPrefix: 'payToFields',
      }}
      blank={() => ({ type: 'phone', value: '' })}
    />
  );
}

function DetailsEditor<T extends EditableDetail>({
  fields,
  onChange,
  errors,
  copy,
  blank,
}: {
  fields: T[];
  onChange: (next: T[]) => void;
  errors?: Record<string, string>;
  copy: EditorCopy;
  /** What a new row starts as, beyond the fields every row shares. */
  blank: () => Partial<EditableDetail>;
}) {
  const patch = (id: string, change: Partial<T>) =>
    onChange(fields.map((field) => (field.id === id ? { ...field, ...change } : field)));
  const listError = errors?.[copy.errorPrefix];

  const add = () =>
    onChange([
      ...fields,
      {
        id: newProofFieldId(),
        label: '',
        enabled: true,
        hint: null,
        labelAr: null,
        hintAr: null,
        ...blank(),
      } as T,
    ]);

  return (
    <div className="space-y-2.5 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-0.5">
          <p className="text-xs font-semibold">{t(copy.title)}</p>
          <p className="text-[11px] leading-relaxed text-muted-foreground">{t(copy.hint)}</p>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {t('paymentMethods.proofFieldsArabicHint')}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={add}
          disabled={fields.length >= MAX_PROOF_FIELDS}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {t(copy.add)}
        </Button>
      </div>

      {fields.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-3 text-center text-[11px] text-muted-foreground">
          {t(copy.empty)}
        </p>
      ) : (
        <SortableList items={fields} onReorder={onChange}>
          <ol className="space-y-2">
            {fields.map((field, index) => (
              <DetailRow
                key={field.id}
                field={field}
                index={index}
                errors={errors}
                copy={copy}
                onPatch={(change) => patch(field.id, change)}
                onRemove={() => onChange(fields.filter((other) => other.id !== field.id))}
              />
            ))}
          </ol>
        </SortableList>
      )}

      {listError && (
        <p role="alert" className="text-[11px] text-destructive">
          {listError}
        </p>
      )}
    </div>
  );
}

function DetailRow<T extends EditableDetail>({
  field,
  index,
  errors,
  copy,
  onPatch,
  onRemove,
}: {
  field: T;
  index: number;
  errors?: Record<string, string>;
  copy: EditorCopy;
  onPatch: (change: Partial<T>) => void;
  onRemove: () => void;
}) {
  const id = React.useId();
  const name = field.label.trim() || t('paymentMethods.proofFieldUnnamed');
  // A SHOWN detail carries the broker's value; a question carries `required`.
  const shown = field.value !== undefined;
  const rowErrors = ['id', 'label', 'labelAr', 'type', 'value', 'hint', 'hintAr']
    .map((prop) => errors?.[`${copy.errorPrefix}.${index}.${prop}`])
    .filter((message): message is string => Boolean(message));
  const setValue = (value: string) => onPatch({ value } as Partial<T>);

  return (
    <SortableRow
      as="li"
      id={field.id}
      handleLabel={t('paymentMethods.proofFieldReorder', { name })}
      className="rounded-md border border-border bg-card p-2.5"
    >
      <div className="min-w-0 flex-1 space-y-2">
        <div className="grid gap-2 sm:grid-cols-[1fr_11rem]">
          <Input
            value={field.label}
            onChange={(e) => onPatch({ label: e.target.value } as Partial<T>)}
            aria-label={t('paymentMethods.proofFieldLabel')}
            placeholder={t(copy.labelPlaceholder)}
            maxLength={60}
            required
            className="text-xs"
          />
          <Select
            value={field.type}
            onValueChange={(value) => onPatch({ type: value as T['type'] } as Partial<T>)}
          >
            <SelectTrigger className="h-9 text-xs" aria-label={t('paymentMethods.proofFieldType')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="text" className="text-xs">
                {t('paymentMethods.proofFieldTypeText')}
              </SelectItem>
              <SelectItem value="phone" className="text-xs">
                {t('paymentMethods.proofFieldTypePhone')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        {/*
          The value the client reads and copies. A phone goes through the same
          picker the client uses, and the API stores it as E.164.
        */}
        {shown &&
          (field.type === 'phone' ? (
            <PhoneInput
              value={field.value}
              onChange={setValue}
              aria-label={t('paymentMethods.payToFieldValue')}
            />
          ) : (
            <Input
              value={field.value}
              onChange={(e) => setValue(e.target.value)}
              aria-label={t('paymentMethods.payToFieldValue')}
              placeholder={t('paymentMethods.payToFieldValuePlaceholder')}
              maxLength={120}
              required
              className="font-mono text-xs"
            />
          ))}
        {/*
          The Arabic twins sit straight under their English, compact like the
          rest of the row; the one helper line is in the editor's header. Kept
          as typed — the save trims and sends a blank one as null.
        */}
        <Input
          value={field.labelAr ?? ''}
          onChange={(e) =>
            onPatch({ labelAr: e.target.value === '' ? null : e.target.value } as Partial<T>)
          }
          aria-label={t('arabic.label')}
          placeholder={t('arabic.label')}
          maxLength={60}
          dir="rtl"
          lang="ar"
          className="text-right text-xs"
        />
        <Input
          value={field.hint ?? ''}
          onChange={(e) =>
            onPatch({ hint: e.target.value === '' ? null : e.target.value } as Partial<T>)
          }
          aria-label={t('paymentMethods.proofFieldHintLabel')}
          placeholder={t('paymentMethods.proofFieldHintPlaceholder')}
          maxLength={160}
          className="text-xs"
        />
        <Input
          value={field.hintAr ?? ''}
          onChange={(e) =>
            onPatch({ hintAr: e.target.value === '' ? null : e.target.value } as Partial<T>)
          }
          aria-label={t('arabic.hint')}
          placeholder={t('arabic.hint')}
          maxLength={160}
          dir="rtl"
          lang="ar"
          className="text-right text-xs"
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {!shown && (
            <label htmlFor={`${id}-required`} className="flex items-center gap-1.5 text-[11px]">
              <Checkbox
                id={`${id}-required`}
                checked={field.required ?? false}
                onCheckedChange={(value) => onPatch({ required: value === true } as Partial<T>)}
              />
              {t('paymentMethods.proofFieldRequired')}
            </label>
          )}
          <label htmlFor={`${id}-enabled`} className="flex items-center gap-1.5 text-[11px]">
            <Checkbox
              id={`${id}-enabled`}
              checked={field.enabled}
              onCheckedChange={(value) => onPatch({ enabled: value === true } as Partial<T>)}
            />
            {t('paymentMethods.proofFieldShown')}
          </label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            aria-label={t('paymentMethods.proofFieldRemove', { name })}
            className="ms-auto h-7 px-2 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
        {rowErrors.map((message) => (
          <p key={message} role="alert" className="text-[11px] text-destructive">
            {message}
          </p>
        ))}
      </div>
    </SortableRow>
  );
}
