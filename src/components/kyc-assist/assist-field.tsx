'use client';

import { EyeOff } from 'lucide-react';
import type { KycAssistField } from '@/lib/api/admin';
import { PhoneInput } from '@/components/ui/phone-input';
import { t } from '@/lib/i18n';

const FIELD =
  'flex h-10 w-full rounded-lg border border-input bg-card px-3 text-xs focus-outline disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-destructive';

/** A multi-choice answer is stored as its choices joined by ", " — the server's own format. */
function ticked(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

/**
 * One typed question on the "Complete KYC" page, drawn by the TYPE the server
 * sent: text, date, phone, a list, a yes/no box or several choices. Values are
 * strings in the server's own formats (E.164 phone, `YYYY-MM-DD`, choices
 * joined by ", ", "true"/"false"), and the server judges every one of them —
 * this renders, it does not validate.
 *
 * A question this reader's role HIDES (RBAC-03) shows as hidden and cannot be
 * changed: its value never reached this page, so nothing could be written back.
 */
export function AssistFieldInput({
  id,
  field,
  value,
  error,
  disabled,
  onChange,
}: {
  id: string;
  field: KycAssistField;
  value: string;
  error?: string;
  disabled: boolean;
  onChange: (next: string) => void;
}) {
  const described = [error ? `${id}-error` : '', field.hint && !error ? `${id}-hint` : '']
    .filter(Boolean)
    .join(' ');
  const control = {
    id,
    disabled,
    'aria-invalid': Boolean(error),
    'aria-describedby': described || undefined,
    className: FIELD,
  };
  const options = field.options ?? [];

  const input = (() => {
    if (field.hidden) {
      return (
        <div className="flex h-10 items-center gap-1.5 rounded-lg border border-dashed border-input px-3 text-xs text-muted-foreground">
          <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
          {t('kycAssist.hidden')}
        </div>
      );
    }
    switch (field.type) {
      case 'phone':
        return (
          <PhoneInput
            id={id}
            value={value}
            // The picker emits the dial code alone while no number is typed: that is no phone.
            onChange={(next) => onChange(next.includes(' ') ? next : '')}
            disabled={disabled}
            aria-invalid={Boolean(error)}
            aria-describedby={control['aria-describedby']}
          />
        );
      case 'date':
        return (
          <input
            {...control}
            type="date"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        );
      case 'select':
        return (
          <select {...control} value={value} onChange={(e) => onChange(e.target.value)}>
            <option value="">{t('kycAssist.choose')}</option>
            {/* A saved value the list no longer holds stays visible, never silently replaced. */}
            {value && !options.includes(value) && <option value={value}>{value}</option>}
            {options.map((choice) => (
              <option key={choice} value={choice}>
                {choice}
              </option>
            ))}
          </select>
        );
      case 'checkbox':
        if (options.length > 0) {
          const chosen = new Set(ticked(value));
          return (
            <div
              role="group"
              aria-labelledby={`${id}-label`}
              aria-describedby={control['aria-describedby']}
              className="grid gap-1.5 sm:grid-cols-2"
            >
              {options.map((choice) => (
                <label key={choice} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={chosen.has(choice)}
                    onChange={(e) => {
                      const next = new Set(chosen);
                      if (e.target.checked) next.add(choice);
                      else next.delete(choice);
                      onChange(options.filter((option) => next.has(option)).join(', '));
                    }}
                    className="h-4 w-4 rounded border-input accent-primary"
                  />
                  {choice}
                </label>
              ))}
            </div>
          );
        }
        return (
          <label className="flex h-10 items-center gap-2 text-xs">
            <input
              id={id}
              type="checkbox"
              disabled={disabled}
              checked={value === 'true'}
              onChange={(e) => onChange(e.target.checked ? 'true' : 'false')}
              aria-describedby={control['aria-describedby']}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            {t('kycAssist.yes')}
          </label>
        );
      default:
        return (
          <input
            {...control}
            type="text"
            value={value}
            maxLength={1000}
            onChange={(e) => onChange(e.target.value)}
          />
        );
    }
  })();

  return (
    <div className="space-y-1.5">
      <label
        id={`${id}-label`}
        htmlFor={field.hidden || (field.type === 'checkbox' && options.length > 0) ? undefined : id}
        className="block text-xs font-semibold text-foreground"
      >
        {field.label}
        {field.required ? (
          <span className="text-destructive"> *</span>
        ) : (
          <span className="font-normal text-muted-foreground"> · {t('kycAssist.optional')}</span>
        )}
      </label>
      {input}
      {field.hint && !error && (
        <span id={`${id}-hint`} className="block text-[11px] text-muted-foreground">
          {field.hint}
        </span>
      )}
      {error && (
        <span
          id={`${id}-error`}
          role="alert"
          className="block text-[11px] font-medium text-destructive"
        >
          {error}
        </span>
      )}
    </div>
  );
}
