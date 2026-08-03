'use client';

import { useCallback, useEffect, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Dialog keyboard behaviour: Escape closes, Tab cycles inside, focus starts in
 * the dialog and returns to whatever opened it.
 *
 * Of the seven hand-rolled modals in this app, one handled Escape and none
 * trapped or restored focus — a keyboard user tabbed straight out of the
 * dialog into the page behind it and had no way back.
 *
 * @param enabled false while the dialog is closed, and while a request is in
 *   flight if dismissing mid-request would lose data.
 */
export function useFocusTrap(
  panelRef: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
  enabled = true,
): void {
  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const panel = panelRef.current;
      if (!panel) return;

      if (event.key === 'Escape') {
        if (enabled) {
          event.stopPropagation();
          onClose();
        }
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      // Replaces a bare `length === 0` check: this also narrows both reads, so
      // the two .focus() calls below need no assertion.
      if (!first || !last) return;
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [panelRef, onClose, enabled],
  );

  useEffect(() => {
    if (!open) return;
    const restoreFocusTo = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    (panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel)?.focus();

    document.addEventListener('keydown', onKeyDown, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      restoreFocusTo?.focus();
    };
  }, [open, onKeyDown, panelRef]);
}
