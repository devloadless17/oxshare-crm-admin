'use client';

import * as React from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import type { KycAssistStep } from '@/lib/api/admin';
import { t } from '@/lib/i18n';

/** How many still-needed items the bar names before "+N more". */
const SHOWN = 3;

/**
 * The bar along the bottom of "Complete KYC": what is still needed (each item
 * jumps to its step), Save, and Submit — or Submit & approve for staff who may
 * also review, which verifies in one click through the review's own approve.
 *
 * "Still needed" is the SERVER's verdict as of the last save; answers typed
 * since are judged when they are saved, which is why Submit stays available
 * while there are unsaved changes and saves them first.
 */
export function AssistBar({
  steps,
  complete,
  editable,
  dirty,
  canApprove,
  busy,
  onSave,
  onSubmit,
}: {
  steps: KycAssistStep[];
  complete: boolean;
  editable: boolean;
  dirty: boolean;
  canApprove: boolean;
  busy: 'save' | 'submit' | null;
  onSave: () => void;
  onSubmit: (approve: boolean) => void;
}) {
  if (!editable) return null;
  const needed = steps.flatMap((step) =>
    [...step.returned, ...step.missing].map((item) => ({ slug: step.slug, label: item.label })),
  );
  const unique = needed.filter(
    (item, index) => needed.findIndex((other) => other.label === item.label) === index,
  );
  const ready = complete || dirty;
  const jump = (slug: string) =>
    document.getElementById(`assist-step-${slug}`)?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="sticky bottom-0 z-20 -mx-4 border-t border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:-mx-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 text-xs" aria-live="polite">
          {unique.length === 0 ? (
            <span className="inline-flex items-center gap-1.5 font-semibold text-success">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {t('kycAssist.allThere')}
            </span>
          ) : (
            <span className="text-muted-foreground">
              <span className="font-semibold text-foreground">{t('kycAssist.stillNeeded')}</span>{' '}
              {unique.slice(0, SHOWN).map((item, index) => (
                <React.Fragment key={`${item.slug}-${item.label}`}>
                  {index > 0 && ', '}
                  <button
                    type="button"
                    onClick={() => jump(item.slug)}
                    className="font-medium text-link hover:underline focus-outline"
                  >
                    {item.label}
                  </button>
                </React.Fragment>
              ))}
              {unique.length > SHOWN && (
                <> {t('kycAssist.more', { count: unique.length - SHOWN })}</>
              )}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              type="button"
              onClick={onSave}
              disabled={busy !== null}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input px-3 text-xs font-semibold focus-outline disabled:opacity-50"
            >
              {busy === 'save' && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              )}
              {busy === 'save' ? t('kycAssist.saving') : t('kycAssist.save')}
            </button>
          )}
          <button
            type="button"
            onClick={() => onSubmit(false)}
            disabled={!ready || busy !== null}
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold focus-outline disabled:opacity-50 ${
              canApprove ? 'border border-input' : 'bg-primary text-primary-foreground'
            }`}
          >
            {busy === 'submit' && !canApprove && (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            )}
            {t('kycAssist.submit')}
          </button>
          {canApprove && (
            <button
              type="button"
              onClick={() => onSubmit(true)}
              disabled={!ready || busy !== null}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground focus-outline disabled:opacity-50"
            >
              {busy === 'submit' && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              )}
              {t('kycAssist.submitAndApprove')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
