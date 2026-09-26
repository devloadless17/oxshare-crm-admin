'use client';

import { Lock } from 'lucide-react';
import { t } from '@/lib/i18n';
import type { KycFieldConfig } from './field-editor';

/**
 * THE CLIENT'S IDENTITY, as Personal Information asks for it — fixed by the
 * platform (the owner's ruling, 26 Sep 2026).
 *
 * The nine fields arrive from the API marked `system`: their labels, types and
 * whether they are required are the platform's, and they cannot be removed,
 * renamed, retyped or moved. So they are not editor rows at all — there is no
 * control here that could delete First Name, which is how a broker once
 * removed a client's real name from the form and re-added it as a custom box.
 *
 * Each row says what it is and whether a verification needs it; the lock says
 * why nothing here can change.
 */
export function IdentityBlock({ fields }: { fields: readonly KycFieldConfig[] }) {
  return (
    <section aria-labelledby="identity-block-title" className="space-y-3">
      <div>
        <h4
          id="identity-block-title"
          className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-foreground"
        >
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          {t('builder.identityTitle')}
        </h4>
        <p className="mt-1 max-w-prose text-[11px] text-muted-foreground">
          {t('builder.identityBody')}
        </p>
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card/60">
        {fields.map((field) => (
          <li
            key={field.id}
            className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5"
          >
            <span className="flex items-center gap-2 text-xs font-medium text-foreground">
              <Lock className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
              {field.label}
              <span className="sr-only">{t('builder.identityLockedSr')}</span>
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                field.required ? 'bg-primary/10 text-link' : 'bg-muted text-muted-foreground'
              }`}
            >
              {field.required ? t('builder.identityRequired') : t('builder.identityOptional')}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
