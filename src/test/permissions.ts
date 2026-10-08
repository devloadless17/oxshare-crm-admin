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
  'clients.create',
  'clients.edit',
  'clients.email',
  'clients.referrer.set',
  'clients.suspend',
  'clients.tag',
  'clients.bulk',
  'kyc.view',
  'kyc.documents.view',
  'kyc.review',
  'kyc.claim.override',
  'kyc.identity.correct',
  'kyc.assist',
  'trading.view',
  'trading.create',
  'trading.deposit',
  'trading.withdraw',
  'ib.partners.view',
  'ib.partners.edit',
  'ib.partners.suspend',
  'ib.applications.view',
  'ib.approve',
  'ib.reject',
  'ib.referrals.view',
  'ib.commissions.view',
  'ib.commissions.reverse',
  'ib.commission_types.view',
  'ib.commission_types.create',
  'ib.commission_types.edit',
  'ib.commission_types.delete',
  'ib.levels.view',
  'ib.levels.create',
  'ib.levels.edit',
  'ib.levels.delete',
  'agencies.view',
  'agencies.create',
  'agencies.edit',
  'agencies.delete',
  'transactions.view',
  'transfers.abandon',
  'deposits.view',
  'deposits.proofs.view',
  'deposits.approve',
  'deposits.reject',
  'withdrawals.view',
  'withdrawals.settle',
  'withdrawals.approve',
  'wallets.view',
  'wallets.create',
  'wallets.credit',
  'wallets.debit',
  'wallets.delete',
  'ledger.view',
  'reconciliation.view',
  'currencies.view',
  'currencies.create',
  'currencies.edit',
  'currencies.delete',
  'products.view',
  'products.create',
  'products.edit',
  'products.delete',
  'leverages.view',
  'leverages.create',
  'leverages.edit',
  'leverages.delete',
  'mt5.groups.view',
  'mt5.bridge.view',
  'settings.view',
  'settings.edit',
  'settings.smtp.view',
  'settings.smtp.edit',
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
  'payments.providers.view',
  'payments.providers.edit',
  'payments.view',
  'payments.create',
  'payments.edit',
  'kyc.edit',
  'kyc.create',
  'kyc.delete',
  'rejection_reasons.view',
  'rejection_reasons.create',
  'rejection_reasons.edit',
  'rejection_reasons.delete',
  'tags.view',
  'tags.create',
  'tags.edit',
  'tags.delete',
  'externallinks.view',
  'externallinks.create',
  'externallinks.edit',
  'externallinks.delete',
  'audit.view',
  'apikeys.view',
  'apikeys.create',
  'apikeys.revoke',
  'settings.security.view',
  'settings.security.edit',
];
