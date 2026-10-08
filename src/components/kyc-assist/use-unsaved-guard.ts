'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { t } from '@/lib/i18n';

/**
 * Leaving "Complete KYC" with unsaved answers asks first — by ANY way out.
 *
 * Closing or reloading the tab is the browser's own prompt (`beforeunload`).
 * A click on a link inside the console — the sidebar, "Back to client", the
 * review — is a client-side navigation the browser never asks about, so it is
 * caught here before `next/link` acts on it: in the CAPTURE phase on the
 * document, which runs before React's own listener. The click is held, the
 * console's confirm dialog asks, and Leave carries on to the same address.
 *
 * Only an ordinary left click on a same-window link is held: a new tab, a
 * modified click or an in-page anchor leaves this page where it is.
 *
 * `onLeave` runs when the operator chooses Leave: they were told the changes
 * would be lost, so nothing keeps them (`unsaved-drafts.ts`).
 */
export function useUnsavedGuard(dirty: boolean, onLeave?: () => void) {
  const router = useRouter();
  const confirm = useConfirm();
  // Read at the moment of leaving, so a new callback each render re-subscribes nothing.
  const leaving = React.useRef(onLeave);
  React.useEffect(() => {
    leaving.current = onLeave;
  });

  React.useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    const hold = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const anchor = (event.target as Element | null)?.closest?.('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== '_self') return;
      const href = anchor.getAttribute('href') ?? '';
      if (href === '' || href.startsWith('#') || anchor.origin !== window.location.origin) return;
      event.preventDefault();
      event.stopPropagation();
      void confirm({
        title: t('kycAssist.leaveTitle'),
        description: t('kycAssist.leaveBody'),
        confirmLabel: t('kycAssist.leaveConfirm'),
        cancelLabel: t('kycAssist.leaveStay'),
        destructive: true,
      }).then((leave) => {
        if (!leave) return;
        leaving.current?.();
        router.push(href);
      });
    };
    window.addEventListener('beforeunload', warn);
    document.addEventListener('click', hold, true);
    return () => {
      window.removeEventListener('beforeunload', warn);
      document.removeEventListener('click', hold, true);
    };
  }, [dirty, confirm, router]);
}
