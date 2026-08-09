'use client';

import { useTheme } from 'next-themes';
import { Toaster as Sonner } from 'sonner';

/**
 * The one toast host for the whole console — mounted in the ROOT layout.
 *
 * ── Why toasts at all ──────────────────────────────────────────────────────
 *
 * Every write in this app used to succeed SILENTLY. Approving a withdrawal,
 * crediting a wallet, revoking an API key, deleting a tag: the mutation ran, the
 * list refetched, and the only evidence was a row that changed — which on a
 * paged, filtered table is often a row you cannot see. An operator who clicked
 * once and saw nothing happen clicks again, and on a money path a second click
 * is a second movement. Idempotency keys stop the duplicate from landing, but
 * "did that work?" is a question the UI should answer, not the database.
 *
 * Failures were worse: most mutations had an `onError` that set a local error
 * string rendered somewhere on the page, and several had none at all, so a 403
 * from a permission the admin lacks looked exactly like a successful no-op.
 *
 * ── Why in the ROOT layout, not `(console)` ────────────────────────────────
 *
 * `/login`, `/reset-password` and `/invite/accept` sit OUTSIDE the console route
 * group and each posts to the API. Mounting the host inside the group would give
 * the signed-in screens feedback and leave the three screens reached without a
 * session — the ones where a confusing failure is most likely — with none.
 *
 * ── Theme ──────────────────────────────────────────────────────────────────
 *
 * `useTheme().resolvedTheme` rather than `theme`: the default is `"system"`, and
 * passing that string through would leave sonner painting light toasts over a
 * dark console for everybody who never opened the theme menu. `resolvedTheme`
 * is what `"system"` actually resolved to.
 *
 * `richColors` is what makes success green and error red without a per-call
 * className. That colour IS the message for an operator scanning past — the text
 * is read second.
 */
export function Toaster() {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      position="top-right"
      richColors
      closeButton
      /*
       * The default, for successes. Failures pass a longer one at the call site
       * (`lib/toast.ts`): a success confirms something you already expected, a
       * failure is a sentence you have to read and act on.
       */
      duration={4000}
    />
  );
}
