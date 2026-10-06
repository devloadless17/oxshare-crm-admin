import type { ClientRef } from '@/lib/api/admin';
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
    detail: (userId: ClientRef) => ['kyc', 'detail', userId] as const,
    history: (userId: ClientRef) => ['kyc', 'detail', userId, 'history'] as const,
    pendingCount: () => ['kyc', 'pending-count'] as const,
    /** The step builder's config, and the document-type catalogue it offers. */
    config: () => ['kyc', 'config'] as const,
    /**
     * The builder's own read: the form AND the version a save must name
     * (`If-Match`). Under `config`, so invalidating the form refreshes both.
     */
    builder: () => ['kyc', 'config', 'builder'] as const,
    documentCatalogue: () => ['kyc', 'document-catalogue'] as const,
    identityCatalogue: () => ['kyc', 'identity-catalogue'] as const,
  },

  clients: {
    all: () => ['clients'] as const,
    list: (params: Params) => ['clients', 'list', params] as const,
    detail: (userId: ClientRef) => ['clients', 'detail', userId] as const,
    partner: (userId: ClientRef) => ['clients', 'detail', userId, 'partner'] as const,
    identity: (userId: ClientRef) => ['clients', 'detail', userId, 'identity'] as const,
    /* The Documents tab: KYC versions and deposit receipts, in one list. */
    documents: (userId: ClientRef) => ['clients', 'detail', userId, 'documents'] as const,
    closedPositions: (userId: ClientRef, page: number) =>
      ['clients', 'detail', userId, 'closed-positions', page] as const,
  },

  /** ONE key. It was `['tags']` on two screens and `['client-tags']` on a
   *  third, and only the first was ever invalidated. */
  tags: {
    all: () => ['tags'] as const,
  },

  signupLinks: {
    all: () => ['signup-links'] as const,
    mine: () => ['signup-links', 'mine'] as const,
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

  /*
   * The offline deposit desk. `pendingCount` shares the root with `list` so one
   * invalidate covers the queue AND the sidebar badge — rule 1 of this registry,
   * and the bug it was written for.
   */
  deposits: {
    all: () => ['deposits'] as const,
    list: (params: Params) => ['deposits', 'list', params] as const,
    pendingCount: () => ['deposits', 'pending-count'] as const,
    rejectionReasons: () => ['deposits', 'rejection-reasons'] as const,
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

  mt5Groups: {
    all: () => ['mt5-groups'] as const,
  },

  /** 0198 — the mirrored MT5 symbol list, for commission-type exclusions. */
  mt5Symbols: {
    all: () => ['mt5-symbols'] as const,
  },

  ibCommissionTypes: {
    all: () => ['ib-commission-types'] as const,
  },

  ibPartners: {
    all: () => ['ib-partners'] as const,
    list: (params: Params) => ['ib-partners', 'list', params] as const,
    forReassign: () => ['ib-partners', 'for-reassign'] as const,
    detail: (userId: ClientRef) => ['ib-partners', 'detail', userId] as const,
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

  /** The server's country and nationality lists. Since backend 0178 they follow
   *  the offered countries, so the countries panel's save invalidates this. */
  profileOptions: {
    all: () => ['profile-options'] as const,
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

  withdrawalMethods: {
    all: () => ['withdrawal-methods'] as const,
  },

  /** The countries offered (backend 0178): the KYC builder edits them, method rules read them. */
  countries: {
    all: () => ['countries'] as const,
  },

  /** Payment providers (backend 0168). A method change moves a provider's list too. */
  paymentProviders: {
    all: () => ['payment-providers'] as const,
    detail: (code: string) => ['payment-providers', code] as const,
    events: (code: string) => ['payment-providers', code, 'events'] as const,
    unmatched: (code: string) => ['payment-providers', code, 'unmatched'] as const,
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

  /** The admin bell: a list of TASKS. The badge (`summary`) shares the root
   *  with every feed, so one invalidate of `all()` moves both — the rule above. */
  notifications: {
    all: () => ['notifications'] as const,
    list: () => ['notifications', 'list'] as const,
    unreadCount: () => ['notifications', 'unread-count'] as const,
    feed: (params: Params) => ['notifications', 'feed', params] as const,
    summary: () => ['notifications', 'summary'] as const,
  },

  /** The rejection-reason catalogue, every context (`/rejection-reasons`). The
   *  desks cache their own context's list under their own roots
   *  (`withdrawals.rejectionReasons`, `deposits.rejectionReasons`), so an edit
   *  here invalidates those too. */
  rejectionReasons: {
    all: () => ['rejection-reasons'] as const,
  },

  /** Settings forms. Invalidated by their own save and by nothing else: a
   *  refetch under an operator's half-finished edit destroys their work. */
  settings: {
    trading: () => ['settings', 'trading'] as const,
    assistant: () => ['settings', 'assistant'] as const,
    scheduledJobs: () => ['settings', 'scheduled-jobs'] as const,
    smtp: () => ['settings', 'smtp'] as const,
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
 * no-op: `queryKeysFor` (notifications/realtime-keys.ts) is typed to return these, so
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
