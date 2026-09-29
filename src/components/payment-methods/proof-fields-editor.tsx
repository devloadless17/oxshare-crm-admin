'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { PaymentMethodProofField } from '@/lib/api/admin';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SortableList, SortableRow } from '@/components/kyc-builder/sortable-row';
import { t } from '@/lib/i18n';

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
 * The details an OFFLINE method asks the client for with the receipt — the
 * phone the money was sent from, a transfer code — each named, typed, required
 * or optional, and shown or hidden (backend 0163).
 *
 * A HIDDEN detail is kept, not deleted: switching it back on restores it as it
 * was. Deleting one is safe too — every answer already filed carries the
 * question as it was asked. Refusals come back keyed `proofFields.<i>.<prop>`
 * and are shown under their row.
 */
export function ProofFieldsEditor({
  fields,
  onChange,
  errors,
}: {
  fields: PaymentMethodProofField[];
  onChange: (next: PaymentMethodProofField[]) => void;
  errors?: Record<string, string>;
}) {
  const patch = (id: string, change: Partial<PaymentMethodProofField>) =>
    onChange(fields.map((field) => (field.id === id ? { ...field, ...change } : field)));
  const listError = errors?.['proofFields'];

  const add = () =>
    onChange([
      ...fields,
      {
        id: newProofFieldId(),
        label: '',
        type: 'text',
        required: true,
        enabled: true,
        hint: null,
      },
    ]);

  return (
    <div className="space-y-2.5 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-0.5">
          <p className="text-xs font-semibold">{t('paymentMethods.proofFieldsTitle')}</p>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {t('paymentMethods.proofFieldsHint')}
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
          {t('paymentMethods.proofFieldAdd')}
        </Button>
      </div>

      {fields.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-3 text-center text-[11px] text-muted-foreground">
          {t('paymentMethods.proofFieldsEmpty')}
        </p>
      ) : (
        <SortableList items={fields} onReorder={onChange}>
          <ol className="space-y-2">
            {fields.map((field, index) => (
              <ProofFieldRow
                key={field.id}
                field={field}
                index={index}
                errors={errors}
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

function ProofFieldRow({
  field,
  index,
  errors,
  onPatch,
  onRemove,
}: {
  field: PaymentMethodProofField;
  index: number;
  errors?: Record<string, string>;
  onPatch: (change: Partial<PaymentMethodProofField>) => void;
  onRemove: () => void;
}) {
  const id = React.useId();
  const name = field.label.trim() || t('paymentMethods.proofFieldUnnamed');
  const rowErrors = ['id', 'label', 'type', 'hint']
    .map((prop) => errors?.[`proofFields.${index}.${prop}`])
    .filter((message): message is string => Boolean(message));

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
            onChange={(e) => onPatch({ label: e.target.value })}
            aria-label={t('paymentMethods.proofFieldLabel')}
            placeholder={t('paymentMethods.proofFieldLabelPlaceholder')}
            maxLength={60}
            required
            className="text-xs"
          />
          <Select
            value={field.type}
            onValueChange={(value) => onPatch({ type: value as PaymentMethodProofField['type'] })}
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
        <Input
          value={field.hint ?? ''}
          onChange={(e) => onPatch({ hint: e.target.value === '' ? null : e.target.value })}
          aria-label={t('paymentMethods.proofFieldHintLabel')}
          placeholder={t('paymentMethods.proofFieldHintPlaceholder')}
          maxLength={160}
          className="text-xs"
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <label htmlFor={`${id}-required`} className="flex items-center gap-1.5 text-[11px]">
            <Checkbox
              id={`${id}-required`}
              checked={field.required}
              onCheckedChange={(value) => onPatch({ required: value === true })}
            />
            {t('paymentMethods.proofFieldRequired')}
          </label>
          <label htmlFor={`${id}-enabled`} className="flex items-center gap-1.5 text-[11px]">
            <Checkbox
              id={`${id}-enabled`}
              checked={field.enabled}
              onCheckedChange={(value) => onPatch({ enabled: value === true })}
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
