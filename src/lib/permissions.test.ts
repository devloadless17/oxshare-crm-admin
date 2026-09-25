import { describe, expect, it } from 'vitest';
import type { AdminProfile } from '@/context/AdminAuthContext';
import { assertPermissionKeysExist, canAccess, hasPermission } from './permissions';

/**
 * The route table and the key matcher, against the PER-PAGE catalog.
 *
 * Rewritten wholesale when backend 0044 replaced the old vocabulary: `users.*`
 * split into `clients.*` and `admins.*`, every `manage` split into its verbs,
 * currencies and payments left `settings.*`, and both the `*` wildcard and the
 * master-admin tier were removed outright.
 *
 * There is no `master` fixture any more, and its absence is the point of the
 * file. Every test here used to have a "…and the master admin reaches it"
 * case, which passed because `hasPermission` returned true before it read
 * anything — so the route table was never actually exercised for the one
 * account that uses the console most.
 */

/** An admin holding exactly the keys named, and nothing else. */
const base: AdminProfile = {
  id: 's1',
  email: 'sub@oxshare.com',
  name: 'Sub',
  role: 'sub_admin',
  seesUntriaged: false,
  permissions: [],
  // Required since the API started admitting it. The directory used to render a
  // hardcoded "Active" badge because AdminProfileDto had no status field at all.
  status: 'active',
  // RBAC-03. Both required since the API started reporting each admin's
  // effective visibility on the row — the directory shows it without needing a
  // modal opened.
  maskedFields: [],
  scopedTags: [],
  createdAt: '2026-08-02T00:00:00.000Z',
};

const withPerms = (permissions: string[]): AdminProfile => ({ ...base, permissions });

/** A reviewer who can read the client list — the common starting point below. */
const subAdmin = withPerms(['kyc.review', 'clients.view']);

describe('hasPermission', () => {
  it('does NOT honour the * wildcard any more', () => {
    /*
     * The bug this pins, and the reason the whole file was rewritten.
     *
     * `hasPermission` short-circuited on `*` while the backend had already
     * expanded every stored wildcard into real keys and stopped honouring the
     * symbol. The two halves then disagreed in the worst direction: the seeded
     * `admin@oxshare.com`, still holding `*`, was shown the entire sidebar,
     * every dashboard tile and every route — and the API answered 403 to all of
     * it. A console that looked complete and was empty, with no route denial
     * anywhere, because `canAccess` had already been told yes.
     *
     * A stale `*` is a permission that no longer means anything, so it grants
     * nothing.
     */
    const stale = withPerms(['*']);
    expect(hasPermission(stale, 'clients.view')).toBe(false);
    expect(canAccess(stale, '/clients')).toBe(false);
  });

  it('grants only explicitly held permissions', () => {
    expect(hasPermission(subAdmin, 'kyc.review')).toBe(true);
    expect(hasPermission(subAdmin, 'ib.view')).toBe(false);
  });

  it('does not treat a verb as implying its siblings', () => {
    // `manage` used to bundle create/edit/delete. Splitting them is only worth
    // anything if holding one grants exactly one.
    const editor = withPerms(['tags.edit']);
    expect(hasPermission(editor, 'tags.edit')).toBe(true);
    expect(hasPermission(editor, 'tags.delete')).toBe(false);
    expect(hasPermission(editor, 'tags.create')).toBe(false);
    expect(hasPermission(editor, 'tags.view')).toBe(false);
  });

  it('matches regardless of case (guard parity)', () => {
    expect(hasPermission(subAdmin, 'KYC.Review')).toBe(true);
    expect(hasPermission(withPerms(['KYC.Review']), 'kyc.review')).toBe(true);
  });

  it('does NOT treat the old colon spelling as the same key (guard parity)', () => {
    /*
     * This asserted the opposite until backend migration 0009.
     *
     * Four copies of `replace(/:/g, '.')` bridged two spellings of every
     * permission key — three in the backend, one here. They were generative
     * rather than redundant: the backend normalised BEFORE checking its catalog,
     * so `kyc:review` passed validation and was stored verbatim.
     *
     * Parity with the guard is the point of this test, and the guard no longer
     * accepts it. Keeping the shim on this side alone would be worse than
     * useless: the nav would show a page the API then refuses, which is exactly
     * the drift assertPermissionKeysExist exists to catch.
     */
    expect(hasPermission(subAdmin, 'kyc:review')).toBe(false);
    expect(hasPermission(withPerms(['kyc:review']), 'kyc.review')).toBe(false);
  });

  it('denies when unauthenticated', () => {
    expect(hasPermission(null, 'kyc.review')).toBe(false);
  });
});

describe('canAccess', () => {
  it('reaches only what the held permissions cover', () => {
    expect(canAccess(subAdmin, '/dashboard')).toBe(true);
    expect(canAccess(subAdmin, '/clients')).toBe(true);
    expect(canAccess(subAdmin, '/kyc')).toBe(true);
    expect(canAccess(subAdmin, '/kyc/abc-123')).toBe(true); // detail page under /kyc
    /*
     * `/withdrawals` is UNLISTED — the desk lives at `/transactions` — so this
     * proves the deny-by-default rule: a path with no entry in the table is
     * refused whatever the admin holds, and a page shipped without a
     * requirement is caught on its author's first click.
     */
    expect(canAccess(subAdmin, '/withdrawals')).toBe(false);
  });

  it('opens the partner directory on exactly the key its API enforces', () => {
    // Back since 25 Sep 2026 — see the table entry for why it went and returned.
    expect(canAccess(withPerms(['ib.view']), '/partners')).toBe(true);
    expect(canAccess(withPerms(['clients.view']), '/partners')).toBe(false);
    expect(canAccess(withPerms(['ib.commissions.view']), '/partners')).toBe(false);
  });

  it('lets any signed-in administrator reach their OWN profile', () => {
    /*
     * `/profile` is the one route in the table with `requirement: null` and a
     * real screen behind it, and it must stay that way. Everything on it — the
     * password, the sessions, the photo — belongs to the caller, and each
     * endpoint behind it is `@AnyAdmin` for the same reason. A permission key
     * here would mean somebody could be denied the ability to change their own
     * password, or to sign out a laptop they have just had stolen.
     *
     * `withPerms([])` is the assertion that matters: an administrator holding
     * NOTHING still gets in.
     */
    expect(canAccess(withPerms([]), '/profile')).toBe(true);
    expect(canAccess(subAdmin, '/profile')).toBe(true);
    // Still denied with no session at all — ungated is not unauthenticated.
    expect(canAccess(null, '/profile')).toBe(false);
  });

  it('separates the client directory from the ADMIN directory', () => {
    /*
     * One key opened both lists. Granting somebody the client screen handed
     * them the list of everyone who can approve a payout, and the two could not
     * be granted apart at all.
     */
    expect(canAccess(withPerms(['clients.view']), '/clients')).toBe(true);
    expect(canAccess(withPerms(['clients.view']), '/admin-users')).toBe(false);
    expect(canAccess(withPerms(['admins.view']), '/admin-users')).toBe(true);
    expect(canAccess(withPerms(['admins.view']), '/clients')).toBe(false);
  });

  describe('the money screens', () => {
    it('gates the payout queue on withdrawals.VIEW, not on the write keys', () => {
      /*
       * The route is the weaker of the three keys on purpose. An operator who
       * may settle but not approve, or who may only look, still needs the
       * screen — each button checks its own permission inside. Gating the
       * route on `withdrawals.approve` would hide the queue from the person
       * whose job is paying out of it.
       */
      expect(canAccess(withPerms(['withdrawals.view']), '/transactions')).toBe(true);
      expect(canAccess(withPerms(['withdrawals.approve']), '/transactions')).toBe(false);
      expect(canAccess(withPerms(['withdrawals.settle']), '/transactions')).toBe(false);
      expect(canAccess(subAdmin, '/transactions')).toBe(false);
    });

    it('gates the Financial page on its OWN key, not the money desk’s', () => {
      /*
       * The platform-wide movement list is neither the withdrawal queue nor
       * the ledger. Riding on `withdrawals.view` would hand payout reviewers
       * every deposit and transfer (the leak the ledger's split fixed);
       * riding on `ledger.view` would couple two screens that answer
       * different questions. Backend catalog: module `transactions`.
       */
      expect(canAccess(withPerms(['transactions.view']), '/financial')).toBe(true);
      expect(canAccess(withPerms(['withdrawals.view']), '/financial')).toBe(false);
      expect(canAccess(withPerms(['ledger.view']), '/financial')).toBe(false);
      expect(canAccess(withPerms(['wallets.view']), '/financial')).toBe(false);
      expect(canAccess(subAdmin, '/financial')).toBe(false);
      // And the new key opens nothing else.
      expect(canAccess(withPerms(['transactions.view']), '/transactions')).toBe(false);
      expect(canAccess(withPerms(['transactions.view']), '/ledger')).toBe(false);
    });

    it('gives wallets and trading accounts their OWN read keys', () => {
      /*
       * Both borrowed `withdrawals.view`, because the wallets module was
       * entirely ungrantable — its three keys were enforced by the API and
       * listed in no catalog. Sharing the payout queue's key meant "may review
       * withdrawals" silently also meant "may see every client's balance".
       */
      expect(canAccess(withPerms(['wallets.view']), '/wallets')).toBe(true);
      expect(canAccess(withPerms(['trading.view']), '/trading-accounts')).toBe(true);
      expect(canAccess(withPerms(['withdrawals.view']), '/wallets')).toBe(false);
      expect(canAccess(withPerms(['withdrawals.view']), '/trading-accounts')).toBe(false);
    });

    it('gates payment methods on payments.view, with the writes checked inside', () => {
      expect(canAccess(withPerms(['payments.view']), '/payment-methods')).toBe(true);
      // Holding only a write key does not open the screen.
      expect(canAccess(withPerms(['payments.edit']), '/payment-methods')).toBe(false);
    });

    it('gates the commission ledger, which was previously unlisted', () => {
      /*
       * `/commissions` had no entry at all, and an unlisted path is DENIED — so
       * the screen shipped unreachable for everybody. It was not caught on the
       * author's first click, the way the deny-by-default rule promises,
       * because the wildcard was still being honoured and `hasPermission`
       * returned true before the route table was ever consulted.
       */
      expect(canAccess(withPerms(['ib.commissions.view']), '/commissions')).toBe(true);
      // `ib.view` opens it too — GET /admin/ib/accruals accepts EITHER key,
      // and a route stricter than its API denies a page the API would serve.
      expect(canAccess(withPerms(['ib.view']), '/commissions')).toBe(true);
      expect(canAccess(withPerms(['ib.approve']), '/commissions')).toBe(false);
    });
  });

  it('kyc builder needs kyc.edit even though /kyc is permitted', () => {
    expect(canAccess(subAdmin, '/kyc/builder')).toBe(false);
    expect(canAccess(withPerms(['kyc.edit']), '/kyc/builder')).toBe(true);
  });

  it('opens the KYC queue to a reader OR a reviewer', () => {
    // Neither key implies the other, so requiring only `kyc.review` hid the
    // queue from a compliance reader who may look and not decide.
    expect(canAccess(withPerms(['kyc.view']), '/kyc')).toBe(true);
    expect(canAccess(withPerms(['kyc.review']), '/kyc')).toBe(true);
    expect(canAccess(withPerms(['kyc.documents.view']), '/kyc')).toBe(false);
  });

  it('gives currencies their own key rather than borrowing settings.view', () => {
    // Currencies were stored under `settings.*`, which is how the grant to
    // change a support email also carried the power to delete a currency.
    expect(canAccess(withPerms(['currencies.view']), '/currencies')).toBe(true);
    expect(canAccess(withPerms(['settings.view']), '/currencies')).toBe(false);
  });

  it('management sections follow their catalog permissions', () => {
    expect(canAccess(subAdmin, '/roles')).toBe(false);
    expect(canAccess(withPerms(['roles.view']), '/roles')).toBe(true);
    expect(canAccess(withPerms(['kyc.review']), '/admin-users')).toBe(false);
  });

  it('no longer lists /invite — inviting is a modal on the directory', () => {
    /*
     * `/invite` was a page. It is a modal on `/admin-users` now, so the route
     * requirement is gone and the button carries `admins.create` instead.
     *
     * An unlisted path is DENIED — the `/` entry is matched exactly, not as a
     * prefix — and there is no `page.tsx` there to reach either way.
     *
     * `/invite/accept` is unaffected: it is public (`lib/public-paths.ts`) and
     * renders outside `AdminLayout`, which is what calls `canAccess`.
     */
    expect(canAccess(withPerms(['admins.create']), '/invite')).toBe(false);
    expect(canAccess(withPerms(['admins.view']), '/admin-users')).toBe(true);
  });

  it('/settings is gated on the family it is made of, not on roles.*', () => {
    /*
     * The regression this pins: the route asked for `roles.manage` while every
     * panel on the page checks `settings.*`, so the screen had two ways to deny
     * somebody who had been deliberately given it.
     *
     * EITHER key opens it. Nothing says `settings.edit` implies
     * `settings.view` — the guard matches literally — so a role given only
     * "Change settings" was locked out of the screen it was granted the power
     * to change.
     */
    expect(canAccess(withPerms(['settings.view']), '/settings')).toBe(true);
    expect(canAccess(withPerms(['settings.edit']), '/settings')).toBe(true);
    expect(canAccess(withPerms(['roles.edit']), '/settings')).toBe(false);
  });

  it('makes the three former master-only routes grantable', () => {
    /*
     * /audit-log, /reconciliation and /api-keys were `{ masterOnly: true }` —
     * unreachable by any grant, on the reasoning that they should not be
     * delegatable. With no tier above the model, a power nobody can be granted
     * is a power exactly one hard-coded account has.
     */
    expect(canAccess(withPerms(['audit.view']), '/audit-log')).toBe(true);
    expect(canAccess(withPerms(['reconciliation.view']), '/reconciliation')).toBe(true);
    expect(canAccess(withPerms(['apikeys.view']), '/api-keys')).toBe(true);

    // And they stay closed to everyone else — `audit.view` is not a master key
    // by another name.
    expect(canAccess(withPerms(['audit.view']), '/reconciliation')).toBe(false);
    expect(canAccess(withPerms(['audit.view']), '/api-keys')).toBe(false);
    expect(canAccess(subAdmin, '/audit-log')).toBe(false);
  });

  it('DENIES an undeclared route rather than defaulting it open', () => {
    /*
     * This asserted the opposite until R-4.2 was applied to the frontend: an
     * unknown route returned true, so every page added from then on was visible
     * to every authenticated admin until someone remembered to list it. Coverage
     * was complete by discipline, which a reviewer cannot verify — a route that
     * forgot its entry is indistinguishable from one that never needed one.
     *
     * `/commissions` proved it is a live path, not a hypothetical: it shipped
     * with no entry and was unreachable.
     */
    expect(canAccess(subAdmin, '/some-future-page')).toBe(false);
    expect(canAccess(null, '/some-future-page')).toBe(false);
  });

  it('lets an explicitly unrestricted route through', () => {
    // `requirement: null` is the stated "any authenticated admin" — the
    // frontend counterpart of the backend's @AnyAdmin(reason).
    expect(canAccess(subAdmin, '/dashboard')).toBe(true);
    expect(canAccess(subAdmin, '/')).toBe(true);
    expect(canAccess(subAdmin, '/login')).toBe(true);
  });

  it('does not let the root entry shadow a gated route', () => {
    // '/' is matched exactly, never as a prefix: `startsWith('//')` is never
    // true. If it were a prefix it would make every route unrestricted.
    expect(canAccess(subAdmin, '/withdrawals')).toBe(false);
    expect(canAccess(subAdmin, '/audit-log')).toBe(false);
  });

  it('prefix matching does not leak across sibling routes', () => {
    expect(canAccess(subAdmin, '/invite/accept')).toBe(false); // unlisted
  });
});

describe('assertPermissionKeysExist', () => {
  /*
   * Every key the route table demands must exist in the backend catalog. A key
   * that does not exist can never be granted, so the route becomes permanently
   * unreachable — which is exactly what happened to `partners.view`, invented
   * on the client profile and never added to `permissions.json`.
   *
   * This is the CURRENT catalog, per-page and per-verb. It is deliberately the
   * full list rather than only the keys the route table names: the route table
   * uses the read keys, and a fixture holding only those would not notice a
   * write key disappearing from under a control.
   */
  const CATALOG = [
    'clients.view',
    'clients.suspend',
    'clients.tag',
    'admins.view',
    'admins.create',
    'admins.edit',
    'admins.suspend',
    'admins.scope',
    'admins.reset',
    'roles.view',
    'roles.create',
    'roles.edit',
    'roles.delete',
    'kyc.view',
    'kyc.documents.view',
    'kyc.review',
    'kyc.create',
    'kyc.edit',
    'kyc.delete',
    'wallets.view',
    'wallets.create',
    'wallets.credit',
    'wallets.delete',
    // The offline deposit desk. `deposits.approve` is separate from
    // `wallets.credit` on purpose: approving credits an amount the CLIENT
    // declared, while wallets.credit types any figure into any wallet.
    'deposits.view',
    'deposits.proofs.view',
    'deposits.approve',
    'deposits.reject',
    'withdrawals.view',
    'withdrawals.approve',
    'withdrawals.settle',
    // The Financial page — backend module `transactions`.
    'transactions.view',
    'trading.view',
    'ib.view',
    'ib.approve',
    'ib.reject',
    'ib.partners.edit',
    'ib.partners.suspend',
    'ib.commissions.view',
    'tags.view',
    'tags.create',
    'tags.edit',
    'tags.delete',
    'currencies.view',
    'currencies.create',
    'currencies.edit',
    'currencies.delete',
    'leverages.view',
    'leverages.create',
    'leverages.edit',
    'leverages.delete',
    // The portal's sidebar links — their own module on the backend, for the
    // reason currencies and leverages are theirs (backend migration 0110).
    'externallinks.view',
    'externallinks.create',
    'externallinks.edit',
    'externallinks.delete',
    'payments.view',
    'payments.create',
    'payments.edit',
    'apikeys.view',
    'apikeys.create',
    'apikeys.revoke',
    'settings.view',
    'settings.edit',
    'settings.smtp.view',
    // The Rival connection's pair, added with the Payments tab (Settings).
    'settings.rival.view',
    'settings.rival.edit',
    'settings.smtp.edit',
    'settings.security.view',
    'settings.security.edit',
    'audit.view',
    'ledger.view',
    'reconciliation.view',
  ];

  it('reports nothing when every referenced key is in the catalog', () => {
    expect(assertPermissionKeysExist(CATALOG)).toEqual([]);
  });

  it('names the keys the backend does not define', () => {
    const orphans = assertPermissionKeysExist(CATALOG.filter((k) => k !== 'clients.view'));
    expect(orphans).toEqual(['clients.view']);
  });

  it('folds case on catalog keys, the same way the guard does', () => {
    expect(assertPermissionKeysExist(CATALOG.map((k) => k.toUpperCase()))).toEqual([]);
  });

  it('reports NOTHING when the catalog is empty — that is a failed fetch, not drift', () => {
    /*
     * The regression this guards. An empty catalog means the fetch failed or
     * returned something that is not a catalog — `GET /admin/permissions`
     * requires roles.view or admins.view, and its 403 body flattens to zero
     * keys through the caller's `(m.permissions ?? [])` without throwing.
     *
     * Reported as orphans, that printed all 22 route keys as "NOT in the
     * backend catalog, so no role can ever hold them" while every one of them
     * sat in config/permissions.json. The check cannot distinguish "the backend
     * defines nothing" from "I could not ask", so against no catalog it must
     * accuse nobody.
     */
    expect(assertPermissionKeysExist([])).toEqual([]);
  });

  it('reports every route key as an orphan when the catalog uses the old spelling', () => {
    // The useful failure. A backend still serving colon keys is a real mismatch
    // rather than something this file silently absorbs — and it surfaces here,
    // in development, as the loud list `assertPermissionKeysExist` prints.
    const colonCatalog = CATALOG.map((k) => k.replace('.', ':'));
    expect(assertPermissionKeysExist(colonCatalog).length).toBeGreaterThan(0);
  });
});

describe('ADM-14 — the tags screen', () => {
  it('requires tags.view', () => {
    expect(canAccess(withPerms(['tags.view']), '/tags')).toBe(true);
    // `clients.view` reaches the client LIST and its tag chips (the API grants
    // GET /admin/tags on either key), but not the management screen.
    expect(canAccess(withPerms(['clients.view']), '/tags')).toBe(false);
  });
});

describe('ADM-01 — the client profile', () => {
  it('inherits the client list requirement, via the prefix match', () => {
    // No separate entry: `/clients/<uuid>` matches the `/clients` prefix, so a
    // profile can never be reachable by someone who cannot reach the list it
    // is opened from.
    expect(
      canAccess(withPerms(['clients.view']), '/clients/a3f1c2d4-0000-4000-8000-000000000001'),
    ).toBe(true);
    expect(
      canAccess(withPerms(['kyc.review']), '/clients/a3f1c2d4-0000-4000-8000-000000000001'),
    ).toBe(false);
  });
});
