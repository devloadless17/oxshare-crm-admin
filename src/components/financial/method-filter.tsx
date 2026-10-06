'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, CreditCard } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SearchField } from '@/components/ui/search-field';
import { t } from '@/lib/i18n';

/** One method the filter offers — its permanent key and the desk's own name for it. */
export interface MethodOption {
  key: string;
  label: string;
  direction: 'deposit' | 'withdrawal';
}

/**
 * Filter movements by PAYMENT METHOD — several at once (the buyer: "a payment
 * method is the most important field in any transaction").
 *
 * The options are the methods themselves (deposit and withdrawal), named by
 * their INTERNAL label — what the desk reads on every row (backend 0161) — and
 * sent as their permanent keys, which a rename never breaks. A key is never
 * shown. Search narrows a long list; a method no longer offered to clients is
 * still listed, because its history is still real.
 */
export function MethodFilter({
  options,
  selected,
  onChange,
}: {
  options: MethodOption[];
  /** The selected keys, as the URL holds them. */
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const chosen = new Set(selected);
  const byKey = new Map(options.map((o) => [o.key, o]));
  const term = search.trim().toLowerCase();
  const groups = useMemo(() => {
    const visible = options.filter((o) => !term || o.label.toLowerCase().includes(term));
    return (['deposit', 'withdrawal'] as const)
      .map((direction) => ({ direction, items: visible.filter((o) => o.direction === direction) }))
      .filter((g) => g.items.length > 0);
  }, [options, term]);

  const label =
    selected.length === 0
      ? t('financial.methodAll')
      : selected.length === 1
        ? (byKey.get(selected[0] ?? '')?.label ?? t('financial.methodCount', { count: 1 }))
        : t('financial.methodCount', { count: selected.length });

  const toggle = (key: string, on: boolean) => {
    const next = new Set(chosen);
    if (on) next.add(key);
    else next.delete(key);
    onChange([...next]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        aria-label={t('financial.filterMethod')}
        className={`focus-outline inline-flex h-9 max-w-56 cursor-pointer items-center gap-2 rounded-lg border px-3 text-left text-sm active:!scale-100 ${
          selected.length ? 'border-primary/40 bg-primary/5' : 'border-input bg-card'
        }`}
      >
        <CreditCard className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="truncate">{label}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent
        className="w-72 max-w-[calc(100vw-2rem)] p-2 [--tw-enter-scale:1] [--tw-exit-scale:1]"
        align="start"
      >
        <SearchField
          value={search}
          onChange={setSearch}
          label={t('financial.methodSearch')}
          placeholder={t('financial.methodSearch')}
          className="w-full"
        />
        <div className="mt-2 max-h-72 overflow-y-auto">
          {groups.length === 0 && (
            <p className="px-2 py-3 text-sm text-muted-foreground">{t('financial.methodNone')}</p>
          )}
          {groups.map((group) => (
            <div key={group.direction} className="mb-1">
              <p className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.direction === 'deposit'
                  ? t('financial.methodGroupDeposit')
                  : t('financial.methodGroupWithdrawal')}
              </p>
              {group.items.map((option) => (
                <label
                  key={`${option.direction}:${option.key}`}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <Checkbox
                    checked={chosen.has(option.key)}
                    onCheckedChange={(checked) => toggle(option.key, checked === true)}
                  />
                  <span className="truncate">{option.label}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
        {selected.length > 0 && (
          <div className="mt-1 flex justify-end border-t border-border pt-2">
            <button
              type="button"
              onClick={() => onChange([])}
              className="focus-outline rounded-md px-2 py-1 text-xs font-medium hover:bg-muted"
            >
              {t('financial.methodClear')}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
