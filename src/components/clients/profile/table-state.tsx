'use client';

import * as React from 'react';
import { SearchField } from '@/components/ui/search-field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDebounced } from '@/hooks/use-debounced';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, type PageSize } from '@/lib/page-param';

/*
 * The profile's tables keep their state LOCALLY — the page's own filters live in
 * the URL, and a tab's table is one of several on it. Shared by the referred
 * panels and the Accounts and Transactions tabs.
 */

/** The tables' own search box — the page's filters live in the URL; these are local. */
export function TableSearch({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  label: string;
  placeholder: string;
}) {
  return (
    <SearchField
      value={value}
      onChange={onChange}
      label={label}
      placeholder={placeholder}
      className="w-full sm:w-80"
    />
  );
}

/** Page, size, sort and search for one table — reset to page one on any change. */
export function useTableState<K extends string>(allowed: readonly K[]) {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [search, setSearch] = React.useState('');
  const [sort, setSort] = React.useState<{ key?: K; order: 'asc' | 'desc' }>({ order: 'desc' });
  const q = useDebounced(search.trim());

  return {
    page,
    pageSize,
    search,
    q,
    sort,
    setPage,
    setSearch: (next: string) => {
      setSearch(next);
      setPage(1);
    },
    // One of the pager's four sizes, whatever the control hands back.
    setPageSize: (size: number) => {
      setPageSize(PAGE_SIZES.find((allowed) => allowed === size) ?? DEFAULT_PAGE_SIZE);
      setPage(1);
    },
    // The page is dropped with the sort: reordering renumbers every page.
    setSort: (key: string | null, order: 'asc' | 'desc' | null) => {
      const known = allowed.find((candidate) => candidate === key);
      setSort({ key: known, order: order ?? 'desc' });
      setPage(1);
    },
  };
}

/**
 * One filter dropdown — "All …" plus the choices. `''` is "all", and is what the
 * caller leaves OUT of the request rather than sending blank.
 */
export function ChoiceFilter({
  label,
  allLabel,
  value,
  options,
  onChange,
}: {
  label: string;
  allLabel: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (next: string) => void;
}) {
  return (
    <Select value={value || 'all'} onValueChange={(next) => onChange(next === 'all' ? '' : next)}>
      <SelectTrigger className="h-9 w-full sm:w-44" aria-label={label}>
        <SelectValue placeholder={allLabel} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
