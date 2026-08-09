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
  /*
   * `withdrawals.view`, not `withdrawals.approve`. Seeing the payout queue and
   * deciding on it are separate powers — each button checks its own — so
   * gating the route on the write key would hide the whole screen from an
   * operator who may only look, and from one who may settle but not approve.
   */
  { prefix: '/transactions', requirement: { permission: 'withdrawals.view' } },
  /*
   * These three read the same money surface, so they share its read key rather
   * than minting one no existing role holds — `withdrawals.view` is in the
   * backend catalog, which is what stops these routes becoming silently
   * master-admin-only the way invented keys did to `/partners`.
   *
   * `/wallets` and `/trading-accounts` were listed here while they still
   * rendered BackendPending, because `canAccess` denies an unlisted path and a
   * page with no route requirement shows the "no access" panel instead of
   * itself. Both now list real rows off `AdminHoldingsController`, and both are
   * reads only — the pages draw no write control, and the API refuses writes
   * regardless.
   */
  { prefix: '/wallets', requirement: { permission: 'withdrawals.view' } },
  { prefix: '/trading-accounts', requirement: { permission: 'withdrawals.view' } },
  // `payments.view` reads the list; the page checks `payments.manage` before it
  // draws any write control, and the API refuses the writes regardless.
  { prefix: '/payment-methods', requirement: { permission: 'payments.view' } },
  // `/payouts` is still listed nowhere and has no `page.tsx`: `canAccess`
  // denies an unlisted path (see the `!match` branch below), which is the
  // correct answer for a route that does not exist. `/trading-accounts` was in
  // the same position once and is back above — first as a page that named the
  // endpoint it was waiting for, now as one that lists rows off it. Either is a
  // different thing from a link to nothing.
  { prefix: '/roles', requirement: { permission: 'roles.view' } },
  /*
   * `tags.view` OR `users.view` would be the honest requirement — anyone who
   * can see the client list needs the tag vocabulary to read its chips — but
   * this table takes one key per prefix. `tags.view` is the narrower and safer
   * choice: a sub-admin without it sees no /tags nav item and gets the denied
   * panel on a direct URL, while the client list still renders its chips from
   * the same endpoint, which grants on either key.
   */
  { prefix: '/tags', requirement: { permission: 'tags.view' } },
  /*
   * `settings.view`, matching `AdminCurrenciesController`. This entry was
   * MISSING while the page shipped, so /currencies fell through to the '/'
   * catch-all and rendered for any authenticated admin — the API still refused
   * their writes, but the screen should not have drawn for them at all.
   */
  { prefix: '/currencies', requirement: { permission: 'settings.view' } },
  // `ib.view` reads the ladder; `ib.manage` is what the page checks before it
  // renders any write control. Route access is the weaker of the two on
  // purpose — an operator who may see partners should be able to see the rules
  // they are paid under.
  { prefix: '/ib-levels', requirement: { permission: 'ib.view' } },
  /*
   * `ib.view`, not `ib.approve`. Seeing the queue and deciding on it are
   * separate powers — the buttons inside each check their own — so requiring
   * `ib.approve` here would hide the whole screen from a reviewer who may only
   * reject.
   */
  { prefix: '/approvals/ib', requirement: { permission: 'ib.view' } },
  // `ib.view` to see the list; the row menu checks `ib.manage` before it draws,
  // and the API refuses the writes regardless.
  { prefix: '/partners', requirement: { permission: 'ib.view' } },
  // roles.MANAGE, not roles.view. /settings is now the RBAC-08 network allowlist
  // and the security controls; when both were the "Network" tab they were shown
  // only to an admin holding roles.manage, so requiring roles.view here would
  // newly expose which networks are trusted to every read-only admin.
  { prefix: '/settings', requirement: { permission: 'roles.manage' } },
  { prefix: '/admin-users', requirement: { permission: 'users.view' } },
  { prefix: '/audit-log', requirement: { masterOnly: true } },
  /*
   * Master admin only, matching `GET /admin/reconciliation` exactly.
   *
   * Not a permission key, and that is the backend's reasoning carried across:
   * the report names clients and there is no correct way to scope it. Narrowing
   * it to a sub-admin's territory would report "balanced" over a slice — the
   * opposite of what a reconciliation is for — while leaving it open would hand
   * a scoped admin the ids of clients they were specifically denied.
   */
  { prefix: '/reconciliation', requirement: { masterOnly: true } },
  /*
   * Master admin only, matching the controller exactly.
   *
   * Not a permission key, and deliberately: issuing a key creates standing
   * access to the admin API with no login and no session lifetime, carrying any
   * permission its creator holds. That is the same "should not be delegatable
   * at all" category as the security switches — make it a permission and it
   * eventually lands on a role called "Operations".
   */
  { prefix: '/api-keys', requirement: { masterOnly: true } },
  /*
   * There is no `/invite` entry any more, and no `/invite` page.
   *
   * Inviting an administrator is a modal on `/admin-users`, gated on the same
   * `users.create` this entry used to require — the button is only drawn for a
   * caller who holds it, and the API enforces it regardless.
   *
   * Removing the entry makes `/invite` an UNLISTED path, which `canAccess`
   * denies rather than waving through: the `/` entry below is matched exactly,
   * not as a prefix. That is the safe direction and it costs nothing, because
   * there is no `page.tsx` there to reach either way.
   *
   * `/invite/accept` is unaffected: it is reached with NO session by someone
   * who has no account yet, so it is gated by `PUBLIC_PATHS` in
   * `lib/public-paths.ts` rather than by anything here, and it renders outside
   * `AdminLayout` — which is what calls `canAccess` in the first place.
   */
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
