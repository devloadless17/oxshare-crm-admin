'use client';

import * as React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';
import { t } from '@/lib/i18n';

/**
 * `window.confirm`, replaced — as a PROMISE, so the call sites keep their shape.
 *
 * ── Why a promise and not a rendered component ────────────────────────────
 *
 * Thirteen handlers across the console opened with the same guard:
 *
 *     if (!window.confirm(t('tags.confirmDelete', { label }))) return;
 *     await mutation.mutateAsync(tag.id);
 *
 * Converting each to a controlled `<AlertDialog>` means splitting that one
 * function into two — a click handler that stashes "which row" in state, and a
 * separate confirm handler that reads it back — plus a piece of JSX and a piece
 * of state per site. Thirteen times, on handlers that already carry real logic.
 * That refactor is where the bugs get in: the stashed row goes stale, the
 * dialog stays open through a failure, one site forgets to clear on cancel.
 *
 * Awaiting a promise keeps the guard a guard:
 *
 *     if (!(await confirm({ title: … }))) return;
 *
 * Same control flow, same single function, real themed dialog. `AlertDialog`
 * itself already documents why `window.confirm` had to go — unstyled, blocking,
 * and suppressible by the browser in a way that makes a delete silently stop
 * working.
 *
 * ── One host, in the root layout ──────────────────────────────────────────
 *
 * Rendered once, beside the `Toaster`, for the same reason: `/login`,
 * `/reset-password` and `/invite/accept` sit outside the `(console)` group.
 *
 * ── Dismissal resolves FALSE ──────────────────────────────────────────────
 *
 * Escape, the cancel button and (were it possible) an outside click all settle
 * the same way. A promise that never resolves is a handler that never returns,
 * and the `finally` block a call site wrote to clear its pending state would
 * never run — the row would spin forever on a cancel.
 */

export type ConfirmOptions = {
  /** The question, as a statement of what is about to happen. */
  title: string;
  /** The consequence — what cannot be undone, what else it affects. */
  description?: string;
  /** Defaults to "Confirm". Name the ACTION ("Delete tag"), not the assent. */
  confirmLabel?: string;
  cancelLabel?: string;
  /**
   * Paints the confirm button red. For anything that destroys or removes —
   * `AlertDialogAction` is a neutral button by default because not every
   * confirmation is a deletion.
   */
  destructive?: boolean;
};

const ConfirmContext = React.createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(
  null,
);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  /*
   * The options OUTLIVE `open` deliberately. Clearing them on close would empty
   * the dialog's title and body for the duration of its own exit animation, so
   * it would visibly blank out before it faded.
   */
  const [options, setOptions] = React.useState<ConfirmOptions | null>(null);

  /*
   * A REF, not state: this is the pending promise's resolver, and nothing
   * renders from it. In state it would be a second re-render per open, and —
   * worse — `settle` would close over a stale copy.
   */
  const pending = React.useRef<((value: boolean) => void) | null>(null);

  const confirm = React.useCallback(
    (next: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        /*
         * A second request while one is open answers the first with `false`
         * rather than dropping its resolver on the floor. That should not
         * happen — the dialog is modal — but an unresolved promise is a hung
         * handler, and this costs one line.
         */
        pending.current?.(false);
        pending.current = resolve;
        setOptions(next);
        setOpen(true);
      }),
    [],
  );

  const settle = React.useCallback((value: boolean) => {
    const resolve = pending.current;
    pending.current = null;
    setOpen(false);
    resolve?.(value);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (!next) settle(false);
        }}
      >
        {options && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{options.title}</AlertDialogTitle>
              {options.description && (
                <AlertDialogDescription>{options.description}</AlertDialogDescription>
              )}
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => settle(false)}>
                {options.cancelLabel ?? t('common.cancel')}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => settle(true)}
                className={
                  options.destructive
                    ? buttonVariants({ variant: 'destructive', size: 'sm' })
                    : undefined
                }
              >
                {options.confirmLabel ?? t('common.confirm')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

/**
 * `const confirm = useConfirm()` — then `await confirm({ title })`.
 *
 * Throws without a provider rather than returning a stub that resolves `true`.
 * A missing host must fail loudly at the first click: silently confirming every
 * destructive action is the one failure mode worse than the dialog not opening.
 */
export function useConfirm(): (options: ConfirmOptions) => Promise<boolean> {
  const confirm = React.useContext(ConfirmContext);
  if (confirm === null) {
    throw new Error('useConfirm must be used within a <ConfirmProvider>');
  }
  return confirm;
}
