'use client';

import { useCallback, useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Dialog keyboard behaviour: Escape closes, Tab cycles inside, focus starts in
 * the dialog and returns to whatever opened it.
 *
 * TWIN — byte-identical in oxshare-crm-admin and oxshare-crm-client
 * (`scripts/check-twins.sh`). Of the seven hand-rolled modals the console first
 * had, one handled Escape and none trapped or restored focus — a keyboard user
 * tabbed straight out of the dialog into the page behind it and had no way
 * back. The portal's phone drawer had the same gap until it took this hook.
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
  /*
   * A dialog used to close itself while you typed. Reproducing it needed TWO
   * defects at once, and this hook had both:
   *
   *  1. The mount effect re-ran on every render. Callers pass an inline arrow
   *     (`onClose={() => setShowForm(false)}`), so onClose had a new identity each
   *     render, which invalidated the onKeyDown useCallback, which invalidated the
   *     effect. So it tore down and re-ran constantly, re-running its focus call.
   *  2. That focus call targeted the FIRST focusable element, which is the header's
   *     Close button, not the first form field.
   *
   * Together: focus was yanked to the Close button after every keystroke, and
   * since space activates a button, typing a name containing a space closed the
   * dialog and discarded everything typed. It reproduced on the console's
   * commission-plan form and withdrawal reject/settle dialogs — money screens.
   *
   * Both are fixed below, and measured: reverting either one alone does NOT bring
   * the bug back, because each independently breaks the chain. Both are worth
   * keeping on their own merits — an effect that re-runs every render is wrong,
   * and a dialog should open with focus in its form. The console's
   * src/components/ui/modal.test.tsx pins each half separately.
   */
  const onCloseRef = useRef(onClose);
  const enabledRef = useRef(enabled);
  useEffect(() => {
    onCloseRef.current = onClose;
    enabledRef.current = enabled;
  }, [onClose, enabled]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const panel = panelRef.current;
      if (!panel) return;

      if (event.key === 'Escape') {
        if (enabledRef.current) {
          event.stopPropagation();
          onCloseRef.current();
        }
        return;
      }
      if (event.key !== 'Tab') return;

      /*
       * What the browser will ACTUALLY stop on. `offsetParent` rules out
       * `display: none`, but not an element inside an `inert` subtree or one
       * with `visibility: hidden` — both skipped by Tab, both still matched by
       * the selector. Both apps' phone drawers hold exactly those: every closed
       * menu group's links. Counted as the "last" element, one of them made the
       * wrap-around below never fire, and Tab walked out of the drawer into the
       * page behind its overlay.
       */
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) =>
          el.offsetParent !== null &&
          !el.closest('[inert]') &&
          getComputedStyle(el).visibility !== 'hidden',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      // Narrows both reads, so the two .focus() calls below need no assertion.
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
    // Stable for the life of the hook: everything mutable is read from a ref.
    [panelRef],
  );

  useEffect(() => {
    if (!open) return;
    const restoreFocusTo = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;

    /*
     * Focus the first field rather than the Close button.
     *
     * The Close button is the first focusable in DOM order (it sits in the
     * header), so a user opening a dialog landed on "Close dialog" and a
     * screen-reader announced that before the form. Prefer a real input.
     */
    const firstField = panel?.querySelector<HTMLElement>(
      'input:not([disabled]), textarea:not([disabled]), select:not([disabled])',
    );
    (firstField ?? panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel)?.focus();

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
