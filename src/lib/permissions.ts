import type { AdminProfile } from '@/context/AdminAuthContext';

/**
 * Navigation/route gating for RBAC-03 ("navigation + routes enforced").
 * This is the UI half only — real enforcement must be the API returning 403
 * (ARCHITECTURE §8.8); that side is tracked in docs/DECISIONS.md D-28.
 *
 * Known permission keys today: '*' (master), 'kyc:review', 'clients:read'
 * (the two the backend grants invited sub-admins). Keys for pages whose
 * endpoints don't exist yet are our proposal — align with the backend
 * permission catalog when D-28 lands.
 */
export type RouteRequirement =
  | { permission: string }
  | { masterOnly: true }
  | null; // any authenticated admin

// Order matters: more specific prefixes first (matched with startsWith).
const ROUTE_REQUIREMENTS: Array<{ prefix: string; requirement: RouteRequirement }> = [
  { prefix: '/kyc/builder', requirement: { masterOnly: true } }, // edits the KYC config itself
  { prefix: '/kyc', requirement: { permission: 'kyc:review' } },
  { prefix: '/clients', requirement: { permission: 'clients:read' } },
  { prefix: '/partners', requirement: { permission: 'partners:read' } },
  { prefix: '/withdrawals', requirement: { permission: 'withdrawals:review' } },
  { prefix: '/trading-accounts', requirement: { permission: 'trading:read' } },
  { prefix: '/payouts', requirement: { permission: 'payouts:review' } },
  { prefix: '/ledger', requirement: { permission: 'ledger:read' } },
  { prefix: '/commission-plans', requirement: { permission: 'commissions:manage' } },
  { prefix: '/roles', requirement: { masterOnly: true } },
  { prefix: '/settings', requirement: { masterOnly: true } },
  { prefix: '/admin-users', requirement: { masterOnly: true } },
  { prefix: '/audit-log', requirement: { masterOnly: true } },
  { prefix: '/invite', requirement: { masterOnly: true } },
  { prefix: '/dashboard', requirement: null },
];

export function isMasterAdmin(admin: AdminProfile | null): boolean {
  return admin?.role === 'master_admin';
}

export function hasPermission(admin: AdminProfile | null, key: string): boolean {
  if (!admin) return false;
  return admin.permissions.includes('*') || admin.permissions.includes(key);
}

export function canAccess(admin: AdminProfile | null, path: string): boolean {
  if (!admin) return false;
  const match = ROUTE_REQUIREMENTS.find((r) => path === r.prefix || path.startsWith(r.prefix + '/'));
  if (!match || match.requirement === null) return true;
  if ('masterOnly' in match.requirement) return isMasterAdmin(admin);
  return hasPermission(admin, match.requirement.permission);
}
