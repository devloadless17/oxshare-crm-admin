/**
 * THE query-key registry. Every `queryKey` and every `invalidateQueries` in
 * this app resolves through here, and lint refuses an inline array literal in
 * either position (see `eslint.config.mjs`).
 *
 * It exists because React Query's prefix matching fails SILENTLY. An
 * `invalidateQueries({ queryKey: ['admin-session'] })` against a query living
 * at `['admin','me']` matches nothing, resolves happily, and refetches
 * nothing — there is no error, no warning, and no test. That exact bug is
 * recorded at `components/profile/admin-identity-panel.tsx:76`, and by the
 * time this file was written the console had five more of it:
 *
 *  1. KYC approve invalidated `['kyc']` while the sidebar badge sat at
 *     `['admin','kyc','pending-count']` — no overlap, so an approved document
 *     left the badge reading `1` until the 60s poll. Reported from production.
 *  2. The clients LIST was `['clients', …]` and the client PROFILE was
 *     `['client', id]` — different roots, so suspending from the profile could
 *     never refresh the list, and vice versa.
 *  3. `queryKeysFor('admin.partner.applied')` returned
 *     `['admin','partner-applications']`, a key no query has ever used.
 *  4. …the same for `['admin','clients']`.
 *  5. Tags were cached under BOTH `['tags']` and `['client-tags']`, and
 *     withdrawal rejection reasons under two keys as well — one endpoint,
 *     two cache entries, one of them never invalidated.
 *
 * Every one of those is a key that LOOKS right at the call site. The only
 * defence is that the call site cannot invent one.
 *
 * ## The two rules
 *
 * **1. A badge shares a root with the list it counts.** This is what makes a
 * single `invalidate` cover both, and its absence is bug 1 above. So
 * `kyc.pendingCount()` is `['kyc','pending-count']` — under `kyc.all()` —
 * and NOT `['admin','kyc','pending-count']`, which is on the far side of a
 * namespace boundary from `['kyc', …]`.
 *
 * **2. One resource, one root.** The old code mixed `['admin', <resource>]`
 * and bare `['<resource>']` conventions, and every bug above is a pair that
 * landed on opposite sides of that line. The `admin` prefix is dropped
 * throughout: this is the admin app, so it distinguished nothing.
 *
 * Keys are internal cache addresses — never persisted, never in a URL — so
 * renaming them is safe and costs nothing at runtime.
 */

/** Read parameters, opaque here: the registry addresses caches, it does not
 *  interpret them. A page passes whatever object it already builds. */
type Params = unknown;

export const keys = {
  /** Identity. Not socket-driven — see `use-realtime.ts`. */
  session: {
    me: () => ['session', 'me'] as const,
  },

  kyc: {
    all: () => ['kyc'] as const,
    queue: (params: Params) => ['kyc', 'queue', params] as const,
    detail: (userId: string) => ['kyc', 'detail', userId] as const,
    history: (userId: string) => ['kyc', 'detail', userId, 'history'] as const,
    pendingCount: () => ['kyc', 'pending-count'] as const,
    /** The step builder's config, and the document-type catalogue it offers. */
    config: () => ['kyc', 'config'] as const,
    documentCatalogue: () => ['kyc', 'document-catalogue'] as const,
  },

  clients: {
    all: () => ['clients'] as const,
    list: (params: Params) => ['clients', 'list', params] as const,
    detail: (userId: string) => ['clients', 'detail', userId] as const,
    partner: (userId: string) => ['clients', 'detail', userId, 'partner'] as const,
    transactions: (userId: string, page: number) =>
      ['clients', 'detail', userId, 'transactions', page] as const,
    positions: (userId: string, status: string, page: number) =>
      ['clients', 'detail', userId, 'positions', status, page] as const,
  },

  /** ONE key. It was `['tags']` on two screens and `['client-tags']` on a
   *  third, and only the first was ever invalidated. */
  tags: {
    all: () => ['tags'] as const,
  },

  withdrawals: {
    all: () => ['withdrawals'] as const,
    list: (params: Params) => ['withdrawals', 'list', params] as const,
    pendingCount: () => ['withdrawals', 'pending-count'] as const,
    /** Also one key: the desk and the Rival panel had one each. */
    rejectionReasons: () => ['withdrawals', 'rejection-reasons'] as const,
  },

  wallets: {
    all: () => ['wallets'] as const,
    list: (params: Params) => ['wallets', 'list', params] as const,
  },

  /** The Financial page — every money movement, not just withdrawals. */
  transactions: {
    all: () => ['transactions'] as const,
    list: (params: Params) => ['transactions', 'list', params] as const,
    summary: (params: Params) => ['transactions', 'summary', params] as const,
    /* The Financial banner's count. Under the same root as the list, so
       releasing a stuck transfer refreshes both with one invalidation. */
    stuck: () => ['transactions', 'stuck'] as const,
  },

  ledger: {
    all: () => ['ledger'] as const,
    list: (params: Params) => ['ledger', 'list', params] as const,
  },

  reconciliation: {
    all: () => ['reconciliation'] as const,
  },

  /** Dashboard aggregates. Every figure is counted server-side, so these go
   *  stale on any money or KYC movement. */
  stats: {
    all: () => ['stats'] as const,
    overview: () => ['stats', 'overview'] as const,
    registrations: (days: number) => ['stats', 'registrations', days] as const,
    kycTrend: (days: number) => ['stats', 'kyc-trend', days] as const,
    withdrawalVolume: (days: number) => ['stats', 'withdrawal-volume', days] as const,
    recentKyc: () => ['stats', 'recent-kyc'] as const,
  },

  ibApplications: {
    all: () => ['ib-applications'] as const,
    list: (params: Params) => ['ib-applications', 'list', params] as const,
    pendingCount: () => ['ib-applications', 'pending-count'] as const,
  },

  ibLevels: {
    all: () => ['ib-levels'] as const,
    limits: () => ['ib-levels', 'limits'] as const,
  },

  ibPartners: {
    all: () => ['ib-partners'] as const,
    forReassign: () => ['ib-partners', 'for-reassign'] as const,
    detail: (userId: string) => ['ib-partners', 'detail', userId] as const,
  },

  ibAccruals: {
    all: () => ['ib-accruals'] as const,
    list: (params: Params) => ['ib-accruals', 'list', params] as const,
  },

  agencies: {
    all: () => ['agencies'] as const,
  },

  products: {
    all: () => ['products'] as const,
    availableGroups: () => ['products', 'available-groups'] as const,
  },

  currencies: {
    all: () => ['currencies'] as const,
  },

  leverages: {
    all: () => ['leverages'] as const,
  },

  paymentMethods: {
    all: () => ['payment-methods'] as const,
  },

  externalLinks: {
    all: () => ['external-links'] as const,
  },

  tradingAccounts: {
    all: () => ['trading-accounts'] as const,
    list: (params: Params) => ['trading-accounts', 'list', params] as const,
    mt5Groups: () => ['trading-accounts', 'mt5-groups'] as const,
  },

  adminUsers: {
    all: () => ['admin-users'] as const,
    invites: () => ['admin-users', 'invites'] as const,
    sessions: () => ['admin-users', 'sessions'] as const,
  },

  roles: {
    all: () => ['roles'] as const,
    edit: (roleId: string) => ['roles', 'edit', roleId] as const,
    formCatalogs: () => ['roles', 'form-catalogs'] as const,
  },

  permissions: {
    all: () => ['permissions'] as const,
  },

  apiKeys: {
    all: () => ['api-keys'] as const,
  },

  /** A forensic record, read deliberately. NOTHING invalidates this — see the
   *  "must not be live" rule in `use-realtime.ts`. */
  auditLog: {
    all: () => ['audit-log'] as const,
    list: (params: Params) => ['audit-log', 'list', params] as const,
    actions: () => ['audit-log', 'actions'] as const,
  },

  notifications: {
    all: () => ['notifications'] as const,
    list: () => ['notifications', 'list'] as const,
    unreadCount: () => ['notifications', 'unread-count'] as const,
  },

  /** Settings forms. Invalidated by their own save and by nothing else: a
   *  refetch under an operator's half-finished edit destroys their work. */
  settings: {
    trading: () => ['settings', 'trading'] as const,
    smtp: () => ['settings', 'smtp'] as const,
    rival: () => ['settings', 'rival'] as const,
    platformLinks: () => ['settings', 'platform-links'] as const,
    ipAllowlist: () => ['settings', 'ip-allowlist'] as const,
  },

  bridge: {
    all: () => ['bridge'] as const,
    outbox: (pendingOnly: boolean) => ['bridge', 'outbox', pendingOnly] as const,
    operations: (stuckOnly: boolean) => ['bridge', 'operations', stuckOnly] as const,
    logs: (contains: string) => ['bridge', 'logs', contains] as const,
  },

  invite: {
    one: (token: string) => ['invite', token] as const,
  },
} as const;

type KeyFactory = (...args: never[]) => readonly unknown[];

/**
 * Every key this app can address, as a union of tuple types.
 *
 * This is what turns a dead key into a COMPILE error rather than a silent
 * no-op: `queryKeysFor` (notification-kinds.ts) is typed to return these, so
 * an invented `['admin','partner-applications']` no longer type-checks.
 */
export type AdminQueryKey<T = typeof keys> = T extends KeyFactory
  ? ReturnType<T>
  : T extends object
    ? { [K in keyof T]: AdminQueryKey<T[K]> }[keyof T]
    : never;

/**
 * The root segment of every registered key, for the coverage test — which
 * asserts that no notification kind invalidates something no screen reads.
 */
export const REGISTERED_ROOTS: readonly string[] = Object.values(keys).flatMap((group) =>
  Object.values(group as Record<string, KeyFactory>).map(
    // Factories take ids/params only to build the tail; the ROOT never
    // depends on them, so a placeholder is enough to read it off.
    (factory) => (factory as (...a: unknown[]) => readonly unknown[])('', 0, 0)[0] as string,
  ),
);
