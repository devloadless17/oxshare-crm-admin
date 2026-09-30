'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

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
}) {
  const describedBy = description ? `${labelledBy}-description` : undefined;
  const keepOpen = (event: Event) => {
    if (!dismissOnBackdrop) event.preventDefault();
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && onClose()}>
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
          onPointerDownOutside={keepOpen}
          onInteractOutside={keepOpen}
          className={`fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 ${size === 'lg' ? 'max-w-2xl' : 'max-w-lg'} max-h-[90vh] space-y-4 overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-lg focus:outline-none`}
        >
          <div className="flex items-start justify-between gap-4">
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
              aria-label="Close dialog"
              data-modal-close=""
              className="rounded-md p-1 text-muted-foreground hover:bg-muted focus-outline"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {children}
          {footer && <div className="flex justify-end gap-2 pt-2">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
