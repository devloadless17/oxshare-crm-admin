import type { AdminProfile } from '@/context/AdminAuthContext';
import type { PermissionModule } from '@/lib/api/admin';
import { NAV, navLeaves } from '@/components/layout/navigation';
import { canAccess } from '@/lib/permissions';

/**
 * THE CONTRACT BETWEEN THE SIDEBAR AND THE PERMISSION CATALOG (Oct 2026 audit).
 *
 * Three things describe the same pages and live in two repos:
 *   - `NAV` (navigation.ts) — which pages exist and where they sit in the menu;
 *   - `ROUTE_REQUIREMENTS` (lib/permissions.ts) — which key opens each route;
 *   - the backend catalog — each page's VIEW key, carrying the route it `opens`.
 *
 * Moving a page between sidebar groups changes only `NAV`: the role editor
 * reads its sections from `NAV` through `opens`, never from a second copy. What
 * CAN drift is a page added, renamed or re-keyed on one side only — and that
 * reintroduces exactly what the buyer reported (one tick opening several menu
 * items, or a menu item no tick opens). This states the rule and lists every
 * breach; `catalog-consistency.test.ts` runs it against the real backend file,
 * and the console runs it in development against the live catalog.
 *
 * The rule, ONE PAGE ONE KEY:
 *   1. every menu page is opened by exactly one catalog view key;
 *   2. that key alone opens it (`canAccess` agrees with the catalog);
 *   3. no OTHER view key opens it;
 *   4. every route a view key claims to open is one the console has.
 */
export function catalogNavProblems(catalog: Record<string, PermissionModule>): string[] {
  const problems: string[] = [];
  const views = Object.values(catalog).flatMap((mod) =>
    mod.permissions.filter((p) => (p.opens ?? []).length > 0),
  );
  const holding = (key: string) => ({ permissions: [key] }) as AdminProfile;

  for (const leaf of navLeaves(NAV)) {
    if (canAccess({ permissions: [] } as unknown as AdminProfile, leaf.href)) continue; // ungated
    const openers = views.filter((p) => p.opens?.includes(leaf.href));
    if (openers.length === 0) problems.push(`${leaf.href}: no catalog view key opens it`);
    if (openers.length > 1) {
      problems.push(
        `${leaf.href}: opened by several keys (${openers.map((p) => p.key).join(', ')})`,
      );
    }
    for (const p of openers) {
      if (!canAccess(holding(p.key), leaf.href)) {
        problems.push(
          `${leaf.href}: the catalog says ${p.key} opens it, the route table disagrees`,
        );
      }
    }
    for (const other of views) {
      if (!openers.includes(other) && canAccess(holding(other.key), leaf.href)) {
        problems.push(`${leaf.href}: also opened by ${other.key}, which claims other pages`);
      }
    }
  }

  const known = new Set(navLeaves(NAV).map((leaf) => leaf.href));
  for (const p of views) {
    for (const route of p.opens ?? []) {
      // Off-menu pages (the bridge) still need a route the key opens.
      if (!known.has(route) && !canAccess(holding(p.key), route)) {
        problems.push(`${p.key}: opens ${route}, which the console does not route to it`);
      }
    }
  }
  return problems;
}
