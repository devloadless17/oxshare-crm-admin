'use client';

import { CheckSquare, Square } from 'lucide-react';

export interface ToggleListOption {
  value: string;
  label: string;
  /** Secondary line — a catalog key, a slug, a reason. */
  hint?: string;
  /** Disabled with an explanation, rather than silently absent. */
  disabledReason?: string;
}

/**
 * A labelled multi-select, built from the `<button aria-pressed>` pattern this
 * app already uses in `permission-matrix.tsx`.
 *
 * HAND-ROLLED RATHER THAN A DEPENDENCY. The alternative was
 * `@radix-ui/react-checkbox`, which would add a package to reproduce something
 * this codebase already does correctly and accessibly — and would make two
 * multi-selects on adjacent screens look and behave differently, which is the
 * cost people usually forget.
 *
 * EARNED, not anticipated: three consumers land with it — the client-tag
 * filter, the per-admin tag scope, and the per-admin field mask. A generic
 * component with one caller is a worse version of the code it replaced.
 *
 * `disabledReason` rather than a bare `disabled`: on both of the RBAC screens
 * an option can be unavailable for a reason the operator needs (a field the
 * catalog says cannot be hidden, a tag outside the actor's own scope). An
 * option that is simply greyed out reads as a bug.
 */
export function ToggleList({
  options,
  selected,
  onToggle,
  disabled = false,
  columns = 2,
  emptyMessage,
}: {
  options: readonly ToggleListOption[];
  selected: readonly string[];
  onToggle: (value: string) => void;
  disabled?: boolean;
  columns?: 1 | 2;
  emptyMessage?: string;
}) {
  if (options.length === 0 && emptyMessage) {
    return <p className="text-xs text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div
      className={`grid gap-2 ${columns === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}
      role="group"
    >
      {options.map((option) => {
        const isChecked = selected.includes(option.value);
        const isDisabled = disabled || option.disabledReason !== undefined;

        return (
          <button
            type="button"
            key={option.value}
            onClick={() => onToggle(option.value)}
            aria-pressed={isChecked}
            disabled={isDisabled}
            // The reason travels as the accessible tooltip too, so it is not
            // only available to someone who happens to hover.
            title={option.disabledReason}
            className={`flex w-full items-start gap-2.5 rounded-lg border p-2.5 text-start cursor-pointer focus-outline disabled:opacity-50 disabled:cursor-not-allowed ${
              isChecked ? 'border-ring bg-primary/10' : 'border-border bg-card hover:bg-muted'
            }`}
          >
            {isChecked ? (
              <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-link" aria-hidden="true" />
            ) : (
              <Square
                className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            )}
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold leading-tight text-foreground">
                {option.label}
              </span>
              {(option.hint ?? option.disabledReason) && (
                <span className="block text-[10px] leading-tight text-muted-foreground">
                  {option.disabledReason ?? option.hint}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
