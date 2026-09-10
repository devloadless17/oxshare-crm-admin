/**
 * Every permission key the backend catalog defines — the test fixture for "this
 * administrator can do everything".
 *
 * ## Why this exists
 *
 * Tests said `permissions: ['*']` and meant "unrestricted". That stopped being
 * true twice over: backend 0044 expanded every stored wildcard into real keys
 * and removed the symbol from the guard, and `hasPermission` stopped honouring
 * it on this side too. A `['*']` fixture now grants NOTHING, so a screen test
 * written that way passes only for as long as it asserts nothing that needs a
 * permission.
 *
 * Spelling the list out is also the honest fixture. `['*']` short-circuited
 * `hasPermission` before it read the key, so no test using it ever exercised
 * the matching it was nominally covering — the argument could have been
 * misspelled and every one of them would still have passed.
 *
 * ## Keep it in step with the backend BY HAND
 *
 * It mirrors `backend/src/config/permissions.json`. There is no import across
 * the repo boundary, so a key added there and not here means a control this
 * fixture cannot reach — which shows up as a test failing for a reason that
 * looks nothing like the cause. `assertPermissionKeysExist` catches the
 * opposite direction (a key the route table wants and the catalog lacks) at
 * runtime in development.
 */
export const ALL_PERMISSIONS: string[] = [
  'clients.view',
  // `clients.edit` and `clients.email` are two keys on purpose, and the
  // backend catalog explains why: correcting a surname is clerical, while
  // changing the sign-in address is an account-takeover primitive (set it to
  // your own, run a password reset, take the balance). Granting the first must
  // not grant the second. Both were missing here, so ClientActionsMenu offered
  // neither item and the CORE-18 dialog test failed pointing at a dropdown.
  'clients.edit',
  'clients.email',
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
  'kyc.identity.correct',
  'wallets.view',
  'wallets.create',
  'wallets.credit',
  'wallets.delete',
  'withdrawals.view',
  'withdrawals.approve',
  'withdrawals.settle',
  // The Financial page (GET /admin/transactions) — backend module `transactions`.
  'transactions.view',
  'transfers.abandon',
  'trading.view',
  'trading.create',
  'trading.deposit',
  'trading.withdraw',
  'ib.view',
  'ib.approve',
  'ib.reject',
  /*
   * The programme keys, missing since the catalogue screen shipped — the exact
   * drift the note at the top of this file warns about. Without them an
   * administrator who can do everything was offered no add, edit or delete
   * control on the one screen that decides what partners are paid, and a test
   * saying so failed pointing at the button rather than at this list.
   */
  'ib.levels.create',
  'ib.levels.edit',
  'ib.levels.delete',
  'ib.partners.edit',
  'ib.partners.suspend',
  'ib.commissions.view',
  'ib.commissions.reverse',
  'tags.view',
  'tags.create',
  'tags.edit',
  'tags.delete',
  'currencies.view',
  'currencies.create',
  'currencies.edit',
  'currencies.delete',
  // Backend migration 0067 moved the leverage ladder out of the settings CSV
  // into its own table and screen; 0068 grants these to whoever held
  // `settings.*`. Absent here, the leverages page renders no controls and its
  // tests fail for a reason that looks nothing like the cause — which is the
  // trap this file's header describes.
  'leverages.view',
  'leverages.create',
  'leverages.edit',
  'leverages.delete',
  /*
   * The portal's sidebar links (backend migration 0110). Their own module for
   * the reason currencies and leverages have theirs: a row on that screen puts
   * a destination of the operator's choosing into the chrome of every
   * signed-in client's page, which is a grant somebody makes deliberately
   * rather than one that arrives attached to `settings.*`.
   */
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
  'settings.smtp.edit',
  'settings.security.view',
  'settings.security.edit',
  'settings.rival.view',
  'settings.rival.edit',
  'audit.view',
  'ledger.view',
  'reconciliation.view',
];
