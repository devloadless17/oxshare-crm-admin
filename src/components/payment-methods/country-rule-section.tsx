'use client';

import * as React from 'react';
import { Globe2 } from 'lucide-react';
import { adminApi, type OfferedCountries } from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { ChipInput } from '@/components/ui/chip-input';
import { COUNTRY_ALIASES } from '@/lib/country-aliases';
import { t, type MessageKey } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';

export type CountryRuleKind = 'allow' | 'deny' | null;

export interface CountryRuleValue {
  countryRule: CountryRuleKind;
  countryCodes: string[];
}

const CHOICES: { value: CountryRuleKind; label: MessageKey }[] = [
  { value: null, label: 'countryRule.everyone' },
  { value: 'allow', label: 'countryRule.allow' },
  { value: 'deny', label: 'countryRule.deny' },
];

/**
 * WHO CAN USE A METHOD, by country (backend 0178) — the deposit and withdrawal
 * dialogs share it. Three plain choices rather than a rule type to decode, and
 * the countries as chips picked from the real list.
 */
export function CountryRuleSection({
  value,
  onChange,
  error,
  disabled = false,
  bare = false,
}: {
  value: CountryRuleValue;
  onChange: (next: CountryRuleValue) => void;
  error?: string;
  disabled?: boolean;
  /** Inside a page section that already carries the title: no box, no legend. */
  bare?: boolean;
}) {
  const countries = useResource<OfferedCountries>(keys.countries.all(), (signal) =>
    adminApi.getCountries(signal),
  );
  const options = React.useMemo(
    () =>
      (countries.data?.world ?? []).map((c) => ({
        value: c.code,
        label: c.name,
        aliases: COUNTRY_ALIASES[c.code] ?? [],
      })),
    [countries.data],
  );
  const name = React.useId();

  return (
    <fieldset className={bare ? 'space-y-2' : 'space-y-2 rounded-lg border border-border p-3'}>
      <legend
        className={
          bare ? 'sr-only' : 'flex items-center gap-1.5 px-1 text-xs font-semibold text-foreground'
        }
      >
        <Globe2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        {t('countryRule.title')}
      </legend>
      <div role="radiogroup" aria-label={t('countryRule.title')} className="flex flex-wrap gap-2">
        {CHOICES.map((choice) => {
          const checked = value.countryRule === choice.value;
          return (
            <label
              key={choice.label}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs',
                checked ? 'border-ring bg-primary/10 font-semibold' : 'border-border',
                disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              <input
                type="radio"
                name={name}
                checked={checked}
                disabled={disabled}
                onChange={() =>
                  onChange({
                    countryRule: choice.value,
                    countryCodes: choice.value === null ? [] : value.countryCodes,
                  })
                }
                className="accent-primary"
              />
              {t(choice.label)}
            </label>
          );
        })}
      </div>
      {value.countryRule !== null && (
        <ChipInput
          value={value.countryCodes}
          onChange={(countryCodes) => onChange({ ...value, countryCodes })}
          options={options}
          collapseAfter={12}
          ariaLabel={t('countryRule.ariaLabel')}
          placeholder={t('countryRule.placeholder')}
          disabled={disabled || countries.status !== 'ready'}
          invalid={Boolean(error)}
        />
      )}
      {error ? (
        <p className="text-xs font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground">{t('countryRule.hint')}</p>
      )}
    </fieldset>
  );
}

/** "Only 3 countries" / "Not in 1 country" — the methods list's badge; null when unrestricted. */
export function countryRuleBadge(rule: CountryRuleKind | undefined, codes: readonly string[]) {
  if (!rule || codes.length === 0) return null;
  return t(rule === 'allow' ? 'countryRule.badgeAllow' : 'countryRule.badgeDeny', {
    count: codes.length,
  });
}
