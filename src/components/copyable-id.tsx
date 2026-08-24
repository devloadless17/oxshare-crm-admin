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
          void navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
        ) : (
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </button>
    </span>
  );
}
