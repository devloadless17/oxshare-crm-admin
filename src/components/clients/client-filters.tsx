'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { ClientTagWithCount } from '@/lib/api/admin';
import { CLIENT_KYC_STATUSES } from '@/lib/api/admin';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { t } from '@/lib/i18n';
import type { MessageKey } from '@/lib/i18n/messages';

export interface ClientFilterValues {
  q: string;
  type: string;
  status: string;
  level: string;
  kycStatus: string;
  emailVerified: string;
  tag: string;
}

/** One label per KYC state, keyed off the API's own enum. */
const KYC_STATUS_LABELS: Record<(typeof CLIENT_KYC_STATUSES)[number], MessageKey> = {
  not_started: 'clients.kycNotStarted',
  in_progress: 'clients.kycInProgress',
  submitted: 'clients.kycSubmitted',
  under_review: 'clients.kycUnderReview',
  approved: 'clients.kycApproved',
  rejected: 'clients.kycRejected',
};

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
 * ── THREE THINGS A READER MIGHT CALL "STATUS" ───────────────────────────────
 *
 * `status` is the ACCOUNT state and only that — may this person sign in. It is
 * separate from `kycStatus`, the identity decision, and from `emailVerified`,
 * which is a self-service step the client can complete themselves. They are
 * three filters rather than one because they answer three different questions
 * and an operator acting on the wrong one acts on the wrong client.
 *
 * ── Why there is no COUNTRY filter ──────────────────────────────────────────
 *
 * Removed at the operator's request. It was built from the countries present in
 * the twenty-five rows ON SCREEN — `users.country` is free text written by the
 * KYC flow, so there was no vocabulary to offer — which meant the options
 * changed as you paged and a country you could see was often one you could not
 * filter by. The `country` COLUMN stays: reading where a client is from is
 * useful on its own, and `?country=` is still honoured for a link somebody
 * saved.
 */
export function ClientFilters({
  values,
  tags,
  canViewTags,
  hiddenFilters,
  isFiltered,
  onChange,
  onClear,
}: {
  values: ClientFilterValues;
  tags: readonly ClientTagWithCount[];
  canViewTags: boolean;
  /** Catalog keys the viewer may not see — their filters are omitted. */
  hiddenFilters: readonly string[];
  isFiltered: boolean;
  onChange: (patch: Partial<ClientFilterValues>) => void;
  onClear: () => void;
}) {
  const hidden = (field: string) => hiddenFilters.includes(field);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <SearchBox value={values.q} onChange={(q) => onChange({ q })} />

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

      {/* The ACCOUNT state — whether this person may sign in. */}
      <FilterSelect
        value={values.status}
        onChange={(v) => onChange({ status: v })}
        placeholder={t('clients.allStatusesAccount')}
        options={[
          { value: 'active', label: t('clients.statusActive') },
          { value: 'pending', label: t('clients.statusPending') },
          { value: 'suspended', label: t('clients.statusSuspended') },
        ]}
      />

      <FilterSelect
        value={values.kycStatus}
        onChange={(v) => onChange({ kycStatus: v })}
        placeholder={t('clients.allKycStatuses')}
        // Built from the API's own enum rather than a hand-written list, so a
        // state added on the backend appears here or fails to compile — it
        // never silently leaves a segment of clients unfindable.
        options={CLIENT_KYC_STATUSES.map((status) => ({
          value: status,
          label: t(KYC_STATUS_LABELS[status]),
        }))}
      />

      <FilterSelect
        value={values.emailVerified}
        onChange={(v) => onChange({ emailVerified: v })}
        placeholder={t('clients.allEmailVerified')}
        options={[
          { value: 'true', label: t('clients.emailVerifiedYes') },
          { value: 'false', label: t('clients.emailVerifiedNo') },
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

      {/*
       * A SELECT, at the operator's request — it was a row of toggle chips.
       *
       * Still ONE tag at a time, which the select now makes structural rather
       * than a convention: the API takes a single `?tag=`, because AND and OR
       * are both plausible readings of a multi-tag filter and shipping the
       * wrong one silently is worse than not shipping it (D-15). It filters by
       * SLUG, not id — a rename must not break a link somebody saved.
       */}
      {canViewTags && !hidden('client.tags') && tags.length > 0 && (
        <FilterSelect
          value={values.tag}
          onChange={(v) => onChange({ tag: v })}
          placeholder={t('clients.allTags')}
          options={tags.map((tag) => ({
            value: tag.slug,
            label: `${tag.label} (${tag.clientCount})`,
          }))}
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
  );
}

/**
 * The search box, and WHY IT KEEPS ITS OWN STATE.
 *
 * It used to be fully controlled by the URL: `value={values.q}` with every
 * keystroke calling `onChange`, which did a `router.replace`. That is a round
 * trip through the Next router before the character the operator just typed
 * comes back — and `router.replace` is asynchronous, so between the keypress
 * and the re-render the input is still showing the PREVIOUS value. React then
 * re-applies that stale value to a controlled input, and the character is gone.
 * Typing at any speed lost characters, the caret jumped to the end of whatever
 * did survive, and the term that eventually reached the API was some subset of
 * what was typed.
 *
 * So the input is controlled by LOCAL state, which is what makes typing smooth,
 * and the URL is written on a debounce. The URL remains the source of truth for
 * the QUERY — the page still reads `?q=` to build the request, which is what
 * keeps a filtered list linkable — but it is no longer in the keystroke path.
 *
 * The effect below syncs the other direction, for the cases where the URL
 * changes without the operator typing: "clear filters", the Back button, or
 * landing on a shared link. It compares against the last value this component
 * WROTE, so it never fights the operator mid-word.
 */
function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [text, setText] = useState(value);
  const written = useRef(value);

  useEffect(() => {
    // Only when the URL moved somewhere this box did not put it. Without the
    // guard, every debounced write bounces back and re-sets the input.
    if (value !== written.current) {
      written.current = value;
      setText(value);
    }
  }, [value]);

  useEffect(() => {
    if (text === written.current) return;
    const timer = setTimeout(() => {
      written.current = text;
      onChange(text);
    }, 300);
    return () => clearTimeout(timer);
    // `onChange` is a fresh closure on every render of the parent; including it
    // would restart the timer on each one and the debounce would never fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <input
      type="search"
      value={text}
      onChange={(e) => setText(e.target.value)}
      placeholder={t('clients.searchPlaceholder')}
      aria-label={t('clients.searchLabel')}
      className="h-9 w-full sm:w-72 rounded-lg border border-input bg-background px-3 text-sm focus-outline"
    />
  );
}

/** The filters share a shape; the "all" option is what clears them. */
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
      <SelectTrigger className="h-9 w-full sm:w-44" aria-label={placeholder}>
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
