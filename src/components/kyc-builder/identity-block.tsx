'use client';

import { Fingerprint, Trash2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { t } from '@/lib/i18n';
import type { KycFieldConfig } from './field-editor';

/**
 * One of the client's IDENTITY details on Personal Information (Phase 2, 29 Sep
 * 2026 — the owner's "everything customizable").
 *
 * The broker decides where it sits (it is a row of the step's list like any
 * question), whether it is required, and whether it is asked at all — sign-up
 * already holds the core details. What the platform keeps is its name and
 * meaning: there is no label or type to edit, so a detail can never become a
 * box that only looks like it.
 */
export function IdentityRow({
  field,
  onRequiredChange,
  onRemove,
}: {
  field: KycFieldConfig;
  onRequiredChange: (required: boolean) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/60 px-3.5 py-2.5">
      <span className="flex items-center gap-2 text-xs font-medium text-foreground">
        <Fingerprint className="h-3.5 w-3.5 text-link" aria-hidden="true" />
        {field.label}
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-link">
          {t('builder.identityBadge')}
        </span>
      </span>
      <div className="flex items-center gap-3">
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox
            checked={field.required}
            onCheckedChange={(checked) => onRequiredChange(checked === true)}
            aria-label={t('builder.identityRequiredNamed', { label: field.label })}
          />
          <span className="text-[11px] font-medium">{t('builder.requiredField')}</span>
        </label>
        <button
          type="button"
          onClick={onRemove}
          className="focus-outline flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          aria-label={t('builder.removeIdentityNamed', { label: field.label })}
          title={t('builder.removeIdentity')}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/**
 * Ask for an identity detail the form does not ask for yet — any of the
 * platform's, each once. Nothing to offer when all of them are placed.
 */
export function AddIdentityDetail({
  missing,
  onAdd,
}: {
  missing: readonly KycFieldConfig[];
  onAdd: (field: KycFieldConfig) => void;
}) {
  if (missing.length === 0) return null;
  return (
    <Select
      value=""
      onValueChange={(name) => {
        const field = missing.find((candidate) => candidate.name === name);
        if (field) onAdd(field);
      }}
    >
      <SelectTrigger className="h-8 w-auto gap-1.5 text-xs" aria-label={t('builder.addIdentity')}>
        <SelectValue placeholder={t('builder.addIdentity')} />
      </SelectTrigger>
      <SelectContent>
        {missing.map((field) => (
          <SelectItem key={field.name} value={field.name}>
            {field.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
