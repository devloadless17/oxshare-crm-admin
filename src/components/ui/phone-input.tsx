'use client';

import * as React from 'react';
import { parsePhoneNumberFromString } from 'libphonenumber-js/min';
import { Search, ChevronDown, Check } from 'lucide-react';
import * as Flags from 'country-flag-icons/react/3x2';
import { cn } from '@/lib/utils';
import { Input } from './input';
import { ALL_COUNTRIES, type CountryItem } from '@/lib/countries-data';
import { t } from '@/lib/i18n';

/**
 * THE PORTAL'S PHONE INPUT, on the admin side (owner, 26 Sep 2026).
 *
 * A country picker with the dial code, and the national number beside it —
 * ported from oxshare-crm-client's `components/ui/phone-input.tsx` so the desk
 * edits a number the way the client entered it, instead of typing `+961…` into
 * a bare text box. Behaviour changes belong in BOTH copies. The differences
 * here are the admin's field height (`h-10`, as every admin form) and a name on
 * the country button.
 */
export function CountryFlagIcon({
  code,
  className = 'inline-block h-3.5 w-5 rounded-sm object-cover',
}: {
  code: string;
  className?: string;
}) {
  const FlagComp = (Flags as Record<string, React.ComponentType<{ className?: string }>>)[
    code.toUpperCase()
  ];
  if (!FlagComp) return <span className="text-xs">{'\u{1F310}'}</span>;
  return <FlagComp className={className} />;
}

export interface PhoneInputProps {
  value?: string;
  onChange?: (fullPhoneNumber: string) => void;
  defaultCountryCode?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** The number field's id, so a `<label htmlFor>` names it. */
  id?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

/**
 * The country a stored number belongs to.
 *
 * Read from the NUMBER where it can be (`+1 202…` is the United States, `+1
 * 416…` Canada), which the dial code alone cannot say. Otherwise the LONGEST
 * code that fits (`+1684` is American Samoa, not `+1`), keeping the country
 * already chosen when it is one of them.
 */
function countryFor(value: string, current?: CountryItem): CountryItem | undefined {
  const region = parsePhoneNumberFromString(value)?.country;
  const byRegion = region ? ALL_COUNTRIES.find((c) => c.code === region) : undefined;
  if (byRegion && value.startsWith(byRegion.dialCode)) return byRegion;

  const fitting = ALL_COUNTRIES.filter((c) => value.startsWith(c.dialCode));
  const longest = Math.max(0, ...fitting.map((c) => c.dialCode.length));
  const best = fitting.filter((c) => c.dialCode.length === longest);
  return best.find((c) => c.code === current?.code) ?? best[0];
}

/**
 * The national part of `value`, once its country's code is taken off — shown
 * grouped the way it is read (`70 123 456`) when the server holds it in E.164.
 */
function nationalPartOf(value: string, country: CountryItem | undefined): string {
  if (!country) return value;
  const grouped = /^\+\d+$/.test(value)
    ? parsePhoneNumberFromString(value)?.formatInternational()
    : undefined;
  const shown = grouped?.startsWith(country.dialCode) ? grouped : value;
  return shown.slice(country.dialCode.length).trim();
}

/** A stored E.164 number, grouped for reading — `+961 70 123 456`. */
export function formatPhone(value: string | null | undefined): string {
  if (!value) return '';
  return parsePhoneNumberFromString(value)?.formatInternational() ?? value;
}

export function PhoneInput({
  value = '',
  onChange,
  defaultCountryCode = '+961',
  placeholder = '70 123 456',
  disabled = false,
  className,
  id,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: PhoneInputProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');

  const matchedCountry = countryFor(value);
  const FALLBACK_COUNTRY: CountryItem = {
    name: 'United States',
    code: 'US',
    dialCode: '+1',
    flag: '🇺🇸',
  };
  const [selectedCountry, setSelectedCountry] = React.useState<CountryItem>(
    matchedCountry ??
      ALL_COUNTRIES.find((c) => c.dialCode === defaultCountryCode) ??
      ALL_COUNTRIES[0] ??
      FALLBACK_COUNTRY,
  );

  const [nationalNumber, setNationalNumber] = React.useState(() =>
    nationalPartOf(value, matchedCountry),
  );

  /*
   * A value set from OUTSIDE is followed — unless it is this component's own
   * echo of what was just typed, which must not re-derive anything under the
   * cursor. Adjusted during render, React's pattern for state following a prop.
   */
  const [seenValue, setSeenValue] = React.useState(value);
  if (value !== seenValue) {
    setSeenValue(value);
    const echo = selectedCountry.dialCode + (nationalNumber ? ` ${nationalNumber}` : '');
    if (value !== echo) {
      const country = countryFor(value, selectedCountry);
      if (country) setSelectedCountry(country);
      setNationalNumber(nationalPartOf(value, country));
    }
  }

  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectCountry = (country: CountryItem) => {
    setSelectedCountry(country);
    setOpen(false);
    setSearch('');
    onChange?.(country.dialCode + (nationalNumber ? ` ${nationalNumber}` : ''));
  };

  /*
   * A WHOLE international number — pasted from a contact card or typed with its
   * `+` (or `00`) — is read as one: its country is chosen from it and the rest
   * kept as the national part. Stripped to digits behind the chosen dial code
   * instead, `+961 70 123 456` became `+961 96170123456`, which the server
   * rightly refuses (found by the admin e2e, 29 Sep 2026). While the `+` is
   * still being typed and no dial code fits yet, it is kept on screen.
   */
  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const typed = raw.trimStart();
    const international = typed.startsWith('+')
      ? typed
      : typed.startsWith('00')
        ? `+${typed.slice(2)}`
        : undefined;
    if (international !== undefined) {
      const compact = `+${international.replace(/\D/g, '')}`;
      const country = compact.length > 1 ? countryFor(compact, selectedCountry) : undefined;
      if (!country) {
        setNationalNumber(compact);
        return;
      }
      const national = nationalPartOf(compact, country).replace(/[^\d\s-]/g, '');
      setSelectedCountry(country);
      setNationalNumber(national);
      onChange?.(country.dialCode + (national ? ` ${national}` : ''));
      return;
    }
    const cleaned = raw.replace(/[^\d\s-]/g, '');
    setNationalNumber(cleaned);
    onChange?.(selectedCountry.dialCode + (cleaned ? ` ${cleaned}` : ''));
  };

  const filteredCountries = ALL_COUNTRIES.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase().trim();
    return (
      c.name.toLowerCase().includes(q) || c.dialCode.includes(q) || c.code.toLowerCase().includes(q)
    );
  });

  return (
    <div className={cn('relative flex items-center gap-2', className)} ref={dropdownRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        aria-label={t('phone.countryCode', {
          country: selectedCountry.name,
          dialCode: selectedCountry.dialCode,
        })}
        aria-expanded={open}
        className="flex h-10 min-w-[92px] cursor-pointer items-center justify-between gap-1.5 rounded-lg border border-input bg-card px-2.5 py-1.5 text-xs font-semibold ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="flex items-center gap-2 truncate">
          <CountryFlagIcon code={selectedCountry.code} />
          <span className="font-medium text-foreground">{selectedCountry.dialCode}</span>
        </span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>

      <Input
        id={id}
        type="tel"
        value={nationalNumber}
        onChange={handleNumberChange}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        className="h-10 flex-1 font-mono text-xs aria-[invalid=true]:border-destructive"
      />

      {open && (
        <div className="absolute left-0 top-12 z-50 w-72 rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-2xl">
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('country.searchPlaceholder')}
              aria-label={t('country.searchPlaceholder')}
              className="h-8 w-full rounded-md border border-input bg-muted/40 pl-8 pr-3 text-xs focus:bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="max-h-60 space-y-0.5 overflow-y-auto">
            {filteredCountries.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">
                {t('country.noneFound')}
              </div>
            ) : (
              filteredCountries.map((c) => {
                const isSelected =
                  selectedCountry.code === c.code && selectedCountry.dialCode === c.dialCode;
                return (
                  <button
                    key={`${c.code}-${c.dialCode}`}
                    type="button"
                    onClick={() => handleSelectCountry(c)}
                    className={cn(
                      'focus-outline flex w-full cursor-pointer items-center justify-between rounded-md px-2.5 py-2 text-left text-xs hover:bg-accent hover:text-accent-foreground',
                      isSelected && 'bg-accent/80 font-semibold text-link',
                    )}
                  >
                    <span className="flex items-center gap-2 truncate pr-2">
                      <CountryFlagIcon code={c.code} />
                      <span className="truncate text-foreground">{c.name}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1 font-mono text-[11px] text-muted-foreground">
                      <span>{c.dialCode}</span>
                      {isSelected && <Check className="ml-1 h-3.5 w-3.5 text-link" />}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
