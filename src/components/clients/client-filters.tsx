'use client';

import { X } from 'lucide-react';
import type { ClientTagWithCount } from '@/lib/api/admin';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { t } from '@/lib/i18n';

export interface ClientFilterValues {
  q: string;
  type: string;
  status: string;
  level: string;
  country: string;
  tag: string;
}

/**
 * The client list's filter bar.
 *
 * ── `hiddenFilters` ─────────────────────────────────────────────────────────
 *
 * A control for a field the viewer cannot see is a control that can only
 * produce confusion: it either does nothing visible (the column is gone) or it
 * quietly narrows a list on a value the operator has no way to read back. So a
 * masked field loses its filter alongside its column.
 *
 * ── Why the tag filter is chips rather than a dropdown ──────────────────────
 *
 * One click per tag, visible without opening anything, and direction-agnostic
 * by construction (`flex flex-wrap`) which matters for the Arabic locale
 * (D-16). A combobox would mean two new dependencies for a vocabulary of tens
 * of tags — ADM-14 is segmentation, not folksonomy. If it ever passes ~15 tags,
 * add a disclosure THEN.
 */
export function ClientFilters({
  values,
  tags,
  canViewTags,
  countries,
  hiddenFilters,
  isFiltered,
  onChange,
  onClear,
}: {
  values: ClientFilterValues;
  tags: readonly ClientTagWithCount[];
  canViewTags: boolean;
  countries: readonly string[];
  /** Catalog keys the viewer may not see — their filters are omitted. */
  hiddenFilters: readonly string[];
  isFiltered: boolean;
  onChange: (patch: Partial<ClientFilterValues>) => void;
  onClear: () => void;
}) {
  const hidden = (field: string) => hiddenFilters.includes(field);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={values.q}
          onChange={(e) => onChange({ q: e.target.value })}
          placeholder={t('clients.searchPlaceholder')}
          aria-label={t('clients.searchLabel')}
          className="h-9 w-full sm:w-72 rounded-lg border border-input bg-background px-3 text-sm focus-outline"
        />

        <FilterSelect
          value={values.type}
          onChange={(v) => onChange({ type: v })}
          placeholder={t('clients.allTypes')}
          options={[
            { value: 'individual', label: t('clients.typeIndividual') },
            { value: 'referral', label: t('clients.typeReferral') },
            { value: 'partner', label: t('clients.typePartner') },
          ]}
        />

        <FilterSelect
          value={values.status}
          onChange={(v) => onChange({ status: v })}
          placeholder={t('clients.allStatuses')}
          options={[
            { value: 'active', label: t('clients.statusActive') },
            { value: 'pending', label: t('clients.statusPending') },
            { value: 'suspended', label: t('clients.statusSuspended') },
          ]}
        />

        <FilterSelect
          value={values.level}
          onChange={(v) => onChange({ level: v })}
          placeholder={t('clients.allLevels')}
          options={[
            { value: '0', label: t('clients.levelUnverified') },
            { value: '1', label: t('clients.levelVerified') },
          ]}
        />

        {!hidden('client.country') && (
          <FilterSelect
            value={values.country}
            onChange={(v) => onChange({ country: v })}
            placeholder={t('clients.allCountries')}
            options={countries.map((c) => ({ value: c, label: c }))}
          />
        )}

        {isFiltered && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-muted-foreground hover:bg-muted focus-outline"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            {t('clients.clearFilters')}
          </button>
        )}
      </div>

      {canViewTags && !hidden('client.tags') && tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t('clients.tagFilterLabel')}
          </span>
          {tags.map((tag) => {
            const active = values.tag === tag.slug;
            return (
              <button
                key={tag.id}
                type="button"
                // A second click clears it. Only one tag at a time: the API
                // takes a single `?tag=`, because AND and OR are both plausible
                // readings of a multi-tag filter and shipping the wrong one
                // silently is worse than not shipping it (D-15).
                onClick={() => onChange({ tag: active ? '' : tag.slug })}
                aria-pressed={active}
                className={`focus-outline rounded-full ${active ? 'ring-2 ring-ring' : ''}`}
              >
                <Badge
                  variant="tag"
                  style={
                    tag.color ? { backgroundColor: `${tag.color}22`, color: tag.color } : undefined
                  }
                >
                  {tag.label}
                  <span className="text-[10px] opacity-70">{tag.clientCount}</span>
                </Badge>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** The four filters share a shape; the "all" option is what clears them. */
function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value || 'all'} onValueChange={(v) => onChange(v === 'all' ? '' : v)}>
      <SelectTrigger className="h-9 w-full sm:w-44">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{placeholder}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
