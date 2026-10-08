'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { t } from '@/lib/i18n';

const FIRST_FIELD = 'input:not([disabled]), textarea:not([disabled]), select:not([disabled])';
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The standard dialog: header, body, footer.
 *
 * Built on Radix Dialog — the same layer system as the Sheet and the confirm
 * dialog — so dialogs STACK. It used to be a hand-rolled overlay with its own
 * focus trap, which worked alone and broke the moment it opened over a Radix
 * panel: the panel locks clicks, focus and screen-reader visibility outside
 * itself, the overlay rendered outside it, and every reason dialog opened from a
 * record's detail panel (reject, refuse, reverse, mark resolved) could be seen
 * and not used. Radix nests layers properly — the top one owns focus, Escape
 * and clicks, and closing it returns to the one beneath.
 *
 * Initial focus goes to the first FIELD, not the Close button — the reason a
 * dialog opened is almost always to type in it. Backdrop dismissal is opt-in
 * (`dismissOnBackdrop`) because two of these dialogs threw away a half-typed
 * rejection reason on a stray click.
 *
 * `busy` LOCKS the dialog while its mutation is in flight: Escape and the X do
 * nothing. Money dialogs report failure only inside themselves, so a dialog
 * closed mid-request wrote its error into nothing and the operator never
 * learned the action had failed. Pass `busy={mutation.isPending}`. *
 * Only the BODY scrolls. The title stays on top and the footer's actions stay in
 * view, as on the record panel: when the whole dialog scrolled, a long form (New
 * client, a method's settings) put its buttons below the fold of an ordinary
 * laptop screen, and the operator had to find them.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  dismissOnBackdrop = false,
  labelledBy = 'modal-title',
  size = 'md',
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  dismissOnBackdrop?: boolean;
  labelledBy?: string;
  size?: 'md' | 'lg';
  /** While true the dialog cannot be closed (Escape, X, backdrop). */
  busy?: boolean;
}) {
  const describedBy = description ? `${labelledBy}-description` : undefined;
  const keepOpen = (event: Event) => {
    if (busy || !dismissOnBackdrop) event.preventDefault();
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 animate-in fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
          onOpenAutoFocus={(event) => {
            const panel = event.currentTarget as HTMLElement;
            event.preventDefault();
            (
              panel.querySelector<HTMLElement>(FIRST_FIELD) ??
              panel.querySelector<HTMLElement>(`${FOCUSABLE}:not([data-modal-close])`) ??
              panel
            ).focus();
          }}
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
          onPointerDownOutside={keepOpen}
          onInteractOutside={keepOpen}
          className={`fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 ${size === 'lg' ? 'max-w-2xl' : 'max-w-lg'} flex max-h-[90vh] flex-col rounded-xl border border-border bg-card shadow-lg focus:outline-none`}
        >
          <div className="flex shrink-0 items-start justify-between gap-4 px-6 pt-6">
            <div className="space-y-1">
              <DialogPrimitive.Title
                id={labelledBy}
                className="text-lg font-semibold tracking-tight"
              >
                {title}
              </DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description
                  id={describedBy}
                  className="text-sm text-muted-foreground"
                >
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              aria-label={t('common.closeDialog')}
              data-modal-close=""
              className="rounded-md p-1 text-muted-foreground hover:bg-muted focus-outline disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div
            className={`min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pt-4 ${footer ? 'pb-4' : 'pb-6'}`}
          >
            {children}
          </div>
          {footer && (
            <div className="flex shrink-0 justify-end gap-2 border-t border-border px-6 py-4">
              {footer}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
