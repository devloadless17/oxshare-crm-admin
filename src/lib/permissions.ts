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
export type RouteRequirement =
  | { permission: string }
  /**
   * ANY ONE of these opens the route.
   *
   * For a screen whose keys do not imply one another. Nothing in this system
   * says that holding `settings.manage` also grants `settings.view` — the
   * backend guard matches keys literally — so a role given only "Change
   * settings" was locked out of the screen it was granted the power to change.
   * That reads as a broken permission rather than a missing second checkbox.
   *
   * Deliberately NOT a general "all of these" counterpart: a route requirement
   * is the weakest key that makes the screen worth opening, and each control
   * inside checks its own before drawing.
   */
  | { anyOf: string[] }
  | null; // any authenticated admin

/*
 * `{ masterOnly: true }` is GONE, along with `isMasterAdmin`.
 *
 * There is no role above another any more (backend 0044): the `master_admin`
 * enum value survives in the column only because Postgres cannot drop one
 * without rewriting the type, and nothing reads it. Three routes used it —
 * /audit-log, /reconciliation and /api-keys — on the reasoning that they were
 * "not delegatable at all". That reasoning did not survive removing the tier
 * it depended on: a power nobody can be granted is a power exactly one
 * hard-coded account has, which is what the whole model moved away from.
 *
 * Each is a real key now (`audit.view`, `reconciliation.view`, `apikeys.view`),
 * so the decision to hand it to somebody is one an operator makes and the audit
 * log records.
 */

// Order matters: more specific prefixes first (matched with startsWith).
const ROUTE_REQUIREMENTS: Array<{ prefix: string; requirement: RouteRequirement }> = [
  { prefix: '/kyc/builder', requirement: { permission: 'kyc.edit' } }, // edits the KYC config itself
  /*
   * EITHER key opens the queue. `kyc.view` is the read key and `kyc.review` is
   * the decide key, and neither implies the other — the guard matches keys
   * literally — so requiring only the second hid the queue from a compliance
   * reader who may look and not decide.
   */
  { prefix: '/kyc', requirement: { anyOf: ['kyc.view', 'kyc.review'] } },
  { prefix: '/clients', requirement: { permission: 'clients.view' } },
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
  /*
   * The Financial page's own key — not `withdrawals.view` (the leak the
   * ledger's split fixed: payout review must not read every deposit) and not
   * `ledger.view` (the accounting record is a different screen). Mirrors
   * backend config/permissions.json's `transactions` module.
   */
  { prefix: '/financial', requirement: { permission: 'transactions.view' } },
  { prefix: '/wallets', requirement: { permission: 'wallets.view' } },
  { prefix: '/trading-accounts', requirement: { permission: 'trading.view' } },
  /*
   * `/bridge` shares `trading.view` with `/trading-accounts`, and the sharing is
   * the point: the screen shows the delivery queue and balance operations BEHIND
   * those accounts — the same client logins, amounts and transfer ids, one layer
   * down. Whoever may read a client's trading account may read why a deal on it
   * has not appeared.
   *
   * A dedicated key was the alternative and would have shipped a screen that
   * 404s for every existing role until somebody granted it — a diagnostics page
   * nobody can open during the incident it exists for.
   */
  { prefix: '/bridge', requirement: { permission: 'trading.view' } },
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
  /*
   * Its OWN key now. Currencies were gated on `settings.view` because they were
   * stored under `settings.*`, which is how the support-email grant also
   * carried the power to delete a currency.
   */
  { prefix: '/currencies', requirement: { permission: 'currencies.view' } },
  /*
   * Its OWN key, matching `AdminLeveragesController` and following currencies.
   *
   * The ladder lived on Settings → Trading until backend migration 0067, so
   * `settings.view` was the obvious guard — and it is the same mistake
   * currencies made and corrected: it is how the support-email grant also
   * carried the power to delete a currency. Leverage is a risk control.
   *
   * `leverages.view` is a key NO existing role holds, so this screen stays
   * invisible until somebody grants it. That is deliberate — a new power should
   * start ungranted — but it does mean the page is unreachable on a fresh
   * upgrade until a role is edited.
   */
  { prefix: '/leverages', requirement: { permission: 'leverages.view' } },
  /*
   * The catalogue: what the broker sells, and the programmes partners sell it
   * under. `settings.*` rather than keys of their own — see the note on the
   * backend controller. Reading is the weaker half on purpose: an operator who
   * may look at the settings screen should be able to see what is on sale.
   */
  { prefix: '/products', requirement: { permission: 'settings.view' } },
  { prefix: '/agencies', requirement: { permission: 'settings.view' } },
  /*
   * READ is `ib.view` — the write keys (`ib.programs.create` / `.edit` /
   * `.delete`) are checked by the controls inside, so an operator who may see
   * the terms is not also required to be able to change them. Route access is
   * the weaker of the two on purpose: somebody who may see partners should be
   * able to see the rules they are paid under.
   *
   * Registering it here is not optional: `canAccess` returns FALSE for any path
   * this table does not list, so a screen with a nav entry and no requirement is
   * unreachable for everybody — the exact failure this file's docblock records
   * for `partners.view` and `payouts.review`.
   */
  { prefix: '/ib-programs', requirement: { permission: 'ib.view' } },
  /*
   * `ib.view`, not `ib.approve`. Seeing the queue and deciding on it are
   * separate powers — the buttons inside each check their own — so requiring
   * `ib.approve` here would hide the whole screen from a reviewer who may only
   * reject.
   */
  { prefix: '/approvals/ib', requirement: { permission: 'ib.view' } },
  /*
   * `/partners` is gone — its page, its nav entry and this requirement were
   * removed together, which is the rule this table's own note records: a page
   * without a requirement renders "no access", and a requirement without a page
   * is a route nothing can reach. Partners are `/clients?type=partner` now.
   */
  /*
   * The commission ledger. It was NOT LISTED, and an unlisted path is denied —
   * so the screen shipped unreachable for everybody, which is the failure mode
   * the deny-by-default note below promises will be caught on the author's
   * first click. It was not, because the wildcard was still being honoured and
   * `hasPermission` returned true before the route table was ever consulted.
   */
  // Either key, matching `GET /admin/ib/accruals` exactly — the route was
  // stricter than its API, which denies a page the API would serve.
  { prefix: '/commissions', requirement: { anyOf: ['ib.view', 'ib.commissions.view'] } },
  /*
   * `settings.view` — the family this screen is actually made of.
   *
   * This required `roles.manage`, which was correct while /settings WAS the
   * RBAC-08 network allowlist: showing which networks are trusted to every
   * read-only admin would have been a real exposure. That tab was removed, and
   * the requirement was not moved with it — so the route and the page it gates
   * ended up asking for different things entirely.
   *
   * The symptom is worth recording, because it reads as a broken screen rather
   * than a misconfigured one: granting a role `settings.manage` did nothing at
   * all, because the ROUTE still demanded `roles.manage`; granting
   * `roles.manage` opened the route onto a page whose every panel then refused,
   * because each of those checks `settings.*`. Two ways to be denied by a
   * screen you were deliberately given.
   *
   * The weaker key on purpose, matching /partners and /payment-methods above:
   * the route says who may LOOK, and each panel checks its own write key
   * (`settings.manage`, and master-admin for SMTP) before drawing a control.
   * The API enforces both independently.
   */
  /*
   * `settings.smtp.view` and `settings.rival.view` are in the family too: an
   * operator granted ONLY the mail tab or ONLY the payments tab (a real shape —
   * "configure the Rival connection and nothing else") must be able to reach
   * the screen those tabs live on. Each tab still hides itself without its own
   * view key, so the union widens the door without widening any panel.
   */
  {
    prefix: '/settings',
    requirement: {
      anyOf: [
        'settings.view',
        'settings.edit',
        'settings.smtp.view',
        'settings.rival.view',
        // The Security tab (RBAC-08 network access) — granted on its own to an
        // operator who administers the allowlist and nothing else. It was
        // missing from this union, so that operator had a tab and no door.
        'settings.security.view',
      ],
    },
  },
  /*
   * `admins.view`, not the old `users.view`, and that split is the point of the
   * key: one permission used to open the client list AND the administrator
   * directory, so granting somebody the clients screen handed them the list of
   * everyone who can approve a payout.
   */
  { prefix: '/admin-users', requirement: { permission: 'admins.view' } },
  { prefix: '/audit-log', requirement: { permission: 'audit.view' } },
  /*
   * `reconciliation.view` — a real key, matching the controller.
   *
   * The reasoning that made it master-only still holds and is now the reason
   * the key is a NARROW one rather than part of `audit.view`: the report names
   * clients and cannot be scoped. Narrowed to a sub-admin's territory it would
   * report "balanced" over a slice, which is the opposite of what a
   * reconciliation is for; left open it hands a scoped admin the ids of clients
   * they were specifically denied. So it is grantable, and granting it is a
   * decision about giving somebody sight of every client.
   */
  /*
   * ADM-13. `ledger.view`, its own key — NOT `withdrawals.view`, which is what
   * `GET /admin/ledger` used to require. The ledger holds six entry types and
   * only one is a withdrawal, so riding on the payout queue's key handed every
   * deposit and commission on the platform to anyone reviewing withdrawals.
   *
   * This must stay in step with the decorator AND the service assertion in the
   * backend: `canAccess` here only decides what to paint, and a mismatch shows
   * an operator a page that then 403s.
   */
  { prefix: '/ledger', requirement: { permission: 'ledger.view' } },
  { prefix: '/reconciliation', requirement: { permission: 'reconciliation.view' } },
  /*
   * `apikeys.view` opens the list; `apikeys.create` and `apikeys.revoke` gate
   * the writes, and the page checks each before drawing its control.
   *
   * Issuing a key creates standing access to the admin API with no login and no
   * session lifetime, carrying any permission its creator holds — which is a
   * strong argument for the key being rare, and none at all for it being
   * ungrantable now that no account sits above the model.
   */
  { prefix: '/api-keys', requirement: { permission: 'apikeys.view' } },
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
  /*
   * The one screen in this console that is deliberately UNGATED.
   *
   * Everything on it — the password, the sessions, the photo — belongs to the
   * caller, and each endpoint behind it is `@AnyAdmin` for the same reason: an
   * administrator whose role is one screen wide still has a credential to
   * rotate and a stolen laptop to sign out. A permission key here would mean
   * somebody could be denied the ability to change their own password, which is
   * not a power anybody should be able to hand out or withhold.
   *
   * It is still LISTED rather than left to fall through, because an unlisted
   * path is denied — see the `!match` branch — so omitting it would have made
   * the profile unreachable for everyone, including the operator who is meant
   * to reach it from the sidebar on every page.
   */
  { prefix: '/profile', requirement: null },
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

/**
 * Does this admin hold this key — literally, with no shortcuts.
 *
 * ## The wildcard is not honoured, and removing it is the whole fix
 *
 * This began `if (admin.permissions.includes('*')) return true`, matching a
 * backend that had `isMaster()` and a `*` grant. Backend 0044 removed both:
 * every stored `*` was EXPANDED into the real keys it stood for, and the guard
 * now matches literally.
 *
 * While this short-circuit survived that change, the two halves disagreed in
 * the worst possible direction. An admin still holding `*` — the seeded
 * `admin@oxshare.com`, before the expansion reached their row — was shown the
 * entire sidebar, every dashboard tile and every route, because this returned
 * true for every key without reading the table below. The API answered 403 to
 * all of it. The result was a console that looked complete and was empty: every
 * page reachable, every page's data refused, and no route denial anywhere
 * because `canAccess` had already been told yes.
 *
 * A stale `*` now grants nothing, which is the honest answer — it is a
 * permission that no longer means anything, and treating it as "everything" is
 * how the UI came to disagree with the API about who could do what.
 */
export function hasPermission(admin: AdminProfile | null, key: string): boolean {
  if (!admin) return false;
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
  if ('anyOf' in match.requirement) {
    return match.requirement.anyOf.some((key) => hasPermission(admin, key));
  }
  return hasPermission(admin, match.requirement.permission);
}

/**
 * Fail loudly in development when this file references a permission the
 * backend does not define. Call once with the fetched catalog.
 *
 * Silent drift here is invisible: the nav item just disappears and the route
 * 403s, with nothing in any log to explain why.
 *
 * ── An EMPTY catalog is "I could not ask", not "the backend defines nothing" ─
 *
 * This check cannot tell those apart from the inside, and the difference is the
 * whole value of what it prints. Handed `[]` it reported EVERY key in the table
 * — all 22 — as "NOT in the backend catalog, so no role can ever hold them",
 * naming keys that were sitting in `config/permissions.json` the entire time.
 *
 * It is not a hypothetical: the caller flattens the response with
 * `(m.permissions ?? []).map(...)`, and every plausible non-catalog 200 — an
 * error envelope with `{statusCode, code, message, …}`, an empty object — has no
 * `permissions` anywhere in it, so it flattens to zero keys and RESOLVES rather
 * than throwing. The result was a console screaming about 22 phantom orphans,
 * which reads as a broken permission table and costs a real debugging session.
 *
 * So: no keys means no answer, and the honest thing to print is that the catalog
 * could not be read. A genuine orphan is only detectable against a catalog that
 * actually arrived.
 */
export function assertPermissionKeysExist(catalogKeys: string[]): string[] {
  const known = new Set(catalogKeys.map(normalizeKey));

  if (known.size === 0) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(
        '[permissions] The backend permission catalog came back EMPTY, so no key could be ' +
          'checked. This is a failed or non-catalog response from GET /admin/permissions — ' +
          'which requires roles.view or admins.view — not a missing permission. Nothing is ' +
          'reported as orphaned here, because against an empty catalog every key looks orphaned.',
      );
    }
    return [];
  }

  // Both shapes, or an `anyOf` route could carry an orphan key and this check —
  // whose whole job is to catch exactly that — would report the route as clean.
  const referenced = ROUTE_REQUIREMENTS.flatMap((r) => {
    if (!r.requirement) return [];
    if ('permission' in r.requirement) return [r.requirement.permission];
    if ('anyOf' in r.requirement) return r.requirement.anyOf;
    return [];
  });

  const orphans = [...new Set(referenced.filter((k) => !known.has(normalizeKey(k))))];
  if (orphans.length > 0 && process.env.NODE_ENV !== 'production') {
    console.error(
      `[permissions] These route keys are NOT in the backend catalog, so no role can ever hold them: ${orphans.join(', ')}`,
    );
  }
  return orphans;
}
