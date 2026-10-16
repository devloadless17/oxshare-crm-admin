'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { t } from '@/lib/i18n';

/** What the API takes: a positive decimal with at most 8 places — a string, never a number. */
const AMOUNT = /^\d{1,20}(\.\d{1,8})?$/;

/**
 * An AMOUNT RANGE, inclusive (backend `?amountMin&amountMax`, audit R4-G3). Applied on Enter or
 * when the box is left, never per keystroke; a value the API would refuse is not sent and the box
 * says so. The amounts stay strings end to end (§6.1). The parent KEYS it by the URL's values, so
 * a Clear or a pasted link resets the boxes without copying props into state.
 */
export function AmountRangeFilter({
  min,
  max,
  onChange,
}: {
  min: string;
  max: string;
  onChange: (patch: { amountMin?: string; amountMax?: string }) => void;
}) {
  const [low, setLow] = useState(min);
  const [high, setHigh] = useState(max);

  const valid = (value: string) => value.trim() === '' || AMOUNT.test(value.trim());
  const apply = () => {
    if (!valid(low) || !valid(high)) return;
    onChange({ amountMin: low.trim() || undefined, amountMax: high.trim() || undefined });
  };
  const box = (value: string, set: (v: string) => void, label: string, placeholder: string) => (
    <Input
      value={value}
      onChange={(event) => set(event.target.value)}
      onBlur={apply}
      onKeyDown={(event) => {
        if (event.key === 'Enter') apply();
      }}
      inputMode="decimal"
      aria-label={label}
      aria-invalid={!valid(value)}
      placeholder={placeholder}
      className={`h-9 w-28 tabular ${valid(value) ? '' : 'border-destructive'}`}
    />
  );

  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={t('financial.amountRange')}>
      {box(low, setLow, t('financial.amountMin'), t('financial.amountMinPlaceholder'))}
      <span className="text-muted-foreground" aria-hidden="true">
        –
      </span>
      {box(high, setHigh, t('financial.amountMax'), t('financial.amountMaxPlaceholder'))}
    </div>
  );
}
