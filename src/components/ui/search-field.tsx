'use client';

import * as React from 'react';
import { Search, X } from 'lucide-react';
import { t } from '@/lib/i18n';

/**
 * THE search box: a magnifier, the text, and a real clear button.
 *
 * The clear control used to be the BROWSER's — the `✕` Chrome draws inside any
 * `type="search"` input. It is an 8px glyph with no hover state, no pointer cursor
 * and a hit area you have to aim for, and every browser draws it differently (Safari
 * a grey disc, Firefox nothing). The owner's report: it "feels not solid, not like any
 * world-class website". That native button is now hidden everywhere (`globals.css`),
 * and this one replaces it:
 *
 * - a 28px target with a visible hover, the same neutral hover as the sidebar's rows;
 * - it appears only while there is something to clear;
 * - clearing is INSTANT (`onClear`, no debounce wait) and keeps the caret in the box,
 *   so the operator can type the next term straight away;
 * - Escape clears too, as it did natively.
 */
export function SearchField({
  value,
  onChange,
  onClear,
  label,
  placeholder,
  title,
  className = 'w-64',
  inputClassName = 'text-xs',
}: {
  value: string;
  onChange: (value: string) => void;
  /** Called on the clear button and Escape. Defaults to `onChange('')`. */
  onClear?: () => void;
  label: string;
  placeholder: string;
  title?: string;
  /** Layout of the box (width, margins). */
  className?: string;
  /** Text size inside it. */
  inputClassName?: string;
}) {
  const input = React.useRef<HTMLInputElement>(null);
  const clear = () => {
    if (onClear) onClear();
    else onChange('');
    input.current?.focus();
  };

  return (
    <div className={`relative ${className}`}>
      <Search
        className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        ref={input}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.preventDefault();
            clear();
          }
        }}
        aria-label={label}
        placeholder={placeholder}
        title={title}
        className={`h-9 w-full rounded-lg border border-input bg-card ps-8 pe-9 focus-outline ${inputClassName}`}
      />
      {value ? (
        <button
          type="button"
          onClick={clear}
          aria-label={t('common.clearSearch')}
          title={t('common.clearSearch')}
          className="absolute end-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-outline"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
