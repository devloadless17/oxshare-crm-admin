'use client';

import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import { t } from '@/lib/i18n';

/*
 * A UUID an operator can actually use.
 *
 * There is no short human-friendly client number in the schema — the only
 * identifier is the 36-character `users.id`. Rendered whole it dominates any
 * table cell while carrying no meaning a human can compare, so the default is
 * the first 8 characters (unique in practice at this scale, and enough to
 * eyeball two rows apart) with the FULL value on the copy button and in the
 * title. `full` is for detail screens, where space allows the real thing.
 */
export function CopyableId({ value, full = false }: { value: string; full?: boolean }) {
  const [copied, setCopied] = React.useState(false);
  /*
   * The copied-flash timer, cleared on unmount. A bare `setTimeout` here fires
   * `setCopied(false)` after the component may be gone — in jsdom that is a
   * `ReferenceError: window is not defined` blamed on an unrelated test. Same
   * fix as `rival-settings-panel.tsx`.
   */
  const flashTimer = React.useRef<number | null>(null);
  React.useEffect(
    () => () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    },
    [],
  );

  const [failed, setFailed] = React.useState(false);

  /*
   * A copy that fails must SAY so.
   *
   * `navigator.clipboard` is undefined over plain HTTP (a synchronous
   * TypeError, not a rejection) and the promise rejects when the permission is
   * denied — so an unguarded call leaves the button looking exactly as it did
   * before the click. The operator believes the id is on their clipboard and
   * pastes the previous contents into a support ticket. The client portal has
   * treated this as a hazard in four places since it shipped; this is the same
   * rule on the console.
   */
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setFailed(false);
      setCopied(true);
      flashTimer.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
      setFailed(true);
    }
  };

  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <code
        className={`font-mono text-xs text-muted-foreground ${full ? 'break-all' : 'whitespace-nowrap'}`}
        title={value}
      >
        {full ? value : value.slice(0, 8)}
      </code>
      <button
        type="button"
        aria-label={t('common.copyId')}
        title={t('common.copyId')}
        className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground focus-outline"
        onClick={(event) => {
          // Never let the copy click reach a row-level affordance beneath it.
          event.stopPropagation();
          void copy();
        }}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
        ) : (
          <Copy className={`h-3.5 w-3.5 ${failed ? 'text-destructive' : ''}`} aria-hidden="true" />
        )}
      </button>
      {failed && (
        <span role="alert" className="text-[11px] text-destructive">
          {t('common.copyFailed')}
        </span>
      )}
    </span>
  );
}
