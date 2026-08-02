'use client';

import * as React from 'react';
import { Search, ChevronDown, Check } from 'lucide-react';
import * as Flags from 'country-flag-icons/react/3x2';
import { cn } from '@/lib/utils';
import { Input } from './input';
import { ALL_COUNTRIES, type CountryItem } from '@/lib/countries-data';

export function CountryFlagIcon({ code, className = 'w-5 h-3.5 rounded-2xs object-cover inline-block shadow-2xs' }: { code: string; className?: string }) {
  const FlagComp = (Flags as Record<string, React.ComponentType<{ className?: string }>>)[code.toUpperCase()];
  if (!FlagComp) return <span className="text-xs">🌐</span>;
  return <FlagComp className={className} />;
}

export interface PhoneInputProps {
  value?: string;
  onChange?: (fullPhoneNumber: string) => void;
  defaultCountryCode?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function PhoneInput({
  value = '',
  onChange,
  defaultCountryCode = '+961',
  placeholder = '70 123 456',
  disabled = false,
  className,
}: PhoneInputProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  
  const matchedCountry = ALL_COUNTRIES.find((c) => value.startsWith(c.dialCode));
  const [selectedCountry, setSelectedCountry] = React.useState<CountryItem>(
    matchedCountry || ALL_COUNTRIES.find((c) => c.dialCode === defaultCountryCode) || ALL_COUNTRIES[0],
  );
  
  const [nationalNumber, setNationalNumber] = React.useState(() => {
    if (matchedCountry) {
      return value.slice(matchedCountry.dialCode.length).trim();
    }
    return value;
  });

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
    const full = country.dialCode + (nationalNumber ? ` ${nationalNumber}` : '');
    onChange?.(full);
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = e.target.value.replace(/[^\d\s-]/g, '');
    setNationalNumber(cleaned);
    const full = selectedCountry.dialCode + (cleaned ? ` ${cleaned}` : '');
    onChange?.(full);
  };

  const filteredCountries = ALL_COUNTRIES.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase().trim();
    return (
      c.name.toLowerCase().includes(q) ||
      c.dialCode.includes(q) ||
      c.code.toLowerCase().includes(q)
    );
  });

  return (
    <div className={cn('relative flex items-center gap-2', className)} ref={dropdownRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="flex h-10 items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 py-2 text-xs font-semibold ring-offset-background hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all cursor-pointer min-w-[115px]"
      >
        <span className="flex items-center gap-2 truncate">
          <CountryFlagIcon code={selectedCountry.code} />
          <span className="text-foreground font-medium">{selectedCountry.dialCode}</span>
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 opacity-50 transition-transform duration-200', open && 'rotate-180')} />
      </button>

      <Input
        type="tel"
        value={nationalNumber}
        onChange={handleNumberChange}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1 font-mono text-xs"
      />

      {open && (
        <div className="absolute top-12 left-0 z-50 w-72 rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl p-2 animate-in fade-in-0 zoom-in-95 duration-150">
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search country or code..."
              className="h-8 w-full rounded-md border border-input bg-muted/40 pl-8 pr-3 text-xs focus:bg-background focus:outline-none focus:ring-1 focus:ring-blue-600 transition-all"
            />
          </div>

          <div className="max-h-60 overflow-y-auto space-y-0.5 scrollbar-thin">
            {filteredCountries.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">No country found</div>
            ) : (
              filteredCountries.map((c) => {
                const isSelected = selectedCountry.code === c.code && selectedCountry.dialCode === c.dialCode;
                return (
                  <button
                    key={`${c.code}-${c.dialCode}`}
                    type="button"
                    onClick={() => handleSelectCountry(c)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-md px-2.5 py-2 text-xs transition-colors hover:bg-accent hover:text-accent-foreground text-left cursor-pointer',
                      isSelected && 'bg-accent/80 font-semibold text-blue-500',
                    )}
                  >
                    <span className="flex items-center gap-2 truncate pr-2">
                      <CountryFlagIcon code={c.code} />
                      <span className="text-foreground truncate">{c.name}</span>
                    </span>
                    <span className="flex items-center gap-1 shrink-0 font-mono text-[11px] text-muted-foreground">
                      <span>{c.dialCode}</span>
                      {isSelected && <Check className="h-3.5 w-3.5 text-blue-600 ml-1" />}
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
