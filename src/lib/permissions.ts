import type { AdminProfile } from '@/context/AdminAuthContext';

/**
 * Navigation/route gating for RBAC-03 ("navigation + routes enforced").
 * This is the UI half only — real enforcement is the API returning 403
 * (ARCHITECTURE §8.8).
 *
 * EVERY key below must exist in the backend catalog
 * (config/permissions.json, served at GET /admin/permissions). If it does
 * not, no role can ever hold it, so `canAccess` returns false forever and the
 * route becomes silently master-admin-only. That had already happened to
 * `partners.view` and `payouts.review`, which were invented here and never
 * added to the catalog — the /partners page was unreachable by design
 * accident.
 *
 * `assertPermissionKeysExist()` below now catches that class of drift at
 * runtime in development instead of leaving it invisible.
 *
 * Matching is case-insensitive, exactly like the backend's PermissionsGuard.
 */
export type RouteRequirement = { permission: string } | { masterOnly: true } | null; // any authenticated admin

// Order matters: more specific prefixes first (matched with startsWith).
const ROUTE_REQUIREMENTS: Array<{ prefix: string; requirement: RouteRequirement }> = [
  { prefix: '/kyc/builder', requirement: { permission: 'kyc.edit' } }, // edits the KYC config itself
  { prefix: '/kyc', requirement: { permission: 'kyc.review' } },
  { prefix: '/clients', requirement: { permission: 'users.view' } },
  { prefix: '/partners', requirement: { permission: 'partners.view' } },
  { prefix: '/withdrawals', requirement: { permission: 'withdrawals.view' } },
  { prefix: '/trading-accounts', requirement: { permission: 'trading.view' } },
  { prefix: '/payouts', requirement: { permission: 'payouts.review' } },
  { prefix: '/ledger', requirement: { permission: 'ledger.view' } },
  { prefix: '/commission-plans', requirement: { permission: 'commissions.view' } },
  // /roles redirects here (next.config.ts); this page owns both tabs.
  { prefix: '/settings', requirement: { permission: 'roles.view' } },
  { prefix: '/admin-users', requirement: { permission: 'users.view' } },
  { prefix: '/audit-log', requirement: { masterOnly: true } },
  { prefix: '/invite', requirement: { permission: 'users.create' } },
  { prefix: '/dashboard', requirement: null },
  // `requirement: null` is "any authenticated admin", stated rather than
  // assumed — the frontend counterpart of the backend's @AnyAdmin(reason).
  // These two are matched EXACTLY, not as prefixes: `path.startsWith('/' + '/')`
  // is never true, so '/' cannot shadow the entries above it.
  { prefix: '/', requirement: null },
  { prefix: '/login', requirement: null },
];

/**
 * Same normalization as the backend guard: case only.
 *
 * This used to rewrite `:` to `.` so `kyc:review` and `kyc.review` matched. Four
 * copies of that shim existed — three in the backend, this one here — bridging
 * two spellings of every permission key, and they were generative rather than
 * merely redundant: the backend's `assertGrantable` normalised BEFORE checking
 * the catalog, so a colon key passed validation and was then stored verbatim.
 *
 * Backend migration 0009 converted the stored keys and all four shims came out
 * together. Keeping this one would be worse than pointless: the frontend would
 * show a nav item the API then refuses, which is the exact drift
 * `assertPermissionKeysExist` exists to catch.
 */
function normalizeKey(key: string): string {
  return key.toLowerCase();
}

export function isMasterAdmin(admin: AdminProfile | null): boolean {
  return admin?.role === 'master_admin';
}

export function hasPermission(admin: AdminProfile | null, key: string): boolean {
  if (!admin) return false;
  if (admin.permissions.includes('*')) return true;
  const wanted = normalizeKey(key);
  return admin.permissions.some((p) => normalizeKey(p) === wanted);
}

/**
 * DENY BY DEFAULT — the frontend half of R-4.2.
 *
 * An undeclared route used to return `true`, so every page added from then on
 * was visible to every authenticated admin until someone remembered to list it
 * here. Coverage was complete by discipline, which is not a property a reviewer
 * can check: a route that forgot its entry looks exactly like one that never
 * needed it, and `/payouts`, `/ledger`, `/commission-plans` and `/admin-users`
 * are already committed scope waiting to be built.
 *
 * Now the absence of a declaration is a refusal, and "any authenticated admin
 * may see this" is written down as `requirement: null` — a decision someone
 * made rather than one nobody did.
 *
 * This is UX, not security. The API enforces the same rules independently and
 * returns 403 regardless (ARCHITECTURE §8.8). What it buys is that a new page
 * fails visibly for its author on the first click, instead of quietly showing
 * itself to everyone until the API refuses the data behind it.
 */
export function canAccess(admin: AdminProfile | null, path: string): boolean {
  if (!admin) return false;
  const match = ROUTE_REQUIREMENTS.find(
    (r) => path === r.prefix || path.startsWith(r.prefix + '/'),
  );
  if (!match) return false;
  if (match.requirement === null) return true;
  if ('masterOnly' in match.requirement) return isMasterAdmin(admin);
  return hasPermission(admin, match.requirement.permission);
}

/**
 * Fail loudly in development when this file references a permission the
 * backend does not define. Call once with the fetched catalog.
 *
 * Silent drift here is invisible: the nav item just disappears and the route
 * 403s, with nothing in any log to explain why.
 */
export function assertPermissionKeysExist(catalogKeys: string[]): string[] {
  const known = new Set(catalogKeys.map(normalizeKey));
  const referenced = ROUTE_REQUIREMENTS.map((r) =>
    r.requirement && 'permission' in r.requirement ? r.requirement.permission : null,
  ).filter((k): k is string => k !== null);

  const orphans = [...new Set(referenced.filter((k) => !known.has(normalizeKey(k))))];
  if (orphans.length > 0 && process.env.NODE_ENV !== 'production') {
    console.error(
      `[permissions] These route keys are NOT in the backend catalog, so no role can ever hold them: ${orphans.join(', ')}`,
    );
  }
  return orphans;
}
