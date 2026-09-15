'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A search box over a URL parameter, that an operator can actually TYPE in.
 *
 * ## The bug this exists to stop repeating, twice now
 *
 * The obvious wiring is to control the input from the URL:
 *
 *     value={url.get('q')}
 *     onChange={(e) => url.set({ q: e.target.value })}
 *
 * It is wrong, and it fails in a way that reads as a broken keyboard rather
 * than as a broken screen. `url.set` does a `router.replace`, which is a round
 * trip through the Next router and is ASYNCHRONOUS — so between the keypress and
 * the re-render the input still holds the PREVIOUS value. React re-applies that
 * stale value to a controlled input and the character is gone. Typing at any
 * speed loses characters, the caret jumps to the end of whatever survived, and
 * the term that reaches the API is some subset of what was typed.
 *
 * `/clients` hit this, diagnosed it, and fixed it with local state — and then
 * five more boxes were added straight from the broken pattern (`/wallets`,
 * `/trading-accounts`, `/ledger`, `/commissions`, `/audit-log`). The owner
 * reported it the same way both times: *"I am not able to type normally in the
 * search input."*
 *
 * A fix that lives in one screen's private component is a fix the next screen
 * copies around. This is that component, extracted, so there is one search box
 * in the console and it is the one that works.
 *
 * ## How it works
 *
 * The input is controlled by LOCAL state, which is what makes typing smooth, and
 * the URL is written on a debounce. The URL stays the source of truth for the
 * QUERY — the page reads `?q=` to build its request, which is what keeps a
 * filtered list linkable — it is simply no longer in the keystroke path.
 *
 * The first effect syncs the OTHER direction, for changes the operator did not
 * type: "clear filters", the Back button, a shared link. It compares against the
 * last value this component WROTE, so it never fights somebody mid-word.
 */
export function UrlSearchInput({
  value,
  onChange,
  label,
  placeholder,
  title,
  className = 'h-9 w-64 rounded-lg border border-input bg-card px-3 text-xs focus-outline',
  delayMs = 300,
}: {
  /** The current value of the URL parameter. */
  value: string;
  /** Called with the debounced term. Write the URL here, never on every key. */
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
  /** The `title` tooltip — used to say WHAT is matched. */
  title?: string;
  className?: string;
  delayMs?: number;
}) {
  const [text, setText] = useState(value);
  const written = useRef(value);

  useEffect(() => {
    // Only when the URL moved somewhere this box did not put it. Without the
    // guard every debounced write bounces back and re-sets the input.
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
    }, delayMs);
    return () => clearTimeout(timer);
    // `onChange` is a fresh closure on every render of the parent; including it
    // would restart the timer on each one and the debounce would never fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, delayMs]);

  return (
    <input
      type="search"
      value={text}
      onChange={(e) => setText(e.target.value)}
      aria-label={label}
      placeholder={placeholder}
      title={title}
      className={className}
    />
  );
}
