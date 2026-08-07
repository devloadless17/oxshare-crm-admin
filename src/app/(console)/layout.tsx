import { AdminLayout } from '@/components/layout/admin-layout';

/**
 * The console chrome, mounted ONCE for every signed-in screen.
 *
 * ── The bug this fixes ──────────────────────────────────────────────────────
 *
 * Every route used to carry its own `layout.tsx` rendering `<AdminLayout>`.
 * Seventeen of them, differing only in the function name. Sibling layouts do
 * not persist across a navigation: moving from `/tags` to `/wallets` unmounted
 * one subtree and mounted the other, so the sidebar was destroyed and rebuilt
 * on every click. Its scroll position went with it — click a link near the
 * bottom of the nav and you arrive at the new page with the sidebar scrolled
 * back to the top, having to hunt for where you just were.
 *
 * A ROUTE GROUP is the fix rather than moving this to the root layout. The
 * parentheses mean `(console)` contributes nothing to any URL — `/tags` is
 * still `/tags`, and `src/proxy.ts` gates on pathnames that are unchanged — but
 * it does introduce a shared layout boundary. React keeps this subtree mounted
 * across every navigation inside the group, so the sidebar, its scroll, and the
 * nav badge queries all survive.
 *
 * ── What is deliberately NOT in here ────────────────────────────────────────
 *
 * `/login`, `/reset-password` and `/invite/accept` stay outside the group.
 * They are reached WITHOUT a session — the first two by an unauthenticated
 * visitor, the third from an emailed link — and `AdminLayout` renders a nav
 * whose items are permission-filtered against an admin that does not exist yet.
 *
 * `/invite` keeps its own layout for the same reason: it is a real console
 * screen, but `/invite/accept` beneath it is public, so that one branch decides
 * per-path rather than per-segment.
 */
export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayout>{children}</AdminLayout>;
}
