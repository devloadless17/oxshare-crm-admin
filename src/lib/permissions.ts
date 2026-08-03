import type { AdminProfile } from '@/context/AdminAuthContext';

/**
 * Navigation/route gating for RBAC-03 ("navigation + routes enforced").
 * This is the UI half only — real enforcement is the API returning 403
 * (ARCHITECTURE §8.8), now live for every catalog action (D-28 resolved).
 *
 * Keys come from the backend permission catalog (config/permissions.json —
 * served at GET /admin/permissions): kyc.*, users.*, roles.*, trading.*,
 * withdrawals.*. Keys for pages whose backend modules don't exist yet
 * (partners, payouts, ledger, commissions) are our proposal in the same
 * dot style — align them with the catalog when those modules land.
 *
 * Matching is normalized (colons → dots, lowercase) exactly like the
 * backend's PermissionsGuard, so tokens/data from before the key
 * unification keep working.
 */
export type RouteRequirement =
  | { permission: string }
  | { masterOnly: true }
  | null; // any authenticated admin

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
  { prefix: '/roles', requirement: { permission: 'roles.view' } },
  { prefix: '/settings', requirement: { permission: 'users.view' } },
  { prefix: '/admin-users', requirement: { permission: 'users.view' } },
  { prefix: '/audit-log', requirement: { masterOnly: true } },
  { prefix: '/invite', requirement: { permission: 'users.create' } },
  { prefix: '/dashboard', requirement: null },
];

/** Same normalization as the backend guard: 'kyc:review' ≡ 'kyc.review'. */
function normalizeKey(key: string): string {
  return key.replace(/:/g, '.').toLowerCase();
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

export function canAccess(admin: AdminProfile | null, path: string): boolean {
  if (!admin) return false;
  const match = ROUTE_REQUIREMENTS.find((r) => path === r.prefix || path.startsWith(r.prefix + '/'));
  if (!match || match.requirement === null) return true;
  if ('masterOnly' in match.requirement) return isMasterAdmin(admin);
  return hasPermission(admin, match.requirement.permission);
}
