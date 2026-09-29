'use client';

import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import { t } from '@/lib/i18n';

/*
 * Read-only rows and copy buttons for values an operator pastes somewhere else
 * — a webhook address, a key shown once. Moved here from the Rival settings
 * panel when the Rival connection became a payment provider (backend 0168).
 */

export function ReadonlyRow({
  label,
  value,
  copyable,
}: {
  label: string;
  value: string;
  copyable: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="shrink-0 font-semibold text-foreground">{label}</span>
      <span className="flex items-center gap-1.5 truncate text-muted-foreground">
        <span className="truncate font-mono">{value}</span>
        {copyable && <CopyButton value={value} />}
      </span>
    </div>
  );
}

export function CopyBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-foreground">{label}</p>
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1.5">
        <code className="flex-1 break-all text-xs text-foreground">{value}</code>
        <CopyButton value={value} />
      </div>
    </div>
  );
}

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  /*
   * The flash clears itself on a timer that must be CANCELLED on unmount: this
   * button lives inside a shown-once modal that is closed by hand, and a timer
   * firing into a torn-down jsdom surfaces as an unhandled error in whichever
   * test runs next (`flash-timer-census.test.ts`).
   */
  const flashTimer = React.useRef<number | null>(null);
  React.useEffect(
    () => () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    },
    [],
  );
  return (
    <button
      type="button"
      aria-label={t('providers.copy')}
      title={t('providers.copy')}
      className="rounded p-1 text-muted-foreground hover:text-foreground focus-outline"
      onClick={() => {
        // A silent failure (plain HTTP, denied permission) looks exactly like a
        // button nobody pressed — say so instead.
        void (async () => {
          try {
            await navigator.clipboard.writeText(value);
            setFailed(false);
            setCopied(true);
            flashTimer.current = window.setTimeout(() => setCopied(false), 1500);
          } catch {
            setCopied(false);
            setFailed(true);
          }
        })();
      }}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
      ) : (
        <Copy className={`h-3.5 w-3.5 ${failed ? 'text-destructive' : ''}`} aria-hidden="true" />
      )}
    </button>
  );
}
