'use client';

import * as React from 'react';
import { EyeOff } from 'lucide-react';
import { fieldVisibility } from '@/lib/masking';
import { t } from '@/lib/i18n';

interface MaskedValueProps {
  /** The catalog key, e.g. `client.phone` — see GET /admin/client-fields. */
  field: string;
  /**
   * The whole ROW, not the value.
   *
   * This is the entire design of the component. Taking the row means the mask
   * set travels with the value and cannot be forgotten, so `row.phone ?? '—'`
   * is never the shorter thing to type. Taking a value and a mask array as two
   * props would make the correct call longer than the incorrect one, and the
   * incorrect one renders an em dash over a field the viewer is not allowed to
   * see — which reads as "this client has no phone number".
   */
  row: { maskedFields?: string[] } & Record<string, unknown>;
  /** Formatted rendering, used only when the value is actually visible. */
  children?: React.ReactNode;
}

/**
 * One client field, rendered according to whether the viewer may see it.
 *
 * THREE renders, deliberately unlike each other:
 *
 *   visible — the value (or `children`, when it needs formatting)
 *   empty   — a muted em dash: "this client has none"
 *   masked  — a chip: "you are not allowed to see this"
 *
 * The masked chip carries an `sr-only` label rather than relying on the
 * bullets. A screen-reader user hearing "bullet bullet bullet bullet" learns
 * nothing at all, and this is precisely the case where the reason matters more
 * than the value.
 */
export function MaskedValue({ field, row, children }: MaskedValueProps) {
  const raw = row[field.split('.').pop() ?? field];
  const state = fieldVisibility(raw, field, row.maskedFields);

  if (state === 'masked') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-muted-foreground"
        title={t('masking.hiddenTitle')}
      >
        <EyeOff className="h-3 w-3" aria-hidden="true" />
        <span aria-hidden="true" className="font-mono text-[11px] tracking-tighter">
          ••••
        </span>
        <span className="sr-only">{t('masking.hidden')}</span>
      </span>
    );
  }

  if (state === 'empty') {
    return <span className="text-muted-foreground">—</span>;
  }

  return <>{children ?? String(raw)}</>;
}

/**
 * The one-line banner above a table whose columns have been dropped.
 *
 * A masked field is a property of the VIEWER, so every row carries the same
 * set — 25 rows of identical `••••` would cost horizontal space to communicate
 * one fact. The column goes away and this says so once.
 *
 * Without it the columns are simply missing, and an operator comparing notes
 * with a colleague who sees more has no way to tell whether the screen is
 * broken or they are.
 */
export function MaskedFieldsNotice({ labels }: { labels: readonly string[] }) {
  if (labels.length === 0) return null;

  return (
    <p
      className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
      role="note"
    >
      <EyeOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{t('masking.columnsHidden', { fields: labels.join(', ') })}</span>
    </p>
  );
}
