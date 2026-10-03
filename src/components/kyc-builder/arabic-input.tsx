'use client';

import type { ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { t } from '@/lib/i18n';

/**
 * The Arabic twin of one of the builder's English inputs (0179).
 *
 * Optional, always: the English is the canonical value and the portal shows it
 * wherever the Arabic is blank. `dir="rtl"` + `lang="ar"` so the caret, the
 * alignment and a screen reader's voice are right for Arabic inside an English
 * console. The section it sits in carries ONE line saying blank shows the
 * English (`ArabicHelper`) rather than every box repeating it.
 *
 * `error` is the server's refusal of THIS property (`labelAr`, `titleAr` — see
 * `placeRefusals`), shown under the box it is about.
 */
export function ArabicInput({
  id,
  label,
  value,
  onChange,
  maxLength,
  error,
  className,
  labelClassName,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  error?: string;
  className?: string;
  labelClassName?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className={labelClassName} htmlFor={id}>
        {label}
      </Label>
      <Input
        id={id}
        dir="rtl"
        lang="ar"
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn('text-right', className)}
      />
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </div>
  );
}

/** The server's sentence under the input it refused. */
export function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className="text-[11px] font-medium text-destructive">
      {children}
    </p>
  );
}

/** The one line per Arabic block: blank shows the English. */
export function ArabicHelper({ className }: { className?: string }) {
  return (
    <p className={cn('text-[11px] text-muted-foreground', className)}>{t('arabic.fieldHint')}</p>
  );
}

/**
 * The PLATFORM's Arabic for something an operator cannot change — an identity
 * detail, a document, a built-in part — shown muted so they can see what an
 * Arabic reader is given. Nothing when there is none.
 */
export function FixedArabic({ value, className }: { value?: string | null; className?: string }) {
  if (!value || value.trim() === '') return null;
  return (
    <span
      dir="rtl"
      lang="ar"
      title={t('builder.arabicFixed')}
      className={cn('text-[11px] font-normal text-muted-foreground', className)}
    >
      {value}
    </span>
  );
}
