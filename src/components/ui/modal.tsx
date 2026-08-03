'use client';

import { useRef } from 'react';
import { X } from 'lucide-react';
import { useFocusTrap } from '@/hooks/use-focus-trap';

/**
 * The standard dialog: header, body, footer, and the keyboard behaviour from
 * [useFocusTrap].
 *
 * Backdrop dismissal is opt-in (`dismissOnBackdrop`) because two of those
 * modals threw away a half-typed rejection reason on a stray click.
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
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, open, onClose);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={dismissOnBackdrop ? onClose : undefined}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${size === 'lg' ? 'max-w-2xl' : 'max-w-lg'} rounded-xl border border-border bg-card p-6 shadow-lg space-y-4 max-h-[90vh] overflow-y-auto focus:outline-none`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 id={labelledBy} className="text-lg font-semibold tracking-tight">
              {title}
            </h2>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted focus-outline"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
        {footer && <div className="flex justify-end gap-2 pt-2">{footer}</div>}
      </div>
    </div>
  );
}
