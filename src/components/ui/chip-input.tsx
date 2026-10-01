'use client';

import { useId, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export interface ChipOption {
  value: string;
  label: string;
  /** Other names that also find it ("UAE"), matched like the label. */
  aliases?: readonly string[];
}

/** How many suggestions are rendered at once — the search narrows the rest. */
const MAX_SUGGESTIONS = 50;

const fold = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').trim().toLowerCase();

/**
 * A list of chosen values shown as removable chips ("× Egypt") — the console's
 * one control for choosing SEVERAL values, from a known list or typed freely.
 *
 *  - `options` given: PICK mode. Typing searches the list; Enter or a click adds
 *    the highlighted match. Nothing off the list can be added, so a typo never
 *    becomes a value.
 *  - no `options`: FREE mode. Enter (or a comma) adds what was typed.
 *
 * Either way, pasting "Egypt, Lebanon, Iraq" adds each one — the comma habit
 * still works — and Backspace in the empty box removes the last chip. The
 * input is a combobox with a listbox of options, so a keyboard and a screen
 * reader drive it like the native control it replaces.
 */
export function ChipInput({
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
  id,
  disabled = false,
  invalid = false,
  maxLength = 200,
  collapseAfter,
}: {
  value: readonly string[];
  onChange: (next: string[]) => void;
  options?: readonly ChipOption[];
  placeholder?: string;
  ariaLabel: string;
  id?: string;
  disabled?: boolean;
  invalid?: boolean;
  /** Free mode: the longest value accepted. */
  maxLength?: number;
  /** Show this many chips, then "+N more" — a long list stays one glance. */
  collapseAfter?: number;
}) {
  const { t } = useTranslation();
  const generated = useId();
  const inputId = id ?? `${generated}-input`;
  const listId = `${generated}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  // What was just added — said aloud, since a collapsed list may hide the new chips.
  const [added, setAdded] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const hidden =
    collapseAfter !== undefined && !expanded ? Math.max(value.length - collapseAfter, 0) : 0;
  const shown = hidden > 0 ? value.slice(0, collapseAfter) : value;

  const pick = options !== undefined;
  const labelOf = useMemo(() => new Map((options ?? []).map((o) => [o.value, o.label])), [options]);
  const byFolded = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of options ?? []) {
      map.set(fold(o.label), o.value);
      for (const alias of o.aliases ?? []) map.set(fold(alias), o.value);
    }
    return map;
  }, [options]);

  /** A typed name: exact (or an alias), else the ONE option that starts with it. */
  const resolve = (text: string): string | undefined => {
    const q = fold(text);
    const exact = byFolded.get(q);
    if (exact !== undefined || q === '') return exact;
    const starts = (options ?? []).filter((o) => fold(o.label).startsWith(q));
    return starts.length === 1 ? starts[0]?.value : undefined;
  };

  const suggestions = useMemo(() => {
    if (!pick) return [];
    const q = fold(query);
    const chosen = new Set(value);
    return (options ?? [])
      .filter(
        (o) =>
          !chosen.has(o.value) &&
          (q === '' ||
            fold(o.label).includes(q) ||
            (o.aliases ?? []).some((alias) => fold(alias).startsWith(q))),
      )
      .slice(0, MAX_SUGGESTIONS);
  }, [pick, options, query, value]);

  /** Add typed or pasted entries; returns what could not be added. */
  const addMany = (entries: string[]) => {
    const next = [...value];
    const missing: string[] = [];
    const repeated: string[] = [];
    for (const raw of entries) {
      const text = raw.trim();
      if (text === '') continue;
      const resolved = pick ? resolve(text) : text.slice(0, maxLength);
      if (resolved === undefined) {
        missing.push(text);
        continue;
      }
      if (next.some((v) => (pick ? v === resolved : fold(v) === fold(resolved)))) {
        repeated.push(pick ? (labelOf.get(resolved) ?? resolved) : resolved);
        continue;
      }
      next.push(resolved);
    }
    if (next.length !== value.length) onChange(next);
    const fresh = next.slice(value.length).map((v) => (pick ? (labelOf.get(v) ?? v) : v));
    setAdded(fresh.length > 0 ? t('chipInput.added', { items: fresh.join(', ') }) : null);
    setNotice(
      missing.length > 0
        ? t('chipInput.notFound', { items: missing.join(', ') })
        : repeated.length > 0
          ? t('chipInput.duplicate', { items: repeated.join(', ') })
          : null,
    );
  };

  const addValue = (v: string) => {
    if (!value.includes(v)) onChange([...value, v]);
    setAdded(t('chipInput.added', { items: labelOf.get(v) ?? v }));
    setQuery('');
    setActive(0);
    setNotice(null);
    // Closed once a value is added, so the list never sits over the page's Save.
    setOpen(false);
    inputRef.current?.focus();
  };

  const remove = (v: string) => {
    onChange(value.filter((item) => item !== v));
    inputRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && pick) {
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, Math.max(suggestions.length - 1, 0)));
    } else if (event.key === 'ArrowUp' && pick) {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      if (pick) {
        // A typed list ("syria, lebanon, uae") adds each; one term takes the highlight.
        if (/[,;]/.test(query) || event.key === ',') {
          addMany(query.split(/[,;]/));
          setQuery('');
        } else {
          const choice = suggestions[active];
          if (choice && query.trim() !== '') addValue(choice.value);
          else if (query.trim() !== '') addMany([query]);
        }
      } else if (query.trim() !== '') {
        addMany([query]);
        setQuery('');
      }
    } else if (event.key === 'Backspace' && query === '') {
      const last = value.at(-1);
      if (last !== undefined) remove(last);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData('text');
    if (!/[,\n;]/.test(text)) return;
    event.preventDefault();
    addMany(text.split(/[,\n;]/));
    setQuery('');
  };

  const showList = pick && open && !disabled;
  const activeId = showList && suggestions[active] ? `${listId}-${active}` : undefined;

  return (
    <div className="relative">
      <div
        className={cn(
          'flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 text-sm focus-within:ring-2 focus-within:ring-ring',
          invalid ? 'border-destructive' : 'border-input',
          disabled && 'cursor-not-allowed opacity-60',
        )}
        onClick={() => {
          inputRef.current?.focus();
          setOpen(true);
        }}
      >
        {shown.map((v) => {
          const label = labelOf.get(v) ?? v;
          return (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium"
            >
              {label}
              {!disabled && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    remove(v);
                  }}
                  aria-label={t('chipInput.remove', { label })}
                  className="cursor-pointer rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground focus-outline"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              )}
            </span>
          );
        })}
        {hidden > 0 && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setExpanded(true);
            }}
            className="cursor-pointer rounded-full border border-dashed border-border px-2 py-0.5 text-xs font-medium text-link hover:bg-muted focus-outline"
          >
            {t('chipInput.showMore', { count: hidden })}
          </button>
        )}
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={showList}
          aria-controls={pick ? listId : undefined}
          aria-activedescendant={activeId}
          aria-autocomplete={pick ? 'list' : undefined}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          value={query}
          placeholder={value.length === 0 ? placeholder : undefined}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onBlur={() => {
            setOpen(false);
            // Free mode: what was typed but not yet added is added on leaving.
            if (!pick && query.trim() !== '') {
              addMany([query]);
              setQuery('');
            }
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          className="min-w-[8rem] flex-1 bg-transparent py-0.5 outline-none placeholder:text-muted-foreground"
        />
      </div>
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-popover p-1 text-sm shadow-md"
        >
          {suggestions.length === 0 ? (
            <li className="px-2 py-1.5 text-muted-foreground" role="presentation">
              {t('chipInput.noMatch', { query })}
            </li>
          ) : (
            suggestions.map((option, index) => (
              <li
                key={option.value}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                // Chosen before the input's blur closes the list.
                onMouseDown={(event) => {
                  event.preventDefault();
                  addValue(option.value);
                }}
                onMouseEnter={() => setActive(index)}
                className={cn(
                  'cursor-pointer rounded px-2 py-1.5',
                  index === active ? 'bg-muted' : 'hover:bg-muted',
                )}
              >
                {option.label}
              </li>
            ))
          )}
        </ul>
      )}
      {(expanded || (value.length > 1 && !disabled)) && (
        <div className="mt-1 flex justify-end gap-3 text-xs">
          {expanded && collapseAfter !== undefined && value.length > collapseAfter && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="cursor-pointer text-link hover:underline focus-outline"
            >
              {t('chipInput.showLess')}
            </button>
          )}
          {!disabled && value.length > 1 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="cursor-pointer text-muted-foreground hover:text-destructive hover:underline focus-outline"
            >
              {t('chipInput.clearAll')}
            </button>
          )}
        </div>
      )}
      {added && !notice && (
        <p className="mt-1 text-xs text-success" role="status">
          {added}
        </p>
      )}
      {notice && (
        <p className="mt-1 text-xs text-destructive" role="status">
          {notice}
        </p>
      )}
      {!pick && !disabled && (
        <p className="mt-1 text-xs text-muted-foreground">{t('chipInput.addHint')}</p>
      )}
    </div>
  );
}
