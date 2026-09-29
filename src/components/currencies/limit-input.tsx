'use client';

import Decimal from 'decimal.js';
import { formatDecimal } from '@/lib/money';
import { t } from '@/lib/i18n';

/** An amount as the API takes it: up to 20 digits, up to 8 decimals (§6.1). */
export const LIMIT_PATTERN = /^\d{1,20}(\.\d{1,8})?$/;

/**
 * A stored limit as the operator should edit it: `'5000000000.00000000'` →
 * `'5000000000'`. Through decimal.js, never a number — a float cannot hold the
 * twenty digits an LBP limit may need.
 */
export function plainAmount(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  try {
    return new Decimal(value).toFixed();
  } catch {
    return value;
  }
}

/**
 * One money limit — an amount in a CURRENCY's own units (0162).
 *
 * Beneath the box it reads the number back grouped (`5,000,000,000 LBP`): an LBP
 * limit is ten digits, and a zero too many or too few is the mistake this whole
 * feature exists to stop. The server's sentence for this field replaces that
 * line when there is one.
 */
export function LimitInput({
  id,
  label,
  value,
  onChange,
  currency,
  error,
  hint,
  required = false,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** The code the amount is in — shown after the read-back. */
  currency: string;
  error?: string;
  hint?: string;
  required?: boolean;
  placeholder?: string;
}) {
  const typed = value.trim();
  const malformed = typed !== '' && !LIMIT_PATTERN.test(typed);
  const describedBy = `${id}-note`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-semibold text-foreground">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[\s,]/g, ''))}
        inputMode="decimal"
        required={required}
        placeholder={placeholder}
        aria-invalid={Boolean(error) || malformed}
        aria-describedby={describedBy}
        className="flex h-10 w-full rounded-lg border border-input bg-card px-3 font-mono text-xs tabular focus-outline aria-invalid:border-destructive"
      />
      <p id={describedBy} className="text-[11px]">
        {error ? (
          <span role="alert" className="font-medium text-destructive">
            {error}
          </span>
        ) : malformed ? (
          <span className="font-medium text-destructive">{t('currencies.limitMalformed')}</span>
        ) : typed !== '' ? (
          <span className="text-muted-foreground">
            = {formatDecimal(typed)} {currency}
            {hint ? ` · ${hint}` : ''}
          </span>
        ) : (
          <span className="text-muted-foreground">{hint}</span>
        )}
      </p>
    </div>
  );
}
