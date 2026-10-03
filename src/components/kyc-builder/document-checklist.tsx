'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { t } from '@/lib/i18n';
import type { KycDocumentType, KycFieldConfig } from './field-editor';
import { FixedArabic } from './arabic-input';

/**
 * WHICH DOCUMENTS A DOCUMENT STEP ACCEPTS — a checklist, not a list of fields.
 *
 * Identity Document and Proof of Address each take ONE document from the
 * client, chosen from the ones ticked here. A passport, an ID card, a driving
 * licence are the platform's documents: each appears once, in the catalogue's
 * order, named as the catalogue names it — never twice, never on another step,
 * never relabelled. A broker chooses which to accept, and at least one must be.
 *
 * Ticking adds the document's field and unticking removes it; the server
 * rebuilds each from its type alone (`documentField`), so the draft carries
 * nothing a broker could get wrong.
 */
export function DocumentChecklist({
  category,
  catalogue,
  fields,
  onChange,
}: {
  category: 'identity' | 'address';
  catalogue: readonly KycDocumentType[];
  fields: readonly KycFieldConfig[];
  /** The step's new field list — the ticked documents, in catalogue order. */
  onChange: (fields: KycFieldConfig[]) => void;
}) {
  const offered = catalogue.filter((doc) => doc.category === category);
  const accepted = new Set(
    fields.filter((field) => field.type.startsWith('doc:')).map((field) => field.type.slice(4)),
  );

  const toggle = (value: string, on: boolean) => {
    const next = offered.filter((doc) => (doc.value === value ? on : accepted.has(doc.value)));
    onChange(
      next.map((doc) => ({
        id: `f-doc-${doc.value.replace(/_/g, '-')}`,
        name: doc.value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
        label: doc.label,
        type: `doc:${doc.value}` as KycFieldConfig['type'],
        required: false,
      })),
    );
  };

  return (
    <section aria-labelledby={`checklist-${category}`} className="space-y-3">
      <div>
        <h4
          id={`checklist-${category}`}
          className="text-xs font-bold uppercase tracking-wider text-foreground"
        >
          {t('builder.acceptedDocuments')}
        </h4>
        <p className="mt-1 max-w-prose text-[11px] text-muted-foreground">
          {category === 'identity'
            ? t('builder.acceptedIdentityBody')
            : t('builder.acceptedAddressBody')}
        </p>
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card/60">
        {offered.map((doc) => {
          const on = accepted.has(doc.value);
          const last = on && accepted.size === 1;
          return (
            <li key={doc.value} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
              <label className="flex cursor-pointer items-center gap-2.5 text-xs font-medium">
                <Checkbox
                  checked={on}
                  // The last one ticked stays ticked: a step with no document
                  // to choose is one no client could complete.
                  disabled={last}
                  onCheckedChange={(checked) => toggle(doc.value, checked === true)}
                  aria-describedby={last ? `last-${doc.value}` : undefined}
                />
                {doc.label}
              </label>
              {/* The platform's Arabic — fixed, like the English. Outside the
                  label, so the checkbox keeps the English name it is found by. */}
              <FixedArabic value={doc.labelAr} className="flex-1" />
              <span className="text-[11px] text-muted-foreground">
                {t('builder.documentParts', { count: doc.parts?.length ?? 0 })}
              </span>
              {last && (
                <span id={`last-${doc.value}`} className="sr-only">
                  {t('builder.lockedLastDocument')}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {accepted.size === 1 && (
        <p className="text-[11px] text-muted-foreground">{t('builder.lockedLastDocument')}</p>
      )}
    </section>
  );
}
