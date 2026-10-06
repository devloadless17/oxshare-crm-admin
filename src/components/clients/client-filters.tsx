'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { SearchField } from '@/components/ui/search-field';
import type { ClientTagWithCount } from '@/lib/api/admin';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { t } from '@/lib/i18n';

/** The derived client types, in the order the type filter offers them. */
const CLIENT_TYPES = ['individual', 'referral', 'partner'] as const;
type ClientType = (typeof CLIENT_TYPES)[number];

const TYPE_LABELS: Record<ClientType, string> = {
  individual: t('clients.typeIndividual'),
  referral: t('clients.typeReferral'),
  partner: t('clients.typePartner'),
};

/**
 * The filters this bar renders — and only those.
 *
 * `level`, `emailVerified` and `kycStatus` were removed from the type along
 * with their controls. Leaving them would describe a component that accepts
 * values it has no way to show or change, which is how a filter comes to be set
 * in the URL with nothing on screen admitting the list is filtered.
 *
 * The KYC labels that lived here went with them. They are still needed for the
 * COLUMN, and they live in `client-columns.tsx` where that column is built —
 * one copy, next to its only remaining use.
 */
export interface ClientFilterValues {
  q: string;
  type: string;
  status: string;
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
  types = CLIENT_TYPES,
}: {
  values: ClientFilterValues;
  tags: readonly ClientTagWithCount[];
  canViewTags: boolean;
  /** Catalog keys the viewer may not see — their filters are omitted. */
  hiddenFilters: readonly string[];
  isFiltered: boolean;
  onChange: (patch: Partial<ClientFilterValues>) => void;
  onClear: () => void;
  /**
   * The client types the type filter offers. The Referrals page drops
   * `individual`: a referred client is a referral or, since, a partner, so
   * that option could only ever answer "nobody".
   */
  types?: readonly ClientType[];
}) {
  const hidden = (field: string) => hiddenFilters.includes(field);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <SearchBox value={values.q} onChange={(q) => onChange({ q })} />

      <FilterSelect
        value={values.type}
        onChange={(v) => onChange({ type: v })}
        placeholder={t('clients.allTypes')}
        options={types.map((value) => ({ value, label: TYPE_LABELS[value] }))}
      />

      {/*
        The ACCOUNT state — whether this person may sign in.

        ⚠️ `pending` IS NOT OFFERED, and its absence is the point.

        It is a real value of the `user_status` enum and the API accepts it as a
        filter, so this is not a control the endpoint would refuse. It is worse:
        NO CODE PATH PRODUCES IT. Registration writes `active`
        (`auth.service.ts:207`), `setClientStatus` is typed `'active' |
        'suspended'` so there is no way in or out, and the only row that has ever
        held it was one seed fixture.

        Offering it gave an operator a segment that can never have members, and
        an empty result reads as a fact about CLIENTS — "nobody is pending" —
        when it is a fact about the PRODUCT: nobody can be. Those are different
        sentences and the screen could not tell them apart.

        The value is still READ from the URL by the page, exactly as `country`
        is: a link somebody bookmarked must still resolve to the segment it
        names, and dropping the parameter would silently widen a saved filter.
        This removes the OFFER, not the handling.

        If a real pending state is ever wired — registration writing it,
        verification promoting out of it — this option comes back with the
        transitions, not before.
      */}
      <FilterSelect
        value={values.status}
        onChange={(v) => onChange({ status: v })}
        placeholder={t('clients.allStatusesAccount')}
        options={[
          { value: 'active', label: t('clients.statusActive') },
          { value: 'suspended', label: t('clients.statusSuspended') },
        ]}
      />

      {/*
       * THREE FILTERS REMOVED at the operator's request: KYC status, email
       * verified, and verification LEVEL.
       *
       * The columns all remain — this bar narrows the list, it does not decide
       * what the list shows. What is gone is the ability to filter BY those
       * three, which had accumulated into three controls asking overlapping
       * versions of "how far through verification is this person": `level` is
       * 0/1 and cannot tell a rejected client from one who never applied,
       * `emailVerified` answers a different question than both, and `kycStatus`
       * answers it in six states.
       *
       * Account status stays, because it answers the one question this screen
       * is for: may this person sign in.
       *
       * The backend still accepts all three parameters, so a saved link
       * carrying `?kycStatus=` keeps working — it simply cannot be built from
       * the UI any more.
       */}
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
          // The business's tags, then the countries clients live in (0193) —
          // a country nobody lives in would only lengthen the list.
          options={[
            ...tags.filter((tag) => !tag.countryCode),
            ...tags.filter((tag) => tag.countryCode && tag.clientCount > 0),
          ].map((tag) => ({
            value: tag.slug,
            label: tag.countryCode
              ? `${t('tags.countryOption', { label: tag.label })} (${tag.clientCount})`
              : `${tag.label} (${tag.clientCount})`,
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
    <SearchField
      value={text}
      onChange={setText}
      // Clearing is not typing: the list follows at once, not after the debounce.
      onClear={() => {
        setText('');
        written.current = '';
        onChange('');
      }}
      placeholder={t('clients.searchPlaceholder')}
      label={t('clients.searchLabel')}
      className="w-full sm:w-72"
      inputClassName="text-sm"
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
