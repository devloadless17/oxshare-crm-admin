'use client';

import * as React from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';
import { isSystemField, ownFields } from './field-types';
import { SortableList, SortableRow } from './sortable-row';
import type { KycStepConfig } from './step-card';

/**
 * The builder's first tab: the client's path through the form, and every field
 * of the broker's in one table.
 *
 * ORDER lives here, because "move this one earlier" is a statement about the
 * sequence. Personal Information is pinned FIRST — the identity every later
 * step is checked against is collected before anything is checked against it —
 * so its row has no live handle and no step can be moved above it.
 *
 * The table lists the BROKER's fields only, with the two problems a save would
 * otherwise meet: a key shared across steps and a drop-down with no choices.
 * The client's identity is summarised in one line rather than listed: its
 * fields are the platform's, and a row per field would invite editing them.
 */
export function BuilderOverview({
  steps,
  onReorder,
  onOpen,
}: {
  steps: KycStepConfig[];
  /** The new order, Personal Information still first. */
  onReorder: (next: KycStepConfig[]) => void;
  onOpen: (stepId: string) => void;
}) {
  const pinned = (step: KycStepConfig) => step.slug === 'personal';
  const reorder = (next: KycStepConfig[]) => {
    // Personal Information first, whatever was dropped where.
    onReorder([...next.filter(pinned), ...next.filter((step) => !pinned(step))]);
  };
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    const moved = next[index];
    const displaced = next[target];
    if (!moved || !displaced) return;
    next[index] = displaced;
    next[target] = moved;
    reorder(next);
  };

  const rows = React.useMemo(
    () => steps.flatMap((step) => ownFields(step.fields).map((field) => ({ step, field }))),
    [steps],
  );
  const duplicate = React.useMemo(() => {
    const seen = new Map<string, number>();
    for (const { field } of rows) seen.set(field.name, (seen.get(field.name) ?? 0) + 1);
    return new Set([...seen].filter(([, count]) => count > 1).map(([name]) => name));
  }, [rows]);
  const emptySelect = (field: { type: string; options?: string[] }) =>
    field.type === 'select' && (field.options ?? []).length === 0;
  const problems = duplicate.size + rows.filter(({ field }) => emptySelect(field)).length;
  const identityCount = steps
    .find((step) => step.slug === 'personal')
    ?.fields.filter(isSystemField).length;

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-foreground">{t('builder.tabPreview')}</h2>
            <p className="text-xs text-muted-foreground">{t('builder.previewIntro')}</p>
          </div>
          <p className="text-[11px] text-muted-foreground">{t('builder.dragHint')}</p>
        </div>

        <SortableList items={steps} onReorder={reorder}>
          <ol className="space-y-2">
            {steps.map((step, index) => (
              <SortableRow
                key={step.id}
                id={step.id}
                disabled={pinned(step)}
                disabledReason={t('builder.personalFirst')}
                handleLabel={t('builder.reorderStep', { title: step.title })}
              >
                <li
                  className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 ${
                    step.enabled ? 'border-border bg-card' : 'border-border/50 bg-muted/20'
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                      step.enabled ? 'bg-primary/10 text-link' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {step.stepNumber}
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpen(step.id)}
                    className="focus-outline min-w-0 flex-1 rounded-md text-left"
                  >
                    <span
                      className={`text-sm font-semibold ${
                        step.enabled
                          ? 'text-foreground hover:text-link'
                          : 'text-muted-foreground line-through'
                      }`}
                    >
                      {step.title}
                    </span>
                    {!step.enabled && (
                      <span className="ms-2 text-[11px] text-muted-foreground">
                        {t('builder.previewSkipped')}
                      </span>
                    )}
                  </button>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      disabled={pinned(step) || index <= 1}
                      onClick={() => move(index, -1)}
                      className="focus-outline flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30"
                      title={t('kycBuilder.moveStepUp')}
                      aria-label={t('builder.moveUpNamed', { title: step.title })}
                    >
                      <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      disabled={pinned(step) || index === steps.length - 1}
                      onClick={() => move(index, 1)}
                      className="focus-outline flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30"
                      title={t('kycBuilder.moveStepDown')}
                      aria-label={t('builder.moveDownNamed', { title: step.title })}
                    >
                      <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onOpen(step.id)}
                      className="h-7 px-2.5 text-[11px]"
                    >
                      {t('builder.openStep')}
                    </Button>
                  </div>
                </li>
              </SortableRow>
            ))}
          </ol>
        </SortableList>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-foreground">{t('builder.tabAll')}</h2>
            <p className="text-xs text-muted-foreground">{t('builder.allFieldsIntro')}</p>
          </div>
          <span
            className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold ${
              problems > 0
                ? 'border border-warning/30 bg-warning/10 text-warning'
                : 'border border-success/30 bg-success/10 text-success'
            }`}
          >
            {problems > 0
              ? t('builder.problemsFound', { count: problems })
              : t('builder.noProblems')}
          </span>
        </div>

        {identityCount !== undefined && identityCount > 0 && (
          <p className="mb-3 flex items-center gap-2 rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {t('builder.identitySummary', { count: identityCount })}
          </p>
        )}

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">{t('builder.colStep')}</th>
                <th className="px-3 py-2 font-semibold">{t('builder.colField')}</th>
                <th className="px-3 py-2 font-semibold">{t('builder.colType')}</th>
                <th className="px-3 py-2 font-semibold">{t('builder.colRequired')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                    {t('builder.noOwnFields')}
                  </td>
                </tr>
              ) : (
                rows.map(({ step, field }) => (
                  <tr key={`${step.id}-${field.id}`} className="border-b border-border/50">
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => onOpen(step.id)}
                        className="focus-outline rounded-md text-muted-foreground hover:text-link"
                      >
                        {step.title}
                      </button>
                    </td>
                    <td className="px-3 py-2 font-medium">
                      {field.label}
                      {duplicate.has(field.name) && <Problem label={t('builder.duplicateKey')} />}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {field.type}
                      {emptySelect(field) && <Problem label={t('builder.emptySelect')} />}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {field.required ? t('builder.yes') : t('builder.no')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Problem({ label }: { label: string }) {
  return (
    <span className="ms-2 inline-flex items-center gap-1 rounded-md border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  );
}
