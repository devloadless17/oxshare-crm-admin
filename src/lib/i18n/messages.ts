/**
 * Every user-visible string in the admin app, in one place.
 *
 * TWIN-ADJACENT: `oxshare-crm-client` has the same module at the same path with
 * its own catalogue. The MECHANISM (`./index.ts`) is a strict twin and belongs
 * in both; the strings are per-app and deliberately are not shared.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * `docs/CLAUDE.md`, "Designed for change", seam 4: "Strings externalised from
 * day one. Wrap UI text in a translation function as you write it. Costs nothing
 * now; retrofitting across forty screens is weeks. Do not build the language
 * switcher yet." FSD §10 and DECISIONS D-16 carry the same requirement.
 *
 * None of it was done — every string was a literal in JSX — so this is the
 * retrofit that instruction existed to avoid.
 *
 * ── A note on priority ──────────────────────────────────────────────────────
 *
 * The client portal matters more here than the admin app does: FSD §10's RTL
 * Arabic requirement is about the customer-facing surface, and back-office staff
 * are a smaller, known audience. The mechanism is still installed in both,
 * because a seam that exists in one app and not the other is one someone has to
 * remember, and this catalogue starts with the chrome and the auth screen —
 * the parts a non-English-speaking operator meets first.
 *
 * ── Conventions ────────────────────────────────────────────────────────────
 *
 *  - Keys are `area.screen.element`, lower-case, dot-separated.
 *  - Interpolation is `{name}`; see `t()` in ./index.ts.
 *  - Never build a sentence by concatenating two keys — word order differs
 *    between languages, and in Arabic so does direction. One key per sentence.
 */
export const messages = {
  // ── Platform download links ───────────────────────────────────────────────
  'platforms.title': 'Trading platform downloads',
  'platforms.subtitle':
    'The download links clients see on their Platforms page. A platform with no link is shown to them as not available yet, never as a link that goes nowhere.',
  'platforms.desktop': 'Desktop terminal',
  'platforms.ios': 'iPhone and iPad',
  'platforms.android': 'Android',
  'platforms.urlPlaceholder': 'https://downloads.oxshare.com/...',
  'platforms.save': 'Save',
  'platforms.saving': 'Saving...',
  'platforms.saved': 'Saved',
  'platforms.clearHint': 'Leave empty to take the download offline.',
  'platforms.httpsOnly': 'Must be an https link — clients install what they download from here.',
  'platforms.updateFailed': 'Could not save that link.',
  'platforms.loading': 'Loading download links',
  'platforms.loadFailed': 'Could not load the download links.',
  'platforms.notConfigured': 'Not configured',
  'platforms.lastUpdated': 'Updated {when}',
  'platforms.readOnly': 'You do not have permission to change these.',

  // ── Brand and chrome ──────────────────────────────────────────────────────
  'app.name': 'OXShare',
  'app.adminName': 'Admin Portal',
  'app.adminSuffix': 'Admin',

  // ── Navigation ────────────────────────────────────────────────────────────
  'nav.section.overview': 'OVERVIEW',
  'nav.section.clients': 'CLIENTS',
  'nav.section.finance': 'FINANCE',
  'nav.section.administration': 'ADMINISTRATION',
  'nav.dashboard': 'Dashboard',
  'nav.clients': 'Clients',
  'nav.withdrawals': 'Withdrawals',
  'nav.ledger': 'Ledger',
  'nav.commissionPlans': 'Commission Plans',
  'nav.kyc': 'KYC Review',
  'nav.kycBuilder': 'KYC Workflow Builder',
  'nav.adminUsers': 'Admin Users',
  'nav.roles': 'Roles',
  'nav.auditLog': 'Audit Log',
  'nav.settings': 'Settings',
  'nav.logout': 'Logout',
  // Same strings as the portal's, because the account menu at the foot of the
  // sidebar is the same control. See components/layout/user-menu.tsx.
  'nav.noRole': 'No role assigned',
  'nav.accountMenu': 'Account menu',
  'theme.label': 'Theme',
  'theme.light': 'Light',
  'theme.dark': 'Dark',
  'theme.system': 'System',
  'nav.collapseSidebar': 'Collapse the sidebar',
  'nav.expandSidebar': 'Expand the sidebar',
  'nav.searchPlaceholder': 'Search clients, deals, IBs… (⌘K)',
  'nav.searchAria': 'Global search across the console',
  'nav.notifications': 'Notifications',

  // ── Session ───────────────────────────────────────────────────────────────
  'session.loading': 'Loading your session',
  'session.deniedTitle': 'Access denied',
  'session.deniedBody':
    'Your role does not include access to this section. Ask a master admin if you need it.',
  'session.backToDashboard': 'Back to dashboard',
  // Signed in, but the console could not then confirm who with. Navigating
  // anyway lands the operator in a shell that knows nothing about them.
  'login.sessionCheckFailed':
    'Signed in, but the console could not load your profile. Check your connection and try again.',
  // The state that used to render as an endless spinner: the API could not be
  // reached, which is NOT the same as having no session and must not look like it.
  'session.unreachableTitle': 'Cannot reach the server',
  'session.unreachableBody':
    'Your session is intact — the console could not contact the API. Check your connection and try again.',
  'session.retry': 'Try again',
  'error.title': 'Something went wrong',
  'error.body':
    'This screen failed to render. Trying again often clears it; if it does not, quote the reference below.',
  'notFound.title': 'Page not found',
  'notFound.body': 'That address does not match anything in the console.',
  // Accepting an invite mints a new session over the existing one. Saying so is
  // the difference between a deliberate hand-over and a silent account swap.
  'invite.sessionWarning':
    '{email} is currently signed in on this browser. Activating this account will sign them out.',

  // Deliberately says the session is STILL OPEN. Only the server can end it —
  // the cookies are httpOnly — so a failed logout leaves the admin signed in,
  // and on a shared machine that is the thing they need to know.
  'session.logoutFailed': 'Sign-out failed — you are still signed in. Please try again.',

  // ── Login ─────────────────────────────────────────────────────────────────
  'login.title': 'OXShare',
  'login.subtitle': 'Authorized back-office management login',
  'login.email': 'Admin Email',
  'login.password': 'Password',
  'login.submit': 'Sign in to Admin',
  'login.submitting': 'Authenticating…',
  'login.showPassword': 'Show password',
  'login.hidePassword': 'Hide password',
  'login.missingFields': 'Please fill in both email and password.',
  'login.failed': 'Sign in failed. Please try again.',

  // ── Invite acceptance ─────────────────────────────────────────────────────
  'invite.validating': 'Validating invite…',
  'invite.invalidTitle': 'Invalid Invite',
  'invite.invalidLink': 'Invalid invite link.',
  'invite.expired': 'Invalid or expired invite.',
  'invite.welcome': 'Welcome, {name}!',
  'invite.body':
    "You've been invited to join OXShare Admin. Set your password to activate your account.",
  'invite.newPassword': 'New Password',
  'invite.confirmPassword': 'Confirm Password',
  'invite.passwordHint': 'Min. 8 characters',
  'invite.repeatPassword': 'Repeat password',
  'invite.showPasswords': 'Show passwords',
  'invite.hidePasswords': 'Hide passwords',
  'invite.tooShort': 'Password must be at least 8 characters.',
  'invite.mismatch': 'Passwords do not match.',
  'invite.submit': 'Activate Account',
  'invite.submitting': 'Activating account…',
  // The terminal state, held while the browser navigates. Not a toast: the page
  // it would appear over is the one being replaced.
  'invite.redirecting': 'Account activated — taking you to the dashboard…',
  'invite.failed': 'Failed to accept invite.',

  /*
   * ── Withdrawals (ADM-03) ─────────────────────────────────────────────────
   *
   * These survived the money teardown as orphans and are reused rather than
   * re-minted under a `transactions.*` prefix. The screen is at /transactions
   * because that is what an operator calls the queue; the DOMAIN is still
   * withdrawals, which is what these keys name.
   */
  'withdrawals.title': 'Withdrawals',
  'withdrawals.colClient': 'Client',
  'withdrawals.colAmount': 'Amount',
  'withdrawals.colDestination': 'Destination',
  'withdrawals.colState': 'State',
  'withdrawals.colRequested': 'Requested',
  'withdrawals.stateAll': 'All',
  'withdrawals.statePending': 'Pending',
  'withdrawals.stateApproved': 'Approved',
  'withdrawals.statePaid': 'Paid',
  'withdrawals.stateRejected': 'Rejected',
  'withdrawals.stateFailed': 'Failed',
  'withdrawals.approve': 'Approve',
  'withdrawals.reject': 'Reject',
  'withdrawals.settle': 'Mark paid',
  'withdrawals.approveFailed': 'Failed to approve the withdrawal.',
  'withdrawals.approveSucceeded': 'Withdrawal of {amount} approved',
  'withdrawals.rejectSucceeded': 'Withdrawal of {amount} rejected',
  'withdrawals.settleSucceeded': 'Withdrawal of {amount} marked paid',

  'withdrawals.heading': 'Withdrawal Requests',
  'withdrawals.subtitle':
    'Review client withdrawals — approve, reject with a reason, or mark paid once the provider confirms',
  'withdrawals.moneyNote': 'Every money movement is recorded in the audit log.',
  'withdrawals.required': '*',
  'withdrawals.colActions': 'Actions',
  'withdrawals.viewOnly': 'View only',
  // R-5.4: the two steps are separate permissions, so an admin may legitimately
  // hold one and not the other. Saying WHO it is waiting for beats a disabled
  // button with no explanation.
  'withdrawals.awaitingApprover': 'Awaiting an approver',
  'withdrawals.awaitingSettler': 'Awaiting a payer',
  'withdrawals.markPaid': 'Mark Paid',
  'withdrawals.rejectionReason': 'Rejection Reason',
  'withdrawals.selectReason': 'Select a reason…',
  'withdrawals.reasonPlaceholder': 'e.g. Beneficiary name does not match the account holder…',
  'withdrawals.providerRef': 'Provider reference',
  'withdrawals.providerRefPlaceholder': 'e.g. whish-payout-9911',
  'withdrawals.tabPending': 'Pending Review',
  'withdrawals.tabApproved': 'Approved / Paid',
  'withdrawals.tabRejected': 'Rejected / Failed',
  'withdrawals.loading': 'Loading withdrawal requests',
  'withdrawals.loadFailed': 'Could not load withdrawal requests.',
  'withdrawals.caption': 'Client withdrawal requests',
  'withdrawals.empty': 'No withdrawal requests yet.',
  'withdrawals.emptyFiltered': 'No withdrawals in this state.',
  'withdrawals.rejectFailed': 'Could not reject the withdrawal.',
  'withdrawals.settleFailed': 'Could not mark the withdrawal paid.',
  'withdrawals.rejecting': 'Rejecting…',
  'withdrawals.confirmRejection': 'Confirm rejection',
  'withdrawals.posting': 'Posting…',
  'withdrawals.confirmPayment': 'Confirm payment',
  'withdrawals.additionalNote': 'Additional note (optional)',
  'withdrawals.noteHint': 'The client reads this. Say what would make a new request succeed.',
  'withdrawals.rejectIntro':
    '{email} · {amount} {currency}. The hold is released, the client is emailed the reason, and they may submit a new request.',
  'withdrawals.settleIntro':
    '{email} · {amount} {currency}. This posts the debit to the ledger and clears the hold. It cannot be undone — corrections are compensating ledger entries.',
  'withdrawals.settledOn': 'Settled {date}',
  'withdrawals.reviewedOn': 'Reviewed {date}',
  'withdrawals.reasonsUnavailable':
    'The configured reasons could not be loaded. A written reason still works.',
  'withdrawals.noun': 'request',
  'withdrawals.nounPlural': 'requests',

  // ── Payment methods ───────────────────────────────────────────────────────
  'paymentMethods.title': 'Payment methods',
  /*
   * The pay-to sentence is gone with the field.
   *
   * It read "a method with no pay-to account is not offered to them, whatever
   * its status says" — a real rule at the time, and false now: the admin surface
   * is name, key, logo and an enabled toggle, so being enabled IS being offered.
   * Copy describing a check the code no longer performs is worse than none,
   * because an operator reads it and goes looking for a field to fill in.
   */
  'paymentMethods.subtitle':
    'How clients can send money in. Enabling a method offers it in the client portal; disabling it stops new deposits and keeps existing history readable.',
  'paymentMethods.create': 'Add method',
  'paymentMethods.loading': 'Loading payment methods',
  'paymentMethods.loadFailed': 'Could not load the payment methods.',
  'paymentMethods.caption': 'Configured deposit methods',
  'paymentMethods.empty': 'No payment methods configured. Clients cannot deposit until one is.',
  'paymentMethods.colKey': 'Key',
  'paymentMethods.colName': 'Name',
  'paymentMethods.colCurrency': 'Currency',
  'paymentMethods.colStatus': 'Status',
  'paymentMethods.colActions': 'Actions',
  /*
   * `colKind`, `kindManual`, `kindGateway` and `kindCrypto` are GONE with the
   * column (migration 0043). They printed our own integration's classification
   * in a table an operator reads to answer one question — is this on? — and the
   * word "Manual" beside a live gateway was actively wrong for a whole release.
   *
   * `colLimits`, `noLimits`, `minOnly`, `maxOnly` and `minMax` went with the
   * per-method bound columns in 0042.
   */
  'paymentMethods.statusEnabled': 'Enabled',
  'paymentMethods.statusDisabled': 'Disabled',
  // The row action, named plainly. It matches the Status column beside it —
  // "Enabled"/"Disabled" — so the verb and the state read as the same idea.
  'paymentMethods.enable': 'Enable',
  'paymentMethods.disable': 'Disable',
  // The logo is UPLOADED now, not linked. A pasted URL meant every client's
  // deposit screen loaded an image from a host the operator did not control.
  'paymentMethods.logo': 'Logo',
  'paymentMethods.logoUpload': 'Upload logo',
  'paymentMethods.logoReplace': 'Replace logo',
  'paymentMethods.logoRemove': 'Remove',
  'paymentMethods.logoUploading': 'Uploading…',
  // SVG included: brand marks arrive as vector, and the server has always
  // accepted it. The old wording listed three types and quietly excluded the one
  // an operator was most likely to have.
  'paymentMethods.logoHint': 'SVG, PNG, JPEG or WebP, up to 1MB. Shown beside the method name.',
  'paymentMethods.logoUploadFailed': 'Could not upload that image. Please try another file.',
  'paymentMethods.edit': 'Edit',
  'paymentMethods.editAria': 'Edit {name}',
  'paymentMethods.createTitle': 'Add a payment method',
  'paymentMethods.editTitle': 'Edit payment method',
  'paymentMethods.key': 'Key',
  'paymentMethods.keyHint': 'Lower-case, no spaces. Stored transactions reference it.',
  'paymentMethods.keyLocked': 'Fixed — transactions already reference this key.',
  'paymentMethods.name': 'Display name',
  'paymentMethods.nameHint': 'What the client sees.',
  'paymentMethods.currency': 'Currency',
  'paymentMethods.currencyPlaceholder': 'Choose a currency…',
  /*
   * The CONSEQUENCE, not a description of the field. An operator picking a
   * currency is deciding which of the client's wallets their money lands in, and
   * nothing downstream converts — there is no FX source in this system.
   */
  'paymentMethods.currencyHint':
    'What deposits through this method are denominated in, and the wallet they land in. Nothing converts.',
  'paymentMethods.currencyLoadFailed':
    'Could not load the platform currencies. Reopen this dialog to try again.',
  'paymentMethods.save': 'Save',
  'paymentMethods.saving': 'Saving…',
  'paymentMethods.saveFailed': 'Could not save the payment method.',
  'paymentMethods.saveSucceeded': '{name} saved',
  'paymentMethods.enabledSucceeded': '{name} enabled',
  'paymentMethods.disabledSucceeded': '{name} disabled',
  'paymentMethods.readOnly': 'You do not have permission to change these.',
  /*
   * ── Keys deleted with the fields behind them ──────────────────────────────
   *
   * `instructions*`, `payTo*`, `minAmount`, `maxAmount`, `amountHint` — columns
   * dropped in migration 0042.
   * `kind`, `kindHint` — column dropped in 0043.
   * `notOffered`, `notOfferedWhy` — described the pay-to rule, which no longer
   * exists: being enabled IS being offered.
   * `delete*`, `confirmDelete*` — there is no delete endpoint, by design.
   * `logoUrl`, `sortOrder*`, `enabled*` — no longer form fields; the logo is an
   * upload and offering a method is a row action.
   *
   * Listed rather than silently removed because each was live copy, and a
   * string that reappears without its field is how a form grows a control the
   * API ignores.
   */

  // ── Wallets (GET /admin/wallets) ──────────────────────────────────────────
  // These screens rendered BackendPending until the holdings endpoints shipped.
  // The `*.pendingTitle` keys went with the placeholders.
  'wallets.title': 'Client wallets',
  'wallets.subtitle':
    'Every client wallet, with its balance and whatever is held against a pending transfer. Balances are shown exactly as the ledger stores them.',
  'wallets.loading': 'Loading wallets', // spinner label
  'wallets.loadFailed': 'Could not load the wallets.',
  'wallets.caption': 'Client wallets, with their owner and balance', // sr-only table caption
  'wallets.empty': 'No wallets yet.',
  'wallets.emptyFiltered': 'No wallets match these filters.',
  'wallets.colOwner': 'Client',
  'wallets.colCurrency': 'Currency',
  'wallets.colBalance': 'Balance',
  'wallets.colOnHold': 'On hold',
  'wallets.colOpened': 'Opened',
  'wallets.filterCurrency': 'Currency',
  'wallets.filterCurrencyAll': 'All currencies',
  'wallets.filterClient': 'Client ID',
  'wallets.filterClientPlaceholder': 'Paste a client ID',
  'wallets.filterClientHint': 'An exact client id — this is not a name search.',
  'wallets.clearFilters': 'Clear filters',
  'wallets.noun': 'wallet', // pager: "1–25 of 40 wallets"
  'wallets.nounPlural': 'wallets',
  // Said next to the on-hold column, because "available" is not a field the API
  // sends: it is balance − onHold, and that subtraction belongs in decimal
  // arithmetic on the server rather than in JS on these strings.
  'wallets.onHoldNote': 'Reserved against a pending transfer.',

  // ── Crediting a wallet by hand ────────────────────────────────────────────
  // The only control in the console that CREATES money, so the copy is written
  // to slow the operator down: it names the client, shows the balance they are
  // adding to, and says out loud that the reason reaches the client.
  'wallets.creditAction': 'Add funds',
  // Only ever an EMPTY, unused wallet — the API refuses any other, naming the
  // balance or the count of history. The copy says so up front so the operator
  // learns the rule from the control rather than from a refusal.
  'wallets.closeAction': 'Close wallet',
  'wallets.closeConfirmTitle': 'Close this {currency} wallet?',
  'wallets.closeConfirmBody':
    'This removes the wallet from {email}. It only works on an empty wallet with no history — the API refuses any other, and says why.',
  'wallets.closeConfirm': 'Close wallet',
  'wallets.closing': 'Closing…',
  'wallets.closeFailed': 'Could not close the wallet.',
  'wallets.closeSucceeded': '{currency} wallet closed',
  'wallets.creditTitle': 'Add funds to this wallet',
  'wallets.creditClient': 'Client',
  'wallets.creditCurrentBalance': 'Current balance',
  'wallets.creditAmount': 'Amount to add ({currency})',
  'wallets.creditAmountHint': 'Up to 8 decimal places. Credited exactly as entered.',
  'wallets.creditReason': 'Reason',
  'wallets.creditReasonPlaceholder': 'Goodwill adjustment for the failed 4 August transfer.',
  // Says where it goes, because an operator who does not know the client reads
  // it writes a different sentence.
  'wallets.creditReasonHint': 'Recorded in the audit log and sent to the client in their email.',
  'wallets.creditConfirm': 'Add funds',
  'wallets.crediting': 'Adding…',
  'wallets.creditFailed': 'Could not add the funds. Nothing was credited.',
  // The AMOUNT is in the confirmation, not just "funds added" — this is the one
  // control in the console that moves money on an operator's say-so.
  'wallets.creditSucceeded': '{amount} credited',
  'wallets.openSucceeded': '{currency} wallet opened',

  // ── Trading accounts (GET /admin/trading-accounts) ────────────────────────
  'tradingAccounts.title': 'Trading accounts',
  'tradingAccounts.subtitle':
    'Every client trading account, live and demo, with its MT5 login once MetaTrader has issued one.',
  'tradingAccounts.loading': 'Loading trading accounts', // spinner label
  'tradingAccounts.loadFailed': 'Could not load the trading accounts.',
  'tradingAccounts.caption': 'Client trading accounts, with their owner and balance',
  'tradingAccounts.empty': 'No trading accounts yet.',
  'tradingAccounts.emptyFiltered': 'No trading accounts match these filters.',
  'tradingAccounts.colOwner': 'Client',
  'tradingAccounts.colLogin': 'MT5 login',
  'tradingAccounts.colEnvironment': 'Environment',
  'tradingAccounts.colCurrency': 'Currency',
  'tradingAccounts.colBalance': 'Balance',
  'tradingAccounts.colLeverage': 'Leverage',
  'tradingAccounts.colStatus': 'Status',
  'tradingAccounts.colOpened': 'Opened',
  // NOT an em-dash in an empty cell: a login is genuinely absent until the
  // bridge assigns one, and a blank reads as a rendering fault instead.
  'tradingAccounts.noLogin': 'Not assigned',
  'tradingAccounts.envLive': 'Live',
  'tradingAccounts.envDemo': 'Demo',
  'tradingAccounts.statusActive': 'Active',
  'tradingAccounts.statusSuspended': 'Suspended',
  'tradingAccounts.statusClosed': 'Closed',
  'tradingAccounts.filterEnvironment': 'Environment',
  'tradingAccounts.filterEnvironmentAll': 'Live and demo',
  'tradingAccounts.filterStatus': 'Status',
  'tradingAccounts.filterStatusAll': 'All statuses',
  'tradingAccounts.filterClient': 'Client ID',
  'tradingAccounts.filterClientPlaceholder': 'Paste a client ID',
  'tradingAccounts.filterClientHint': 'An exact client id — this is not a name search.',
  'tradingAccounts.clearFilters': 'Clear filters',
  'tradingAccounts.noun': 'account', // pager: "1–25 of 40 accounts"
  'tradingAccounts.nounPlural': 'accounts',
  // `leverage` is nullable — it is unset until MT5 assigns a group.
  'tradingAccounts.noLeverage': 'Not set',

  // ── Audit log (D-21) ──────────────────────────────────────────────────────
  'audit.title': 'Audit Log',
  'audit.subtitle': 'Append-only record of every admin action — who did what, to what, and when',
  'audit.allActions': 'All Actions',
  'audit.colWhen': 'When',
  'audit.colActor': 'Actor',

  // ── RBAC-03 field masking ───────────────────────────────────────────────
  // One key per sentence, never concatenated: word order and direction both
  // move in Arabic, so two keys glued together produce a sentence that reads
  // backwards in one locale and fine in the other.
  'masking.hidden': 'Hidden by your permissions',
  'masking.hiddenTitle': 'You do not have permission to see this value.',
  'masking.columnsHidden': 'Some columns are hidden by your permissions: {fields}.',
  'audit.noIp': 'no address recorded',
  'audit.colAction': 'Action',
  'audit.colSubject': 'Subject',
  'audit.colDetails': 'Details',

  // ── KYC review dialogs ────────────────────────────────────────────────────
  'kyc.approveTitle': 'Approve KYC Submission',
  'kyc.approveBody':
    'This advances {client} to verification level 1 and unlocks gated features. This cannot be undone from the admin panel.',
  'kyc.rejectBody':
    'Choose a rejection reason, flag the invalid fields, and optionally add a note. The client is emailed the reason and can correct and resubmit.',
  'kyc.rejectTitle': 'Reject KYC Submission',
  'kyc.rejectionReason': 'Rejection Reason',
  'kyc.selectReason': 'Select a reason…',
  'kyc.rejectPlaceholder': 'e.g. Passport image is blurry and date of birth has a typo…',

  // ── Pagination ────────────────────────────────────────────────────────────
  'pagination.summary': 'Showing {showing} {noun}',
  'pagination.range': 'Showing {start} to {end} of {total} {noun}',
  'pagination.summaryOfTotal': 'Showing {showing} {noun} of {total}',
  'pagination.page': 'Page {number}',
  'pagination.previous': 'Previous',
  'pagination.next': 'Next',
  'pagination.rowsPerPage': 'Rows per page:',
  // Shown when a sort covers only the rows on screen. An operator reading a
  // page-local ordering as a global one can approve the wrong withdrawal.
  'table.sortScopeNote': 'Sorted within this page only — other pages are not included.',

  // ── Clients (ADM-01) ──────────────────────────────────────────────────────
  'clients.title': 'Clients',
  'clients.subtitle': 'Filterable client base — type, status, verification level',
  'clients.allTypes': 'All Types',
  // Still rendered by `components/clients/client-filters.tsx`, which is being
  // reworked concurrently — the key stays until that call site says otherwise.
  // `clients.allCountries` is gone with the country FILTER it labelled. The
  // options were built from the rows on screen — `users.country` is free text,
  // so there was no vocabulary to offer — which meant they changed as the
  // operator paged and a country visible in the table was often one the filter
  // did not list. `clients.colCountry` stays: the COLUMN is still there.
  'clients.typeIndividual': 'Individual',
  'clients.typeReferral': 'Referral',
  'clients.typePartner': 'Partner / IB',
  'clients.allStatuses': 'All Statuses',
  'clients.statusActive': 'Active',
  'clients.statusPending': 'Pending',
  'clients.statusSuspended': 'Suspended',
  'clients.allLevels': 'All KYC Levels',
  'clients.level0': 'Level 0 — Unverified',
  'clients.level1': 'Level 1 — Verified',
  'clients.searchPlaceholder': 'Search by name, email…',
  'clients.colName': 'Name',
  'clients.colEmail': 'Email',
  'clients.colType': 'Type',
  /*
   * "Account status" rather than plain "Status", on the column AND the filter.
   *
   * The list now shows three things a reader could reasonably call a status —
   * the account state, the KYC decision, and whether the email was confirmed —
   * and the account one is the only that decides whether somebody can sign in.
   * Leaving it named "Status" invited it to be read as "verified", which is the
   * mistake that made an operator suspend the wrong client.
   */
  'clients.colStatus': 'Account status',
  'clients.allStatusesAccount': 'All account states',
  /*
   * The KYC DECISION, distinct from `clients.colKycLevel` (the tier a decision
   * granted) which this replaced on the table. A rejected submission leaves the
   * level at 0, so the level alone cannot tell "never applied" from "refused" —
   * and those are opposite pieces of work for a reviewer.
   */
  'clients.colKycStatus': 'KYC status',
  'clients.allKycStatuses': 'All KYC statuses',
  'clients.kycNotStarted': 'Not started',
  'clients.kycInProgress': 'In progress',
  'clients.kycSubmitted': 'Submitted',
  'clients.kycUnderReview': 'Under review',
  'clients.kycApproved': 'Approved',
  'clients.kycRejected': 'Rejected',
  /*
   * Email confirmation, which is NOT a KYC state — an unconfirmed address is a
   * self-service problem the client can fix themselves, while a KYC decision is
   * work queued for a reviewer. Showing them in one column would send an
   * operator chasing documents for somebody who only needs to click a link.
   */
  'clients.colEmailVerified': 'Email verified',
  'clients.allEmailVerified': 'Email verified: any',
  'clients.emailVerifiedYes': 'Verified',
  'clients.emailVerifiedNo': 'Not verified',
  'clients.colKycLevel': 'KYC Level',
  'clients.colTags': 'Tags',
  'clients.unnamed': 'Unnamed',
  'clients.tagFilterLabel': 'Tag',
  /* The "clear the tag filter" option — the select's equivalent of a second
     click on a chip, which is how the chips used to be cleared. */
  'clients.allTags': 'All tags',
  'clients.clearFilters': 'Clear filters',
  'clients.searchLabel': 'Search clients by name or email',
  'clients.levelVerified': 'L1 · Verified',
  'clients.levelUnverified': 'L0 · Unverified',
  'clients.saving': 'Saving…',
  'clients.suspend': 'Suspend',
  'clients.reactivate': 'Reactivate',
  'clients.confirmSuspendTitle': 'Suspend {email}?',
  'clients.confirmSuspend':
    'They will be logged out immediately and unable to log back in until reactivated.',
  'clients.confirmReactivateTitle': 'Reactivate {email}?',
  'clients.confirmReactivate': 'They regain access and can log in again.',
  'clients.suspendSucceeded': '{email} suspended',
  'clients.reactivateSucceeded': '{email} reactivated',
  'clients.statusFailed': 'Failed to change the client status.',
  'clients.loading': 'Loading clients',
  'clients.loadFailed': 'Failed to load clients.',
  'clients.caption': 'Client accounts',
  'clients.empty': 'No clients match the current filters.',
  'clients.nounOne': 'client',
  'clients.nounMany': 'clients',
  'tags.overflow': '+{count} more',

  // ── ADM-14 tag management ───────────────────────────────────────────────
  'nav.tags': 'Client Tags',
  'tags.title': 'Client Tags',
  'tags.subtitle':
    'Labels for segmenting the client base. A tag can also define which clients an administrator is allowed to see.',
  'tags.colTag': 'Tag',
  'tags.colSlug': 'Link name',
  'tags.colDescription': 'Description',
  'tags.colClients': 'Clients',
  'tags.colActions': 'Actions',
  'tags.clientCount': '{count} clients',
  'tags.create': 'New tag',
  'tags.createTitle': 'Create a client tag',
  'tags.createHint':
    'The link name is derived from the label and never changes afterwards, so saved filter links keep working.',
  'tags.editTitle': 'Edit tag',
  'tags.edit': 'Edit',
  'tags.editAria': 'Edit {label}',
  'tags.delete': 'Delete',
  'tags.deleteAria': 'Delete {label}',
  'tags.confirmDeleteTitle': 'Delete the tag "{label}"?',
  'tags.confirmDelete':
    'It is on {count} client(s) and will be removed from all of them. Any administrator restricted to this tag would lose that restriction, so the server refuses while anyone is scoped to it.',
  'tags.deleteSucceeded': 'Tag "{label}" deleted',
  'tags.saveSucceeded': 'Tag "{label}" saved',
  'tags.deleteFailed': 'Failed to delete the tag.',
  'tags.labelField': 'Label',
  'tags.labelPlaceholder': 'High risk',
  'tags.slugFixed': 'Link name stays {slug} — saved /clients?tag= links keep working.',
  'tags.colourField': 'Colour',
  'tags.colourPreview': 'Preview:',
  'tags.previewPlaceholder': 'Tag',
  'tags.descriptionField': 'Description',
  'tags.descriptionPlaceholder': 'What this segment is for',
  'tags.save': 'Save changes',
  'tags.saving': 'Saving…',
  'tags.saveFailed': 'Failed to save the tag.',
  'tags.loading': 'Loading tags',
  'tags.loadFailed': 'Failed to load tags.',
  'tags.caption': 'Client tags',
  // ── FR-ADM-01 client profile ────────────────────────────────────────────
  // ── RBAC-07 visibility panels ───────────────────────────────────────────
  'roles.createSucceeded': 'Role “{name}” created',
  'roles.saveSucceeded': 'Role “{name}” saved',
  'roles.deleteSucceeded': 'Role “{name}” deleted',
  'roles.maskSection': 'Client field visibility',
  'roles.maskSummary': '{count} field(s) hidden',
  'roles.maskSummaryNone': 'Nothing hidden',
  'roles.maskHint':
    'Fields holders of this role cannot see. The value is removed from the API response, not just from the screen — and it applies everywhere, including the KYC review.',

  'adminUsers.scopeSection': 'Client scope',
  'adminUsers.scopeSummary': '{count} tag(s)',
  // Said in words, because both readings of an empty scope are plausible and
  // one of them is a data breach.
  'adminUsers.scopeSummaryAll': 'All clients',
  'adminUsers.scopeHint':
    'Restrict this administrator to clients carrying the selected tags. Everything about those clients — their KYC, withdrawals, ledger and documents — follows the same restriction.',
  'adminUsers.scopeTagHint': '{count} clients',
  'adminUsers.scopeNoTags': 'No tags exist yet. Create one on the Client Tags screen.',
  // The select adds one tag at a time; the chosen ones sit beneath it as chips.
  'adminUsers.scopeTagAdd': 'Add a tag…',
  'adminUsers.scopeTagRemove': 'Remove {label}',
  'adminUsers.scopeTagsAllChosen': 'Every tag is already on this administrator.',
  'adminUsers.scopeTagsNoneChosen': 'No tags chosen.',
  'adminUsers.scopeEmptyWarning':
    'No tags selected means UNRESTRICTED — this administrator can see every client in the system.',
  'adminUsers.maskSection': 'Field visibility',
  'adminUsers.maskSummary': '{count} field(s) hidden',
  'adminUsers.maskSummaryNone': 'Nothing hidden',
  'adminUsers.maskSummaryInherited': 'Inherits the role',
  'adminUsers.maskInheriting':
    'This administrator follows their role. Ticking a field here creates a personal override.',
  'adminUsers.maskOverriding':
    'This administrator has a personal override and no longer follows their role.',
  'adminUsers.maskResetToRole': 'Clear the override and follow the role again',
  'adminUsers.masterExempt':
    'The master admin sees every client and every field, without exception (FR-RBAC-01).',
  'adminUsers.colScope': 'Client scope',
  'adminUsers.scopeAll': 'All clients',
  'adminUsers.scopeCount': '{count} tag(s)',
  'adminUsers.maskCount': '{count} hidden',

  'clientProfile.back': 'Back to clients',
  'clientProfile.loading': 'Loading client',
  'clientProfile.loadFailed': 'Failed to load this client.',
  'clientProfile.notFoundTitle': 'This client is not available',
  // ONE message for two causes, deliberately. Distinguishing "no such client"
  // from "outside your client scope" would let a restricted administrator
  // enumerate the client base by trying ids and reading the difference.
  'clientProfile.notFoundBody':
    'It may not exist, or it may be outside the client groups your account is allowed to see.',
  'clientProfile.sectionIdentity': 'Identity',
  'clientProfile.sectionTags': 'Tags',
  'clientProfile.sectionKyc': 'Verification',
  'clientProfile.sectionDocuments': 'Documents',
  'clientProfile.sectionTrading': 'Trading accounts',
  'clientProfile.sectionReferrals': 'Referrals',
  'clientProfile.fieldPhone': 'Phone',
  'clientProfile.kycStatus': 'Status',
  'clientProfile.kycSubmitted': 'Submitted',
  'clientProfile.openKycReview': 'Open the KYC review →',
  'clientProfile.kycHidden': 'Verification status is hidden by your permissions.',
  // The most important of the four. A compliance reviewer shown no documents
  // concludes none were uploaded, which is a claim about the client rather than
  // about the reviewer.
  'clientProfile.documentsHidden': 'Documents are hidden by your permissions.',
  'clientProfile.tradingHidden': 'Trading accounts are hidden by your permissions.',
  'clientProfile.referralsHidden': 'Referral relationships are hidden by your permissions.',
  'clientProfile.noKyc': 'This client has not started verification.',
  'clientProfile.noDocuments': 'No documents uploaded.',
  'clientProfile.noTradingAccounts': 'No trading accounts yet.',
  'clientProfile.noTagsAvailable': 'No tags exist yet. Create one on the Client Tags screen.',

  // ── The client's wallets, on their profile ────────────────────────────────
  'clientProfile.walletsTitle': 'Wallets',
  'clientProfile.noWallets': 'This client holds no wallets.',
  'clientProfile.walletOpen': 'Open wallet',
  'clientProfile.walletOpening': 'Opening…',
  'clientProfile.walletCurrencyPlaceholder': 'Currency',
  'clientProfile.tagAdded': 'Tag “{label}” added',
  'clientProfile.tagRemoved': 'Tag “{label}” removed',
  'clientProfile.tagFailed': 'Could not change that tag.',
  'clientProfile.walletOpenFailed': 'Could not open the wallet.',
  // Named per currency: several identical bins down a list announce as "button"
  // with nothing to say which wallet each one closes.
  'clientProfile.walletClose': 'Close the {currency} wallet',
  // States the rule up front, so the operator learns it from the control rather
  // than from a refusal after pressing it.
  'clientProfile.walletCloseHint': 'Only an empty, unused wallet can be closed.',
  'clientProfile.walletCloseFailed': 'Could not close the wallet.',
  'clientProfile.parentIb': 'Introduced by',
  'clientProfile.noParentIb': 'Not introduced by a partner.',
  'clientProfile.referredClients': 'Clients introduced',
  'clientProfile.noReferrals': 'No clients introduced.',
  'clientProfile.attributionInactive': 'inactive',
  'tags.empty': 'No tags yet. Create one to start segmenting the client base.',
  'clients.colCountry': 'Country',
  'clients.colCreated': 'Created',
  'clients.colActions': 'Actions',

  // ── Commission plans (ADM-10 / IB-06) ─────────────────────────────────────
  'plans.title': 'Commission Plans',
  'plans.newPlan': 'New Plan',
  'plans.inactive': 'Inactive',
  'plans.notSelectable': 'Not selectable',
  'plans.method': 'Method',
  'plans.commission': 'Commission',
  'plans.clientRebate': 'Client rebate',
  'plans.settlementWindow': 'Settlement window',
  'plans.viewOnly': 'View only',
  'plans.name': 'Plan name',
  'plans.namePlaceholder': 'e.g. Standard IB',
  'plans.position': 'Ladder position',
  'plans.description': 'Description',
  'plans.descriptionPlaceholder': 'Who this tier is for',
  'plans.commissionMethod': 'Commission method',
  'plans.rebateValue': 'Client rebate value',
  'plans.twoLevelSplit': 'Two-level split',
  'plans.windowHours': 'Settlement window (hours)',
  'plans.windowHint': 'How long accruals wait before they are confirmed and credited.',
  'plans.rebateOnClose': 'Credit rebate on deal close',
  'plans.rebateOnCloseHint': 'Skips the settlement window for the client rebate.',
  'plans.selectable': 'IBs may select this plan',
  'plans.confirmHint': 'Check this with the client before saving.',
  'plans.modeCommission': 'Commission only',
  'plans.modeRebate': 'Rebate only',
  'plans.modeHybrid': 'Hybrid',
  'plans.methodSpread': 'Share of spread (%)',
  'plans.methodPerLot': 'Per lot',
  'plans.methodFixed': 'Fixed per deal',

  // ── Admin dashboard ───────────────────────────────────────────────────────
  'adminDashboard.title': 'Dashboard',
  'adminDashboard.subtitle': 'Back-office overview',
  'adminDashboard.kycQueue': 'KYC Review Queue',
  'adminDashboard.viewAll': 'View all',
  'adminDashboard.kycQueueFailed': 'Failed to load the KYC queue.',
  'adminDashboard.kycQueueEmpty': 'No submissions waiting for review.',
  'adminDashboard.comingOnline': 'Coming Online',
  'adminDashboard.pendingKyc': 'Pending KYC',
  'adminDashboard.totalClients': 'Total Clients',
  'adminDashboard.activePartners': 'Active Partners',
  'adminDashboard.pendingWithdrawals': 'Pending Withdrawals',

  // ── Invite ────────────────────────────────────────────────────────────────
  'invite.title': 'Invite Admin',
  // The CREATE flow, in a modal on the directory. Its keys are separate from
  // the ACCEPT flow's above (`invite.submit` is "Activate Account" there, and
  // `invite.failed` is about accepting) — one invite noun, two screens, and
  // sharing a key between them would put the invitee's wording on the
  // administrator's button.
  'invite.modalHint':
    'They receive an activation email and set their own password. The link expires after 48 hours.',
  'invite.createSubmit': 'Send invite',
  'invite.creating': 'Sending…',
  'invite.createFailed': 'Failed to create the invite.',
  'invite.bothRequired': 'A name and an email address are both required.',
  // A role is REQUIRED: sending none makes the API fall back to a built-in
  // permission list and create an administrator with no role at all.
  'invite.roleRequired': 'Choose the role this administrator will hold.',
  'invite.rolePlaceholder': 'Choose a role…',
  'invite.noRoles':
    'No assignable role exists yet. Create one on the Roles screen before inviting an administrator.',
  'invite.invalidEmail': 'Enter a valid email address.',
  'invite.copyFailed': 'Could not copy automatically — select the link and copy it manually.',
  'invite.sentNote': 'Invitation email sent. You can also share the link directly:',
  'invite.sendAnother': 'Send another invite',
  'invite.fullName': 'Full Name',
  'invite.email': 'Email Address',
  'invite.defaultRole': 'Default (KYC review + client list)',
  'invite.namePlaceholder': 'Jane Smith',
  'invite.emailPlaceholder': 'jane@oxshare.com',
  'invite.loadingParams': 'Loading invite parameters…',

  // ── KYC review ────────────────────────────────────────────────────────────
  'kycReview.title': 'KYC Submissions',
  'kycReview.searchPlaceholder': 'Search by name or email…',
  'kycReview.review': 'Review',
  'kycReview.colUser': 'User',
  'kycReview.colCountry': 'Country',
  'kycReview.colStatus': 'Status',
  'kycReview.colSubmitted': 'Submitted',
  'kycReview.colReviewed': 'Reviewed',
  'kycReview.colAction': 'Action',
  'kycReview.filterAll': 'All',
  'kycReview.filterUnderReview': 'Under Review',
  'kycReview.filterApproved': 'Approved',
  'kycReview.filterRejected': 'Rejected',
  'kycReview.backToList': 'Back to KYC list',
  'kycReview.personalInfo': 'Personal Information',
  'kycReview.notSubmitted': 'Not submitted',
  'kycReview.documentType': 'Document Type',
  'kycReview.flaggedFields': 'Flagged Fields for Correction:',
  'kycReview.timeline': 'Timeline',
  'kycReview.reviewed': 'Reviewed',
  'kycReview.decision': 'Review Decision',
  'kycReview.claim': 'Claim for review',
  'kycReview.openDirectly': 'Open directly',
  'kycReview.notUploaded': 'Not uploaded',
  'kycReview.historyTitle': 'Previous attempts ({count})',
  'kycReview.attemptNo': 'Attempt {n}',
  'kycReview.rotate': 'Rotate',
  'kycReview.zoomIn': 'Zoom in',
  'kycReview.zoomOut': 'Zoom out',
  'kycReview.previousDoc': 'Previous document',
  'kycReview.nextDoc': 'Next document',
  // Plural-naive on purpose: the catalogue has no plural machinery yet, and
  // inventing one for a single string would be the wrong place to start.
  'kycReview.waitingDays': 'waiting {days}d',
  'kycReview.openFullSize': 'Open full size in a new tab',
  'kycReview.docPassport': 'Passport (photo & signature page)',
  'kycReview.docIdFront': 'ID document (front)',
  'kycReview.docIdBack': 'ID document (back)',
  'kycReview.docSelfie': 'Selfie verification',
  'kycReview.docAddress': 'Proof of address',
  // Signals a reviewer needs that the API was already sending and the screen
  // never rendered — a brand-new account and a two-year-old one looked identical.
  'kycReview.accountLabel': 'Account',
  'kycReview.accountAge': 'Account created',
  'kycReview.emailStatus': 'Email',
  'kycReview.emailVerified': 'Verified',
  'kycReview.emailUnverified': 'Not verified',
  'kycReview.country': 'Country',
  'kycReview.loading': 'Loading KYC submission…',
  'kycReview.notFound': 'Submission not found.',
  'kycReview.loadFailed': 'Failed to load the submission. Check your connection and try again.',
  'kycReview.approveFailed': 'Failed to approve the submission. Please try again.',
  'kycReview.claimFailed': 'Failed to claim the submission for review.',
  'kycReview.rejectFailed': 'Failed to reject the submission. Please try again.',
  'kycReview.claimHint':
    'Marks this submission as under review by you, so another admin does not review it at the same time',
  // The status pill used to render `status.replace('_', ' ')` — English by
  // accident, and untranslatable by construction.
  'kycStatus.not_started': 'Not started',
  'kycStatus.in_progress': 'In progress',
  'kycStatus.submitted': 'Submitted',
  'kycStatus.under_review': 'Under review',
  'kycStatus.approved': 'Approved',
  'kycStatus.rejected': 'Rejected',

  // ── KYC workflow builder ──────────────────────────────────────────────────
  'builder.confirmResetTitle': 'Reset every KYC step to the defaults?',
  'builder.confirmResetBody':
    'This discards the current onboarding configuration on the server, not just your unsaved edits. Clients partway through onboarding answer the default steps from their next visit.',
  'builder.confirmDeleteStepTitle': 'Delete the step “{title}”?',
  'builder.confirmDeleteStepBody':
    'It is removed from the draft only. Nothing changes for clients until you save.',
  'builder.section': 'KYC Management',
  'builder.title': 'KYC Onboarding Workflow Builder',
  'builder.resetDefaults': 'Reset Defaults',
  'builder.addCustomStep': 'Add Custom Step',
  'builder.required': 'Required',
  'builder.stepTitle': 'Step Title',
  'builder.stepDescription': 'Description / Instructions',
  'builder.fieldsHint': 'Configure field labels, input types, and requirement flags.',
  'builder.addField': 'Add Field',
  'builder.fieldLabel': 'Field Label',
  'builder.keyName': 'Key Name',
  'builder.inputType': 'Input Type',
  'builder.typeText': 'Text Input',
  'builder.typeDate': 'Date Picker',
  'builder.typePhone': 'Phone Input',
  'builder.typeSelect': 'Dropdown Select',
  'builder.typeFile': 'File Uploader',
  'builder.typeCamera': 'Live Camera',
  'builder.typeCheckbox': 'Checkbox',
  'builder.newStepTitle': 'Add Custom Onboarding Step',
  'builder.newStepBody': 'Create a new step for your KYC verification flow.',
  'builder.urlSlug': 'URL Slug',
  'builder.guidance': 'Description / Guidance',
  'builder.addStep': 'Add Step',
  'builder.titlePlaceholder': 'e.g., Employment & Tax Declaration',
  'builder.slugPlaceholder': 'e.g., employment (optional)',
  'builder.guidancePlaceholder':
    'e.g., Provide details about your employment status and source of funds.',
  'builder.newField': 'New Field',

  // ── Roles (/roles) ────────────────────────────────────────────────────────
  // RBAC-01/02. Was the "Roles" tab of /settings until the three concerns were
  // split into their own routes: defining roles, holding them, and network
  // access are separate jobs and were only ever one page by accident.
  // Just "Roles". The page defines roles; that permissions are what a role is
  // made of does not need saying in the title, and the sidebar entry, the page
  // heading and the route now all read the same word.
  'roles.title': 'Roles',
  'roles.noDescription': 'No description',
  'roles.rowActions': 'Actions for {name}',
  'roles.empty': 'No roles yet.',
  'roles.emptyHint': 'Create one to describe what a group of admins may do.',
  // Column headers, added when the row stack became a DataTable. The row
  // components carried no headers — a stacked row labels itself by layout — so
  // these are the one thing the conversion genuinely had to name.
  'roles.caption': 'Custom roles',
  'roles.colName': 'Role',
  'roles.colDescription': 'Description',
  'roles.colPermissions': 'Permissions',
  'roles.colActions': 'Actions',
  // Delete confirmation. Names the role and states the one thing that blocks
  // the delete, because "still assigned" is the failure an operator hits.
  'roles.deleteTitle': 'Delete “{name}”?',
  'roles.deleteBody':
    'This cannot be undone. Any admin still holding this role must be reassigned first, or the delete is refused.',
  'roles.deleting': 'Deleting…',
  // ── Create / edit, now their own pages rather than a modal ────────────────
  'roles.newTitle': 'New role',
  'roles.newSubtitle': 'Name it, then choose what it may do and what it may see.',
  'roles.editTitle': 'Edit {name}',
  'roles.editSubtitle': 'Changes apply to every admin holding this role on their next request.',
  'roles.backToRoles': 'Back to roles',
  'roles.saveNew': 'Create role',
  'roles.saveEdit': 'Save changes',
  'roles.saving': 'Saving…',
  'roles.notFound': 'That role no longer exists.',
  'roles.systemReadOnly': 'System roles cannot be edited.',
  'roles.loadFailed': 'Failed to load roles.',
  'roles.saveFailed': 'Failed to save the role. Please try again.',
  'roles.deleteFailed': 'Failed to delete the role.',

  // ── Admin users (/admin-users) ────────────────────────────────────────────
  'adminUsers.title': 'Admin Users',
  'adminUsers.subtitle':
    'Back-office accounts and the role each one holds. Roles themselves are defined under Roles & Permissions.',
  'adminUsers.rolesLink': 'Manage roles',
  'adminUsers.editTitle': 'Edit Administrator',
  'adminUsers.nameLabel': 'Full Name',
  'adminUsers.accessLabel': 'Role',
  // Only reachable on an account that predates roles being mandatory here — a
  // real state, and one an operator should be prompted to fix rather than left
  // to read as an empty control.
  'adminUsers.rolePlaceholder': 'Choose a role…',
  'adminUsers.roleHint':
    'Permissions come from the role and follow it — editing the role changes this administrator too.',
  'adminUsers.edit': 'Edit',
  'adminUsers.sendResetLink': 'Send reset link',
  'resetPassword.title': 'Set a new password',
  'resetPassword.subtitle':
    'Choose a new password for your OxShare Admin account. This signs you out everywhere else.',
  'resetPassword.newPassword': 'New password',
  'resetPassword.confirmPassword': 'Confirm new password',
  'resetPassword.submit': 'Set password',
  'resetPassword.saving': 'Setting…',
  'resetPassword.mismatch': 'Those two passwords do not match.',
  'resetPassword.failed': 'Could not set that password. Please try again.',
  'resetPassword.doneTitle': 'Password set',
  'resetPassword.doneBody':
    'Your password has been changed and every other session has been signed out. Sign in to continue.',
  'resetPassword.goToSignIn': 'Go to sign in',
  'resetPassword.backToSignIn': 'Back to sign in',
  'resetPassword.noTokenTitle': 'This link is incomplete',
  'resetPassword.noTokenBody':
    'Open the link from your email exactly as it was sent. If it has expired, ask an administrator to send another.',
  'adminUsers.confirmSendResetTitle': 'Email {name} a password reset link?',
  'adminUsers.confirmSendReset':
    'The link is single-use and expires in an hour. Using it signs them out everywhere.',
  'adminUsers.confirmSendResetAction': 'Send link',
  'adminUsers.resetSent': 'Reset link sent.',
  'adminUsers.roleChanged': '{name} is now {role}',
  'adminUsers.roleFailed': 'Could not change the administrator’s role.',
  'adminUsers.saveSucceeded': '{name} saved',
  /*
   * The ACTION is named for what it does to access; the STATE keeps the API's
   * own word.
   *
   * Revoking an administrator is this, and there is no delete: every
   * `audit_log` row points at an admin id, so removing the account would
   * orphan the trail of every decision that account ever made. Suspension takes
   * the access away on the next request and is reversible, which is the whole
   * reason it exists instead of a delete — the control just now says so.
   *
   * `statusSuspended` deliberately does NOT follow the rename: `status` is
   * `'suspended'` on the wire and in the database, and inventing a second word
   * for it in the one column an operator scans would mean the screen and the
   * API describe the same account differently.
   */
  'adminUsers.suspend': 'Revoke access',
  'adminUsers.reactivate': 'Restore access',
  'adminUsers.statusSuspended': 'Suspended',
  'adminUsers.confirmSuspendTitle': 'Revoke {name}’s access?',
  'adminUsers.confirmSuspend':
    'They are signed out on their next request and cannot log in until access is restored. The account and its audit trail are kept.',
  'adminUsers.confirmReactivateTitle': 'Restore {name}’s access?',
  'adminUsers.confirmReactivate': 'They regain the access listed here.',
  'adminUsers.suspendSucceeded': '{name}’s access revoked',
  'adminUsers.reactivateSucceeded': '{name}’s access restored',
  'adminUsers.statusFailed': 'Could not change the administrator status.',
  'adminUsers.resetFailed': 'Could not send the reset link.',
  'adminUsers.colActions': 'Actions',

  // Outstanding invites — sent, not yet accepted. They are rows in the
  // DIRECTORY now rather than a panel of their own, so these describe a row.
  'adminUsers.pendingHint':
    'Sent but not yet accepted. The link creates an administrator account, so revoke one that went to the wrong address.',
  'adminUsers.statusPending': 'Invite pending',
  'adminUsers.pendingExpires': 'Link expires {date}',
  // An invite may carry no role: the invitee is given individual permissions
  // after they accept. Said in words rather than left as a blank cell.
  'adminUsers.pendingRoleUnset': 'Set after accepting',
  'adminUsers.scopeAfterAccept': 'After accepting',
  'adminUsers.revoke': 'Revoke',
  'adminUsers.confirmRevokeTitle': 'Revoke the invite for {email}?',
  'adminUsers.confirmRevoke':
    'The link stops working immediately. You can send a new one afterwards.',
  'adminUsers.revokeSucceeded': 'Invite for {email} revoked',
  'adminUsers.revokeFailed': 'Could not revoke the invite.',

  // ── Settings / RBAC ───────────────────────────────────────────────────────
  // /settings is a four-tab screen: General, Email, Platforms, Security. Roles
  // and the admin directory stay on their own routes — see roles.* and
  // adminUsers.* above. The settings.* keys below are still shared by the RBAC
  // components (role-card, role-form-modal), which those pages render.
  'settings.title': 'Settings',
  'settings.subtitle':
    'The terms clients open trading accounts on, how mail is delivered, and the downloads this platform offers.',

  // ── Settings tabs ─────────────────────────────────────────────────────────
  'settings.tabEmail': 'Email',
  'settings.tabTrading': 'Trading',
  'settings.tabPlatforms': 'Platforms',
  'settings.tabSecurity': 'Security',
  'settings.masterOnly': 'Master admin only',

  // ── Trading tab ───────────────────────────────────────────────────────────
  'tradingSettings.title': 'Account opening',
  'tradingSettings.subtitle':
    'The terms a client may open a trading account on, from the portal. These take effect on the next account opened; accounts already open are untouched.',
  'tradingSettings.loading': 'Loading trading settings',
  'tradingSettings.loadFailed': 'Could not load the trading settings.',
  'tradingSettings.leverages': 'Leverages offered',
  'tradingSettings.leveragesHint':
    'Comma-separated, in the order clients see them. MT5 still clamps to the group’s own maximum.',
  'tradingSettings.maxLiveAccounts': 'Live accounts per client',
  'tradingSettings.maxLiveAccountsHint':
    'How many a client may open themselves. 0 stops new live accounts without touching existing ones.',
  'tradingSettings.maxDemoAccounts': 'Demo accounts per client',
  'tradingSettings.maxDemoAccountsHint':
    'Same, for practice accounts. Every one is a real row on the broker’s server.',
  'tradingSettings.maxDemoDeposit': 'Largest demo starting balance',
  'tradingSettings.maxDemoDepositHint':
    'A client asking for more gets this instead. Practice with position sizes nobody would really trade teaches nothing.',
  'tradingSettings.ibCap': 'Maximum paid to partners (%)',
  'tradingSettings.ibCapHint':
    'The most of its own revenue on a trade the broker will pay out across the whole partner chain. Partner level rates each take a share of the full revenue, so they add up — this caps the total and scales it proportionally. 100 means the broker keeps nothing.',
  'tradingSettings.readOnly': 'You do not have permission to change these.',
  'tradingSettings.updateFailed': 'Could not save the trading settings.',
  'tradingSettings.save': 'Save changes',
  'tradingSettings.saving': 'Saving...',
  'tradingSettings.saved': 'Saved',

  // ── Products tab ──────────────────────────────────────────────────────────
  'products.title': 'Products',
  'products.pageTitle': 'Products',
  'products.editTitle': 'Edit product',
  'products.createTitle': 'Add product',
  'products.saving': 'Saving...',
  'products.orderHint': 'Lower comes first in the client’s list.',
  'products.saveSucceeded': '{name} saved',
  'products.deleteSucceeded': '{name} deleted',
  'products.enabledSucceeded': '{name} is now active',
  'products.disabledSucceeded': '{name} is now inactive',
  'products.confirmDeleteTitle': 'Delete {name}?',
  'products.confirmDelete':
    'This cannot be undone, and it is refused while any agency still sells it. Making it inactive stops it being offered and leaves open accounts trading — that is usually what is wanted.',
  'products.enable': 'Activate',
  'products.disable': 'Deactivate',
  'products.groupsExplainer':
    'One group per currency, per environment. A group fixes both, and an account points at exactly one — so a product sold live and demo in two currencies needs four. Detaching one leaves accounts already in it trading.',
  'products.colName': 'Product',
  'products.colDescription': 'Description',
  'products.colGroups': 'Groups',
  'products.colCurrencies': 'Currencies',
  'products.colOrder': 'Order',
  'products.colStatus': 'Status',
  'products.statusActive': 'Active',
  'products.statusInactive': 'Inactive',
  // A group added in this form but not yet written — it lands on Save.
  'products.pending': 'on save',
  'products.alreadyAdded': 'already added',
  'products.subtitle':
    'What the broker sells. Each product is backed by MT5 groups — one per currency, per environment — and a product with no group cannot be opened by anybody.',
  'products.readOnly': 'You do not have permission to change these.',
  'products.loading': 'Loading products',
  'products.loadFailed': 'Could not load the products.',
  'products.empty': 'No products yet. Add one, then attach the MT5 groups behind it.',
  'products.add': 'Add product',
  'products.edit': 'Edit',
  'products.delete': 'Delete product',
  'products.deleted': 'Product deleted',
  'products.deleteFailed': 'Could not delete that product.',
  'products.disabled': 'Inactive',
  'products.name': 'Name',
  'products.order': 'Order',
  'products.description': 'Description',
  'products.descriptionPlaceholder': 'Shown to clients choosing an account type.',
  'products.save': 'Save',
  'products.saved': 'Product saved',
  'products.created': 'Product created',
  'products.saveFailed': 'Could not save that product.',
  'products.cancel': 'Cancel',

  'products.groups': 'MT5 groups',
  'products.noGroups': 'No groups yet — nobody can open this product until one is attached.',
  'products.attach': 'Attach a group',
  'products.attachConfirm': 'Attach',
  'products.detach': 'Detach this group',
  'products.chooseGroup': 'Choose a group from the server',
  // Not "unavailable": the group exists, it simply belongs somewhere else, and
  // the operator needs to know which of those two it is.
  'products.claimed': 'already on another product',
  'products.groupsUnavailable':
    'Could not read the groups from MT5. The bridge may be down — attaching needs it, because the group is verified against the server.',
  'products.live': 'Live',
  'products.demo': 'Demo',

  // ── Agencies tab ──────────────────────────────────────────────────────────
  'agencies.title': 'Agencies',
  'agencies.pageTitle': 'Agencies',
  'agencies.editTitle': 'Edit agency',
  'agencies.createTitle': 'Add agency',
  'agencies.saving': 'Saving...',
  'agencies.saveSucceeded': '{name} saved',
  'agencies.deleteSucceeded': '{name} deleted',
  'agencies.openedSucceeded': '{name} is now active',
  'agencies.closedSucceeded': '{name} is now inactive',
  'agencies.confirmDeleteTitle': 'Delete {name}?',
  'agencies.confirmDelete':
    'This cannot be undone, and it is refused while any partner is appointed under it. Closing it stops new applications and leaves those partners in place — that is usually what is wanted.',
  'agencies.open': 'Activate',
  'agencies.close': 'Deactivate',
  'agencies.productsExplainer':
    'Clients introduced by a partner on this agency may open these products and nothing else. A client who came in directly is offered every product, whatever is ticked here.',
  'agencies.none': 'None',
  'agencies.colName': 'Agency',
  'agencies.colDescription': 'Description',
  'agencies.colProducts': 'Sells',
  'agencies.colStatus': 'Status',
  'agencies.statusActive': 'Active',
  'agencies.statusInactive': 'Inactive',
  'agencies.subtitle':
    'The programmes a partner is appointed under. A partner belongs to one agency, and their clients may open that agency’s products and nothing else. A client with no partner is offered everything.',
  'agencies.readOnly': 'You do not have permission to change these.',
  'agencies.loading': 'Loading agencies',
  'agencies.loadFailed': 'Could not load the agencies.',
  'agencies.empty': 'No agencies yet. Add one, then choose which products it sells.',
  'agencies.add': 'Add agency',
  'agencies.edit': 'Edit',
  'agencies.delete': 'Delete agency',
  'agencies.deleted': 'Agency deleted',
  'agencies.deleteFailed': 'Could not delete that agency.',
  'agencies.name': 'Name',
  'agencies.description': 'Description',
  'agencies.descriptionPlaceholder':
    'e.g. For partners introducing retail clients in the Gulf. Standard and ECN accounts, 70% revenue share.',
  'agencies.descriptionHint':
    'Applicants read this to decide which programme to request, so it is worth writing properly.',
  'agencies.save': 'Save',
  'agencies.saved': 'Agency saved',
  'agencies.created': 'Agency created',
  'agencies.saveFailed': 'Could not save that agency.',
  'agencies.cancel': 'Cancel',

  'agencies.products': 'Products this agency sells',
  'agencies.noProductsExist': 'No products exist yet. Create one on the Products tab first.',
  'agencies.productNoGroups': 'no MT5 group',
  'agencies.sellsNothing':
    'This agency sells nothing. Partners appointed to it will have clients who cannot open any account.',

  // ── Email tab ─────────────────────────────────────────────────────────────
  'smtp.title': 'Mail server (SMTP)',
  'smtp.subtitle':
    'How this system sends verification links, password resets, admin invitations and withdrawal codes.',
  'smtp.loading': 'Loading mail settings',
  'smtp.loadFailed': 'Could not load the mail settings.',
  'smtp.host': 'Host',
  'smtp.hostPlaceholder': 'smtp.postmarkapp.com',
  'smtp.port': 'Port',
  'smtp.username': 'Username',
  'smtp.password': 'Password',
  'smtp.passwordSetHint':
    'A password is stored. Leave empty to keep it, or type a new one to replace it.',
  'smtp.passwordNoneHint': 'No password is stored.',
  'smtp.fromAddress': 'From address',
  'smtp.secure': 'Use implicit TLS (SMTPS)',
  'smtp.save': 'Save mail settings',
  'smtp.saving': 'Saving...',
  'smtp.saved': 'Saved',
  'smtp.updateFailed': 'Could not save the mail settings.',

  // ── Payments (Rival) tab ──────────────────────────────────────────────────
  'settings.tabPayments': 'Payments',
  'rival.title': 'Payments platform (Rival)',
  'rival.subtitle':
    'Deposits and payouts route through Rival, our payments platform. Whish is integrated ' +
    'there, once — this system holds only a Rival company key.',
  'rival.loading': 'Loading the Rival connection',
  'rival.loadFailed': 'Could not load the Rival connection.',
  'rival.baseUrl': 'API base URL',
  'rival.baseUrlHint':
    'Including /v1. Staging and production are different hosts — this must be a deliberate choice.',
  'rival.apiKey': 'Company API key',
  'rival.apiKeySetHint':
    'A key is stored. Leave empty to keep it, or paste a new one to replace it.',
  'rival.apiKeyNoneHint': 'No key is stored. Paste the tsk_… key issued by Rival.',
  'rival.enabled': 'Route deposits and payouts through Rival',
  'rival.webhookTitle': 'Event webhook',
  'rival.webhookExplainer':
    'Rival announces deposits and payout decisions by signed deliveries to the endpoint below. ' +
    'Generate a signing key here, then paste the key and the endpoint into Rival’s dashboard ' +
    '(CRM configuration — it only accepts them from a signed-in owner, on purpose).',
  'rival.webhookEndpoint': 'Endpoint to paste into Rival',
  'rival.webhookEndpointUnset': 'API_PUBLIC_URL is not set on the server',
  'rival.webhookFingerprint': 'Current key fingerprint',
  'rival.webhookKeyNone': 'No key generated yet',
  'rival.lastEvent': 'Last event received',
  'rival.lastEventNever': 'Never — the pipe has not delivered yet',
  'rival.generateWebhookKey': 'Generate webhook key',
  'rival.rotateWebhookKey': 'Rotate webhook key',
  'rival.rotateWarning':
    'Rotating cuts over immediately: deliveries signed with the old key are refused until ' +
    'Rival’s dashboard is updated. The background sweep catches anything refused in the gap.',
  'rival.mintFailed': 'Could not generate a webhook key.',
  'rival.mintedTitle': 'Webhook key — shown once',
  'rival.mintedDescription':
    'Copy it now. It is stored encrypted and cannot be shown again; only its fingerprint will.',
  'rival.mintedKey': 'Signing key',
  'rival.mintedWarning':
    'Paste both values into Rival’s dashboard before closing this. Closing is the last time ' +
    'the key is visible.',
  'rival.mintedDone': 'I have pasted it into Rival',
  'rival.copy': 'Copy',
  'rival.save': 'Save connection',
  'rival.saving': 'Saving...',
  'rival.savedShort': 'Saved',
  'rival.saved': 'Rival connection saved.',
  'rival.updateFailed': 'Could not save the Rival connection.',
  'rival.test': 'Test connection',
  'rival.testFailed': 'The connection test failed.',
  'rival.testNotSet': '(not set)',
  'rival.testOkMatch': 'Key accepted. Rival delivers events to {url} — both sides agree.',
  'rival.testOkMismatch':
    'Key accepted, but the two sides disagree about the webhook:\nRival delivers to: {theirs}\n' +
    'It should be: {ours}\nUpdate Rival’s CRM configuration.',

  // ── The withdrawal desk's Rival leg ───────────────────────────────────────
  'withdrawals.rivalNeedsAttention': 'Needs attention',
  'withdrawals.rivalAwaiting': 'Awaiting Rival',
  'withdrawals.rivalReconciling': 'Submission reconciling — do not resubmit',
  'withdrawals.retrySubmission': 'Retry submission',
  'withdrawals.retrySucceeded': 'Submission retried — watch the row for the outcome.',
  'withdrawals.retryFailed': 'Could not retry the submission.',
  'withdrawals.cancelAction': 'Cancel',
  'withdrawals.cancelTitle': 'Cancel this approved withdrawal?',
  'withdrawals.cancelIntro':
    'This pulls back {amount} {currency} approved for {email} and refunds their wallet. They ' +
    'were told "approved", so the reason below is emailed to them.',
  'withdrawals.cancelSubmittedNote':
    'This payout was already submitted to Rival. It will be cancelled there first — if Rival ' +
    'is already paying it, cancellation is refused and nothing changes; act on the outcome ' +
    'instead.',
  'withdrawals.cancelNote': 'Note (optional if a reason is selected)',
  'withdrawals.cancelling': 'Cancelling…',
  'withdrawals.confirmCancellation': 'Cancel the withdrawal',
  'withdrawals.cancelSucceeded': 'Withdrawal of {amount} cancelled and refunded.',
  'withdrawals.cancelFailed': 'Could not cancel the withdrawal.',
  'withdrawals.settleFallbackHint':
    'Normally settles automatically when Rival pays out. Settle manually only if the event ' +
    'pipe is down.',
  'settings.rolesTitle': 'Configured System & Custom Roles',
  'settings.rolesHint':
    'Permissions defined in permissions.json are mapped dynamically to custom roles.',
  'settings.createRole': 'Create Custom Role',
  'settings.directoryTitle': 'Admin Account Directory',
  'settings.directoryHint':
    'Create and manage back-office administrator accounts with assigned RBAC roles.',
  'settings.colAdministrator': 'Administrator',
  'settings.colEmail': 'Email Address',
  'settings.colRole': 'System Role',
  'settings.colStatus': 'Status',
  'settings.systemRole': 'System Role',
  'settings.roleName': 'Role Name',
  'settings.roleNamePlaceholder': 'e.g. Financial Auditor',
  'settings.roleDescription': 'Description',
  'settings.roleDescriptionPlaceholder': 'Short summary of access scope',

  // ── Counts and labels that were assembled from fragments ──────────────────
  //
  // Every key here replaces a "Label (" + {count} + ")" or a count + noun built
  // from separate JSX children. Word order and plural agreement both move
  // between languages, so those shapes were untranslatable — see the header of
  // this file.
  'plans.subtitle':
    'IB programs and their rates. Set the L1/L2 split, the commission method, the settlement window and rebate timing here — no deploy needed.',
  'plans.rebateOnCloseWarning':
    'Rebate credits on deal close, ahead of the settlement window — pays out on trades that may still reverse, and Phase 1 has no clawback.',
  'plans.commissionValueLabelPct': 'Commission value (% of spread)',
  'plans.commissionValueLabelAmt': 'Commission value (amount)',
  'plans.shareTotalValue': 'total {total}%',
  'plans.shareTotalExceeds': 'total {total}% — exceeds 100%',
  'plans.l2NoteLong':
    'Resolution stops at L2 — an IB three levels above a trading client earns nothing. Any remainder below 100% stays with the broker.',
  'plans.rebateWarningLong':
    'Crediting the rebate on close pays out on trades that may later reverse, and Phase 1 has no clawback. ARCHITECTURE §12.8 recommends keeping both legs behind the same settlement window.',
  'plans.commissionValueLabel': 'Commission value',
  'plans.l2NoteFull': 'Resolution stops at L2 — an IB three levels up earns nothing.',
  'plans.tier': 'Tier {position}',
  'plans.mode': 'Mode',
  'plans.split': 'L1 / L2 split',
  'plans.splitValue': '{l1}% / {l2}%',
  'plans.windowValue': '{hours}h',
  'plans.rebateOnCloseNote': 'Rebate credits on deal close',
  'plans.edit': 'Edit',
  'plans.commissionValue': 'Commission value',
  'plans.shareTotal': '{total} total',
  'plans.l1Share': 'L1 share (%)',
  'plans.l2Share': 'L2 share (%)',
  'plans.l2Note': 'Resolution stops at L2 — an IB three levels up earns nothing.',
  'plans.rebateWarning':
    'Crediting the rebate on close pays out on trades that may need reversing, and Phase 1 has no clawback.',

  'adminDashboard.statsSubtitle':
    'Client, partner, and withdrawal metrics activate automatically once their backend endpoints exist. The missing endpoints are listed on each page and tracked in DECISIONS.md (D-28, D-31).',

  'settings.rolesCount': 'Dynamic Roles ({count})',
  'settings.adminsCount': 'Admin Users ({count})',
  'settings.networkTab': 'Network Access',
  'settings.you': '(you)',
  'settings.assignedPermissions': 'Assigned Permissions ({count})',
  'settings.permissionMatrix': 'Permission Matrix ({count} {noun} granted)',
  'settings.action': 'action',
  'settings.actions': 'actions',
  'settings.selectAll': 'Select all',
  'settings.clearAll': 'Clear all',

  'builder.subtitle':
    'Customize, add, edit, or disable steps and fields for client identity verification onboarding.',
  'builder.slugLockedFull': '(locked — the client flow submits by this slug)',
  'builder.noFieldsHint': 'No custom fields added yet. Click "Add Field" to configure inputs.',
  'builder.slugIdentifier': 'URL Slug Identifier',
  'builder.slugLocked': '(locked — the client portal routes on it)',
  'builder.fieldsCount': 'Form Fields ({count})',
  'builder.noFields': 'No custom fields added yet.',

  'kycReview.totalSubmissions': '{count} total submissions',
  'kycReview.rejectionReasonLabel': '❌ Rejection Reason',
  'kycReview.uploadedFiles': 'Uploaded files ({docType})',
  'kycReview.approveCta': '✓ Approve KYC',
  'kycReview.rejectCta': '✕ Reject',
  'kycReview.approvedNote': '✅ KYC has been approved.',
  'kycReview.typeLabel': 'Type',
  'kycReview.viewDocumentPdf': '📄 View Document PDF',
  'kycReview.docLoadFailed': 'Could not load document.',

  'invite.iconMail': '✉️',
  'invite.iconWarn': '⚠️',
  'invite.iconWave': '👋',
  'invite.intro': 'Invite a new admin: they set their own password from the emailed link.',
  'invite.created': '✓ Invite created!',
  'invite.role': 'Role',
  'invite.permission': 'permission',
  'invite.permissions': 'permissions',
  'invite.welcomeName': 'Welcome, {name}!',
  'invite.bodyText':
    "You've been invited to join OXShare Admin. Set your password to activate your account.",

  'table.selectedCount': '{count} {noun} selected',
  'table.row': 'row',
  'table.rows': 'rows',
  'table.close': '✕',
  'pagination.ellipsis': '…',

  'backendPending.body':
    "This page's UI is ready, but the API it needs is not implemented yet. It will light up automatically once these endpoints exist:",

  // ── Table chrome ──────────────────────────────────────────────────────────
  'table.clearSelection': 'Clear selection',
  'table.colActions': 'Actions',
  /* The row's name cell is already a link to the profile; the menu repeats it
     because a menu that offers only the destructive action reads as a trap. */
  'clients.viewProfile': 'View profile',
  /*
   * Shown where an administrator holds per-admin permissions and no role.
   * Replaces a fallback that printed the raw `master_admin` enum value into a
   * column of operator-created role names.
   */
  // Legacy accounts only. Per-person permission lists are no longer grantable
  // from this console — access is a role — so a row with none is a state to
  // fix, not a mode. It used to read "Custom permissions", which named it as an
  // option somebody had chosen.
  'adminUsers.noRole': 'No role assigned',
  /*
   * The inert footer's only sentence, on a table with no pagination.
   *
   * "Showing all N" rather than "N rows": it answers the question the greyed
   * arrows beside it would otherwise raise, which is whether there is more
   * somewhere else.
   */
  'pagination.showingAll': 'Showing all {count}',
  /*
   * The trigger names its ROW, not just "actions".
   *
   * Every row has one of these, so an accessible name of "Actions" produces a
   * column of identical announcements with no way to tell which record is about
   * to be acted on — the same failure the selection checkbox had.
   */
  'table.rowActions': 'Actions for {name}',

  // ── Export ────────────────────────────────────────────────────────────────
  'export.button': 'Export',
  'export.exporting': 'Exporting…',
  'export.csv': 'Export as CSV',
  'export.xlsx': 'Export as Excel',
  /*
   * Stated because it is the question an operator asks after clicking: did I
   * get the twenty-five rows on screen, or everything matching my filters?
   * The answer is everything, because the export is a server-side query — and
   * an export that silently returned one page would be found out during an
   * audit rather than here.
   */
  'export.scopeNote': 'Exports every row matching the current filters, not just this page.',
  'export.failed': 'Could not export. Please try again.',
  'export.empty': 'There is nothing to export.',
  /*
   * Shown in place of the button once a 404 proves the route is not built.
   * Names the state, not a failure — the `title` attribute carries the endpoint
   * so the missing route is discoverable from the UI, same as BackendPending.
   */
  'export.unavailable': 'Export not available yet',

  // ── Batch actions ─────────────────────────────────────────────────────────
  //
  // GONE, together with the machinery they labelled.
  //
  // The `batch.*` keys described a sequential-loop progress bar
  // (`hooks/use-sequential-mutation.ts`, `components/batch-actions.tsx`) driven
  // by selection checkboxes on the KYC and partner-application queues. BOTH
  // selection columns were removed on request, which left the hook, the
  // component and these strings with no call site at all — so all three were
  // deleted rather than left behind. A catalogue entry nobody renders is a
  // string somebody later rebuilds a feature around.
  //
  // Note what these never were: a bulk endpoint. Approval is one row at a time
  // on both queues (`PATCH /admin/kyc/:userId/approve`,
  // `PATCH /admin/ib/applications/:id/approve`), so the loop bought sequencing
  // and honest partial-failure reporting, never atomicity. If a real batch
  // route ever exists, these strings come back WITH it — a loop over a
  // single-row endpoint should not get them back.

  // ── Shared / generic ──────────────────────────────────────────────────────
  'common.retry': 'Try again',
  /*
   * Two labels for one action, preserved rather than unified.
   *
   * AsyncBoundary's button says "Retry"; other surfaces say "Try again". Making
   * them one string is a product decision and a visible change, and an
   * extraction pass is the wrong commit to smuggle it into — the portal's
   * equivalent change broke a test the moment the two were collapsed. Recorded
   * here so the inconsistency is visible and resolvable on purpose.
   */
  'common.retryShort': 'Retry',
  'common.loading': 'Loading',
  'auditLog.filterAllActions': 'All Actions',
  'clients.searchAria': 'Search clients by name or email',
  'kycBuilder.requiredStepTitle': 'Required by FR-CORE-15 — cannot be disabled or deleted',
  'kycBuilder.moveStepUp': 'Move Step Up',
  'kycBuilder.moveStepDown': 'Move Step Down',
  'kycBuilder.removeField': 'Remove Field',
  'kycBuilder.expandStep': 'Show step details — {name}',
  'kycBuilder.collapseStep': 'Hide step details — {name}',
  'kyc.searchAria': 'Search submissions by name or email',
  // The `ledger.*` keys went with the ledger screen. `getLedger` is back in
  // lib/api/admin.ts and the endpoint exists, but no page renders it yet, and a
  // catalogue entry with no call site is a string nobody can find.
  'login.emailPlaceholder': 'admin@oxshare.com',
  'withdrawals.rejectTitle': 'Reject Withdrawal',
  'withdrawals.markPaidTitle': 'Mark Withdrawal Paid',
  'pagination.firstTitle': 'First Page',
  'pagination.firstAria': 'Go to First Page',
  'pagination.previousTitle': 'Previous Page',
  'pagination.nextTitle': 'Next Page',
  'pagination.lastTitle': 'Last Page',
  'pagination.lastAria': 'Go to Last Page',
  'common.close': 'Close',
  'common.copy': 'Copy',
  'common.copied': 'Copied',
  'common.cancel': 'Cancel',
  'common.saving': 'Saving…',
  'common.saveChanges': 'Save Changes',
  'common.save': 'Save',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.confirm': 'Confirm',
  /*
   * Shown under a failed request, alongside the message.
   *
   * The API generates a request id, sends it in the error body and logs it with
   * the failure — and until now no screen displayed it. A user reporting "it
   * failed" gave us nothing that finds their failure in the log, so the id
   * existed for a correlation nobody could actually make.
   */
  'common.errorReference': 'Reference: {id}',
  'common.genericError': 'Something went wrong. Please try again.',
  'common.requestId': 'Reference: {id}',

  // ── Currencies (ADM) ──────────────────────────────────────────────────────
  //
  // The set of money the platform can hold. It was a Postgres enum, so adding
  // one meant a migration plus a release; it is operator data now, and this is
  // the screen that owns it.
  'nav.products': 'Products',
  'nav.agencies': 'Agencies',
  'nav.currencies': 'Currencies',
  // "Reconciliation", not "Ledger check": it is the accounting term an operator
  // on a money system already knows, and the screen answers exactly the
  // question that word asks.
  'nav.reconciliation': 'Reconciliation',
  'nav.apiKeys': 'API keys',

  // ── API keys ───────────────────────────────────────────────────────────────
  'apiKeys.title': 'API keys',
  'apiKeys.subtitle':
    'Machine credentials for the admin API. A key carries its own permissions and is not tied to any administrator’s account.',
  'apiKeys.loading': 'Loading keys…',
  'apiKeys.loadFailed': 'Could not load the API keys.',
  'apiKeys.create': 'New API key',
  'apiKeys.caption': 'API keys, newest first',
  'apiKeys.empty': 'No API keys yet.',
  'apiKeys.column.name': 'Name',
  'apiKeys.column.key': 'Key',
  'apiKeys.column.permissions': 'Permissions',
  'apiKeys.column.createdBy': 'Created by',
  'apiKeys.column.lastUsed': 'Last used',
  'apiKeys.column.expires': 'Expires',
  'apiKeys.column.status': 'Status',
  'apiKeys.status.active': 'Active',
  'apiKeys.status.revoked': 'Revoked',
  'apiKeys.status.expired': 'Expired',
  'apiKeys.never': 'Never',
  'apiKeys.revoke': 'Revoke',
  'apiKeys.revokeConfirmTitle': 'Revoke “{name}”?',
  'apiKeys.revokeConfirm':
    'Anything using this key stops working immediately, and it cannot be restored.',
  'apiKeys.revokeFailed': 'Could not revoke the key.',
  'apiKeys.revokeSucceeded': '“{name}” revoked',
  'apiKeys.createSucceeded': 'API key “{name}” created',

  // The create form.
  'apiKeys.form.title': 'New API key',
  'apiKeys.form.name': 'Name',
  'apiKeys.form.namePlaceholder': 'Nightly reporting job',
  'apiKeys.form.nameHelp': 'What this key is for. Shown in the list.',
  'apiKeys.form.permissions': 'Permissions',
  'apiKeys.form.permissionsHelp':
    'What this key may do. You can only grant permissions you hold yourself.',
  'apiKeys.form.expiry': 'Expires',
  'apiKeys.form.expiryHelp':
    'Leave unset for a key that never expires. The key stays usable through the whole of the chosen day.',
  'apiKeys.form.clearExpiry': 'Clear',
  'apiKeys.form.submit': 'Create key',
  'apiKeys.form.creating': 'Creating…',
  'apiKeys.form.cancel': 'Cancel',
  'apiKeys.form.failed': 'Could not create the key.',

  /*
   * The one-time reveal. The copy has to be unambiguous: the plaintext is not
   * stored in any recoverable form, so an operator who closes this without
   * copying has to revoke and re-issue.
   */
  'apiKeys.reveal.title': 'Copy your key now',
  'apiKeys.reveal.body':
    'This is the only time this key will be shown. It is stored as a hash, so it cannot be displayed again or recovered — if you lose it, revoke this key and create another.',
  'apiKeys.reveal.copy': 'Copy',
  'apiKeys.reveal.copied': 'Copied',
  'apiKeys.reveal.done': 'I’ve copied it',

  // ── Reconciliation (§12.2) ─────────────────────────────────────────────────
  'reconciliation.title': 'Reconciliation',
  'reconciliation.subtitle':
    'Every wallet balance checked against the sum of its own ledger entries.',
  'reconciliation.loading': 'Checking the ledger…',
  'reconciliation.loadFailed': 'Could not run the reconciliation.',
  'reconciliation.runNow': 'Run now',
  'reconciliation.running': 'Checking…',
  'reconciliation.ok.title': 'The books balance',
  'reconciliation.ok.body':
    'All {count} wallet(s) agree with their ledgers to the cent, and every confirmed accrual has been credited.',
  /*
   * The mismatch copy names the NEXT ACTION, and deliberately does not offer to
   * fix anything. A repair here would write a compensating entry for a cause
   * nobody has diagnosed — the discrepancy stops being visible without ever
   * having been explained.
   */
  'reconciliation.mismatch.title': 'The ledger and the balances disagree',
  'reconciliation.mismatch.body':
    'Investigate before making any correction. Nothing here is repaired automatically: a compensating entry written for an undiagnosed cause hides the problem instead of fixing it.',
  'reconciliation.checkedAt': 'Checked {count} wallet(s) · last run {at}',
  'reconciliation.caption': 'Wallets whose balance does not match their ledger',
  'reconciliation.empty': 'No discrepancies — every wallet matches its ledger.',
  'reconciliation.column.client': 'Client',
  'reconciliation.column.wallet': 'Wallet',
  'reconciliation.column.currency': 'Currency',
  'reconciliation.column.balance': 'Wallet balance',
  'reconciliation.column.ledgerSum': 'Ledger sum',
  'reconciliation.column.difference': 'Difference',
  // The Finance section's other entries. "Transactions" rather than
  // "Withdrawals" because that is what an operator calls the queue they work
  // down; the domain underneath is still withdrawals.
  'nav.transactions': 'Transactions',
  'nav.paymentMethods': 'Payment methods',
  'nav.wallets': 'Wallets',
  'nav.tradingAccounts': 'Trading accounts',
  'currencies.title': 'Currencies',
  'currencies.subtitle':
    'The money this platform can hold. Disabling one stops new wallets and deposits in it; existing balances stay readable.',
  'currencies.caption': 'Supported currencies',
  'currencies.loading': 'Loading currencies',
  'currencies.loadFailed': 'Could not load the currencies.',
  'currencies.empty': 'No currencies configured yet.',
  'currencies.create': 'Add currency',
  'currencies.createTitle': 'Add a currency',
  'currencies.editTitle': 'Edit currency',
  'currencies.save': 'Save',
  'currencies.saving': 'Saving…',
  'currencies.saveFailed': 'Could not save that currency.',
  'currencies.deleteFailed': 'Could not delete that currency.',

  'currencies.colCode': 'Code',
  'currencies.colName': 'Name',
  'currencies.colSymbol': 'Symbol',
  'currencies.colDecimals': 'Decimals',
  'currencies.colOrder': 'Order',
  'currencies.colStatus': 'Status',
  'currencies.colActions': 'Actions',
  'currencies.statusEnabled': 'Enabled',
  'currencies.statusDisabled': 'Disabled',
  'currencies.defaultBadge': 'Default',

  'currencies.edit': 'Edit',
  'currencies.editAria': 'Edit {code}',
  'currencies.delete': 'Delete',
  'currencies.deleteAria': 'Delete {code}',
  'currencies.enable': 'Enable',
  'currencies.disable': 'Disable',
  'currencies.makeDefault': 'Make default',
  // Names the consequence and the alternative, rather than asking "are you
  // sure" about something the API refuses outright if any wallet exists.
  'currencies.confirmDeleteTitle': 'Delete {code}?',
  'currencies.confirmDelete':
    'This is only possible while no client holds a wallet in it. To stop offering a currency that is in use, disable it instead.',
  'currencies.deleteSucceeded': '{code} deleted',
  'currencies.defaultSucceeded': '{code} is now the default currency',
  'currencies.enabledSucceeded': '{code} enabled',
  'currencies.disabledSucceeded': '{code} disabled',
  'currencies.saveSucceeded': '{code} saved',

  'currencies.code': 'Code',
  'currencies.codeHint': 'Letters and digits, e.g. EUR or USDT. Stored upper-case.',
  'currencies.codeLocked': 'The code cannot change — wallets and ledger entries reference it.',
  'currencies.name': 'Name',
  'currencies.symbol': 'Symbol',
  'currencies.decimals': 'Display decimals',
  'currencies.decimalsHint': 'How balances are shown. Storage is always 8 decimal places.',
  'currencies.order': 'Sort order',
  'currencies.orderHint': 'Lower numbers appear first, in the portal as well as here.',
  'currencies.enabled': 'Enabled',
  'currencies.enabledHint':
    'Clients can open wallets and deposit in this currency. Disabling never touches existing balances.',
  'currencies.isDefault': 'Default currency',
  'currencies.isDefaultHint':
    "The currency a new client's first wallet opens in. Exactly one currency holds this, and it must stay enabled.",

  // ── IB levels (the payout ladder) ─────────────────────────────────────────
  //
  // The wording is doing real work here. "2 levels" is naturally read as "we
  // allow 2 partners", when it means the payout chain is two hops deep — so the
  // depth hint spells the consequence out rather than restating the number.
  'nav.section.partners': 'Partners',
  'nav.section.approvals': 'Approvals',
  'nav.partnerApprovals': 'Partner Applications',
  'nav.partners': 'Partners',
  'nav.ibLevels': 'IB Levels',
  'ibLevels.title': 'IB Levels',
  'ibLevels.subtitle':
    'How far partner earnings travel, and what each level takes. The number of enabled levels is the depth of the payout chain, not a limit on how many partners you can have.',
  'ibLevels.caption': 'Partner payout ladder',
  'ibLevels.loading': 'Loading the payout ladder',
  'ibLevels.loadFailed': 'Could not load the payout ladder.',
  'ibLevels.empty':
    'No levels configured yet. Partners cannot be approved until at least one exists.',
  'ibLevels.create': 'Add level',
  'ibLevels.createTitle': 'Add a level',
  'ibLevels.editTitle': 'Edit level',
  'ibLevels.save': 'Save',
  'ibLevels.saving': 'Saving…',
  'ibLevels.saveFailed': 'Could not save that level.',
  'ibLevels.deleteFailed': 'Could not remove that level.',

  'ibLevels.depthLabel': 'Payout chain depth',
  'ibLevels.depthHint':
    'A client’s activity pays their direct partner and {depth} level(s) up the chain, then stops.',
  'ibLevels.allocatedLabel': 'Revenue share allocated',
  'ibLevels.allocatedHint': '{remaining}% of the commission pool is still unallocated.',

  'ibLevels.colLevel': 'Level',
  'ibLevels.colName': 'Name',
  'ibLevels.colModel': 'Model',
  'ibLevels.colRate': 'Rate',
  'ibLevels.colMaxDirect': 'Max direct partners',
  'ibLevels.colStatus': 'Status',
  'ibLevels.colActions': 'Actions',
  'ibLevels.statusEnabled': 'Enabled',
  'ibLevels.statusDisabled': 'Disabled',

  'ibLevels.edit': 'Edit',
  'ibLevels.editAria': 'Edit level {level}',
  'ibLevels.delete': 'Remove',
  'ibLevels.deleteAria': 'Remove level {level}',
  'ibLevels.enable': 'Enable',
  'ibLevels.disable': 'Disable',
  'ibLevels.confirmDeleteTitle': 'Remove level {level} ({name})?',
  'ibLevels.confirmDelete':
    'Partners already placed at this level keep their position, but no new partner can be placed here.',
  'ibLevels.deleteSucceeded': 'Level {level} removed',
  'ibLevels.reorderSucceeded': 'Payout chain reordered',
  'ibLevels.enabledSucceeded': 'Level {level} enabled',
  'ibLevels.disabledSucceeded': 'Level {level} disabled',
  'ibLevels.saveSucceeded': 'Level {level} saved',

  'ibLevels.level': 'Level number',
  'ibLevels.levelHint': '1 is closest to the broker. Higher numbers sit further down the chain.',
  'ibLevels.levelLocked': 'The level number cannot change — partner records reference it.',
  'ibLevels.name': 'Name',
  'ibLevels.payoutModel': 'Payout model',
  'ibLevels.modelRevenueShare': 'Revenue share',
  'ibLevels.modelPerLot': 'Per lot',
  'ibLevels.modelRevenueShareHint':
    'A percentage of the commission pool. Enabled revenue-share levels must total 100% or less between them.',
  'ibLevels.modelPerLotHint':
    'A fixed amount per standard lot traded. Not capped, and not counted against the revenue-share total.',
  'ibLevels.rate': 'Rate',
  'ibLevels.rateHintPercent': 'Percentage of the commission pool, e.g. 70 for 70%.',
  'ibLevels.rateHintPerLot': 'Amount per standard lot, in the platform default currency.',
  'ibLevels.perLotSuffix': '/lot',
  'ibLevels.perLotValue': '{value} per lot',
  'ibLevels.maxDirect': 'Max direct partners',
  'ibLevels.maxDirectHint': 'Leave empty for unlimited. Checked when a partner is approved.',
  'ibLevels.unlimitedPartners': 'Unlimited direct partners',
  'ibLevels.maxPartners': 'Up to {max} direct partners',
  'ibLevels.reorderFailed': 'The ladder could not be reordered.',
  'ibLevels.unlimited': 'Unlimited',
  'ibLevels.enabled': 'Enabled',
  'ibLevels.enabledHint':
    'A disabled level takes no share and accepts no new partners. Partners already placed there keep their position.',

  // ── Partner application review ────────────────────────────────────────────
  'partnerReview.title': 'Partner Applications',
  'partnerReview.subtitle':
    'Clients asking to introduce business. Approving one creates a partner who will be paid.',
  'partnerReview.caption': 'Partner applications',
  'partnerReview.loading': 'Loading applications…',
  'partnerReview.loadFailed': 'Could not load partner applications.',
  'partnerReview.empty': 'No applications here.',

  'partnerReview.tabPending': 'Pending',
  'partnerReview.tabApproved': 'Approved',
  'partnerReview.tabRejected': 'Rejected',
  'partnerReview.tabAll': 'All',

  'partnerReview.colApplicant': 'Applicant',
  'partnerReview.colSubmitted': 'Submitted',
  'partnerReview.colVolume': 'Expected volume (self-reported)',
  'partnerReview.colAgency': 'Applied for',
  // Not "none" — an application naming no programme leaves the partner
  // unrestricted on approval, which is the opposite of selling nothing.
  'partnerReview.noAgency': 'Not specified',
  'partnerReview.colStatus': 'Status',
  'partnerReview.colActions': 'Decision',
  'partnerReview.notGiven': 'Not given',
  'partnerReview.waitingDays': 'waiting {days} days',

  'partnerReview.statusPending': 'Pending',
  'partnerReview.statusApproved': 'Approved',
  'partnerReview.statusRejected': 'Rejected',

  'partnerReview.approve': 'Approve',
  'partnerReview.reject': 'Reject',
  'partnerReview.readOnly': 'View only',
  'partnerReview.approveSucceeded': 'Partner application approved',
  'partnerReview.rejectSucceeded': 'Partner application rejected',
  'partnerReview.approveFailed': 'The application could not be approved.',

  'partnerReview.rejectTitle': 'Reject this application',
  'partnerReview.rejectIntro':
    '{name} will be emailed the reason you give here, and it is shown on their portal.',
  'partnerReview.rejectReason': 'Reason',
  'partnerReview.rejectReasonNone': 'Choose a reason…',
  'partnerReview.rejectNote': 'Note (optional)',
  'partnerReview.rejectNotePlaceholder': 'Anything specific to this applicant.',
  'partnerReview.rejectNoteHint': 'Appended to the reason above, in the message the client reads.',
  'partnerReview.confirmReject': 'Reject application',
  'partnerReview.rejecting': 'Rejecting…',
  'partnerReview.rejectFailed': 'The application could not be rejected.',

  // ── Partners ──────────────────────────────────────────────────────────────
  // ── Commissions (the partner accrual ledger) ──────────────────────────────
  // The screen that did not exist: the engine wrote an accrual on every settled
  // deposit and nothing read one back.
  'nav.commissions': 'Commissions',
  'commissions.title': 'Commissions',
  'commissions.subtitle':
    'Every partner commission, with the deposit it was calculated from. Pending is what the engine has worked out; confirmed is what has been credited.',
  'commissions.loading': 'Loading commissions',
  'commissions.loadFailed': 'Could not load the commissions.',
  'commissions.empty': 'No commissions have been accrued yet.',
  'commissions.colDate': 'When',
  'commissions.colPartner': 'Partner (earned)',
  'commissions.colClient': 'Client (generated)',
  // The working, so a partner disputing a figure can be answered from the row.
  'commissions.colBasis': 'Deposit x rate',
  'commissions.colAmount': 'Commission',
  'commissions.colLevel': 'Level',
  'commissions.colStatus': 'Status',
  'commissions.filterStatus': 'Status',
  'commissions.filterStatusAll': 'All statuses',
  'commissions.clearFilters': 'Clear',
  'commissions.noun': 'commission',
  'commissions.nounPlural': 'commissions',
  // Calculated but NOT yet credited. Kept distinct from confirmed everywhere,
  // because quoting a partner a pending figure as though it were paid is the
  // mistake this wording exists to prevent.
  'commissions.status.pending': 'Pending',
  'commissions.status.confirmed': 'Confirmed',
  'commissions.status.reversed': 'Reversed',

  // Confirmed and pending kept apart: quoting a partner a pending figure as
  // though it were paid is the mistake this wording exists to prevent.
  'partners.colEarnings': 'Earned',
  'partners.pendingSuffix': 'pending',
  'partners.pendingHint': 'Calculated by the engine but not yet credited.',
  'partners.title': 'Partners',
  'partners.subtitle': 'Approved introducing brokers, their placement, and their referral code.',
  'partners.loading': 'Loading partners…',
  'partners.loadFailed': 'Could not load partners.',
  'partners.empty': 'No partners yet. Approved applications appear here.',
  'partners.actionFailed': 'That change could not be made.',
  'partners.levelChanged': 'Partner moved to level {level}',
  'partners.parentChangedSucceeded': 'Partner reassigned',
  'partners.parentClearedSucceeded': 'Partner moved to the top of the chain',
  'partners.suspendedSucceeded': 'Partner suspended',
  'partners.reinstatedSucceeded': 'Partner reinstated',
  'partners.linkCopied': 'Referral link copied',

  // Column headers, added when the row stack became a DataTable. The stacked row
  // ran level, referral code and placement together on one line separated by
  // dots; as columns each needs a label of its own.
  'partners.caption': 'Introducing brokers',
  'partners.colName': 'Partner',
  'partners.colEmail': 'Email',
  'partners.colLevel': 'Level',
  'partners.colAgency': 'Agency',
  // Their clients are offered every product, so this is "unrestricted" and
  // deliberately not "none" — the two read as opposites.
  'partners.noAgency': 'All products',
  'partners.colReferralCode': 'Referral code',
  'partners.colParent': 'Parent',
  'partners.colActions': 'Actions',

  'partners.levelLine': 'Level {level} — {name}',
  'partners.direct': 'Direct partner',
  'partners.hasParent': 'Has a parent partner',
  'partners.suspended': 'Suspended',

  'partners.rowActions': 'Actions for {name}',
  'partners.viewClient': 'View client',
  'partners.copyLink': 'Copy referral link',
  'partners.copyFailed': 'Could not copy the link. Open the client and copy it from there.',
  'partners.changeLevel': 'Change level',
  'partners.reassignParent': 'Reassign parent',
  'partners.suspend': 'Suspend',
  'partners.reactivate': 'Reactivate',

  'partners.changeLevelIntro': 'Move {name} to a different rung of the payout ladder.',
  'partners.level': 'Level',
  'partners.reassignIntro': 'Choose who introduced {name}, or make them a direct partner.',
  'partners.parent': 'Parent partner',
  'partners.noParent': 'No parent — deals with the broker directly',
  'partners.parentHint':
    'A partner cannot be placed beneath somebody who already sits beneath them.',
  'partners.save': 'Save',
  'partners.saving': 'Saving…',

  'partners.confirmSuspendTitle': 'Suspend this partner?',
  'partners.confirmSuspendBody':
    'They keep their referral code and everybody beneath them, and stop earning. You can reactivate them at any time.',
  'partners.confirmReactivateTitle': 'Reactivate this partner?',
  'partners.confirmReactivateBody': 'They will start earning again from their current level.',

  // ── Notifications ─────────────────────────────────────────────────────────
  // The LIVE bell — `GET /admin/notifications` and its three siblings. The
  // per-kind pairs (`kind<PascalKind>Title/Body`) mirror the backend's event
  // catalogue via `components/layout/notification-kinds.ts`; an event this
  // file has no pair for renders as `fallbackTitle`, never a raw slug.
  'notifications.open': 'Open notifications',
  'notifications.title': 'Notifications',
  'notifications.loading': 'Loading notifications',
  'notifications.loadFailed': 'Could not load notifications.',
  'notifications.emptyTitle': 'Nothing yet',
  'notifications.emptyBody': 'Alerts about work waiting on you will appear here.',
  // The PANEL's description, read by a screen reader when it opens. Distinct
  // from the trigger's label, which is an action rather than a description.
  'notifications.panelDescription': 'Recent alerts about work waiting on you.',
  'notifications.unreadCountLabel': '{count} unread',
  'notifications.markAllRead': 'Mark all as read',
  'notifications.markAllReadFailed': 'Could not mark notifications as read.',
  'notifications.itemUnread': 'Unread',
  'notifications.recentNotice': 'Showing your {count} most recent notifications.',
  'notifications.fallbackTitle': 'Notification',
  'notifications.soundOn': 'Notification sound is on',
  'notifications.soundOff': 'Notification sound is off',
  'notifications.kindWithdrawalRequestedTitle': 'Withdrawal requested',
  'notifications.kindWithdrawalRequestedBody': 'A client requested a withdrawal of {amount}.',
  'notifications.kindKycSubmittedTitle': 'KYC submitted',
  'notifications.kindKycSubmittedBody': 'A client submitted documents for review.',
  'notifications.kindPartnerAppliedTitle': 'Partner application',
  'notifications.kindPartnerAppliedBody': 'A client applied to the partner programme.',

  // ── Dashboard (GET /admin/stats/*) ────────────────────────────────────────
  //
  // Every number on this screen is a real COUNT or SUM from the stats
  // endpoints. Each section is permission-gated on the API and hidden here when
  // the caller lacks the key, so several of these strings are only ever seen by
  // some roles.
  'dashboard.subtitle': 'Platform activity at a glance', // page strapline
  'dashboard.periodLabel': 'Reporting period', // radiogroup accessible name
  'dashboard.periodDays': 'Last {days} days', // 7 / 30 / 90 preset
  'dashboard.scopedNotice':
    'These figures cover only the clients assigned to you, not the whole platform.', // `scoped: true`
  'dashboard.noSections':
    'Your role does not include any of the areas this dashboard reports on. Ask an administrator for client, verification, withdrawal or partner access.', // `sections` came back empty
  'dashboard.chartTableHint':
    'Every value in this chart is also listed in the panel beside it or in the linked queue.', // sr-only relief route
  'dashboard.refreshing': 'Updating figures…', // sr-only, during a refetch
  'dashboard.pageLoading': 'Loading dashboard', // the whole-screen gate on first load

  // Headline tiles
  'dashboard.tileTotalClients': 'Total clients',
  'dashboard.tileTotalClientsHint': 'Every client you can see',
  'dashboard.tileNewThisMonth': 'New this month',
  'dashboard.tileNewThisMonthHint': '{today} today · {week} this week',
  'dashboard.tileVerified': 'Verified clients',
  'dashboard.tileVerifiedHint': '{notVerified} still unverified',
  'dashboard.tilePendingKyc': 'KYC awaiting review',
  'dashboard.tilePendingKycHint': 'Submitted and under review',
  'dashboard.tilePendingWithdrawals': 'Withdrawals pending',
  'dashboard.tilePendingWithdrawalsHint': '{amount} held',
  'dashboard.tilePartners': 'IB partners',
  'dashboard.tilePartnersHint': '{pending} applications waiting',

  // Registrations chart
  'dashboard.registrationsTitle': 'Client registrations',
  'dashboard.registrationsDescription': 'New accounts per day over the selected period',
  'dashboard.registrationsSeries': 'Registrations',
  'dashboard.registrationsTotal': '{count} registered in this period',
  'dashboard.registrationsError': 'Could not load the registration series.',
  'dashboard.registrationsLoading': 'Loading registrations',

  // KYC trend chart
  'dashboard.kycTrendTitle': 'Verification throughput',
  'dashboard.kycTrendDescription': 'Submissions against approvals — the gap is the backlog',
  'dashboard.kycSubmitted': 'Submitted',
  'dashboard.kycApproved': 'Approved',
  'dashboard.kycTrendError': 'Could not load the verification trend.',
  'dashboard.kycTrendLoading': 'Loading verification trend',

  // KYC funnel
  'dashboard.kycFunnelTitle': 'Verification stages',
  'dashboard.kycFunnelDescription': 'Where every client currently sits',
  'dashboard.kycClientsInStage': 'Clients',
  'dashboard.kycNotStarted': 'Not started',
  'dashboard.kycInProgress': 'In progress',
  'dashboard.kycStatusSubmitted': 'Submitted',
  'dashboard.kycUnderReview': 'Under review',
  'dashboard.kycStatusApproved': 'Approved',
  'dashboard.kycRejected': 'Rejected',

  // Client status donut
  'dashboard.clientSplitTitle': 'Account status',
  'dashboard.clientSplitDescription': 'How the client base divides today',
  'dashboard.statusActive': 'Active',
  'dashboard.statusPending': 'Pending',
  'dashboard.statusSuspended': 'Suspended',
  'dashboard.clientsUnit': 'Clients',
  'dashboard.noClientsYet': 'No clients yet.',

  // Withdrawal charts
  'dashboard.withdrawalVolumeTitle': 'Withdrawal volume',
  'dashboard.withdrawalVolumeDescription': 'Value requested per day, by request date',
  'dashboard.withdrawalVolumeTotal': '{amount} requested across {count} withdrawals',
  'dashboard.withdrawalValue': 'Value',
  'dashboard.withdrawalRequests': 'Requests',
  'dashboard.withdrawalVolumeError': 'Could not load withdrawal volume.',
  'dashboard.withdrawalVolumeLoading': 'Loading withdrawal volume',
  'dashboard.withdrawalStateTitle': 'Withdrawals by state',
  'dashboard.withdrawalStateDescription': 'Everything on the books, not just this period',
  'dashboard.withdrawalPending': 'Pending',
  'dashboard.withdrawalApproved': 'Approved',
  'dashboard.withdrawalSuccess': 'Paid',
  'dashboard.withdrawalFailure': 'Failed',
  'dashboard.withdrawalRejected': 'Rejected',
  'dashboard.requestCount': '{count} requests',
  'dashboard.noWithdrawalsYet': 'No withdrawals yet.',

  // Overview resource
  'dashboard.overviewError': 'Could not load the headline figures.',
  'dashboard.overviewLoading': 'Loading dashboard figures',

  // Recent KYC list
  'dashboard.recentKycTitle': 'Latest submissions',
  'dashboard.recentKycDescription': 'Newest first — open one to review it',
  // ── Profile ───────────────────────────────────────────────────────────────
  // The administrator's own account. Every string here addresses the reader as
  // the subject ("your password", "this device"), which is what distinguishes
  // this screen from the admin directory, where the same nouns mean somebody
  // else's account.
  'profile.title': 'Your profile',
  'profile.subtitle': 'Your account details, password and the devices you are signed in on.',

  'profile.identityTitle': 'Account',
  'profile.identitySubtitle':
    'Your name, address and role are set by an administrator — ask one to change them.',
  'profile.fieldName': 'Name',
  'profile.fieldEmail': 'Email',
  'profile.fieldRole': 'Role',
  'profile.fieldStatus': 'Status',
  'profile.fieldPermissions': 'Permissions',
  'profile.fieldCreated': 'Member since',
  'profile.permissionCount': '{count} granted',
  'profile.statusActive': 'Active',
  'profile.statusSuspended': 'Suspended',

  'profile.nameSave': 'Save name',
  'profile.nameSaving': 'Saving…',
  'profile.nameSavedShort': 'Saved',
  'profile.nameSaved': 'Your name has been updated.',
  'profile.nameFailed': 'Your name could not be changed.',

  'profile.photoUpload': 'Upload photo',
  'profile.photoReplace': 'Replace photo',
  'profile.photoRemove': 'Remove',
  'profile.photoHint': 'JPEG, PNG or WebP, up to 2MB.',
  'profile.photoUpdated': 'Photo updated.',
  'profile.photoRemoved': 'Photo removed.',
  'profile.photoFailed': 'That photo could not be uploaded.',
  'profile.photoRemoveFailed': 'That photo could not be removed.',
  'profile.photoTooLarge': 'That file is over 2MB. Choose a smaller one.',
  'profile.photoRemoveTitle': 'Remove your photo?',
  'profile.photoRemoveBody': 'Your initials will be shown instead. You can upload a new one later.',
  'profile.photoRemoveConfirm': 'Remove photo',

  'profile.passwordTitle': 'Password',
  'profile.passwordSubtitle':
    'Changing it signs you out everywhere else. You will stay signed in here.',
  'profile.currentPassword': 'Current password',
  'profile.newPassword': 'New password',
  'profile.confirmPassword': 'Confirm new password',
  'profile.passwordHint': 'At least 8 characters.',
  'profile.passwordTooShort': 'Use at least {min} characters.',
  'profile.passwordMismatch': 'These two do not match.',
  'profile.passwordSave': 'Change password',
  'profile.passwordSaving': 'Changing…',
  'profile.passwordChanged': 'Password changed.',
  'profile.passwordFailed': 'Your password could not be changed.',

  'profile.sessionsTitle': 'Signed in on',
  'profile.sessionsSubtitle':
    'One entry per sign-in. End any you do not recognise, then change your password.',
  'profile.sessionsLoading': 'Loading your sessions',
  'profile.sessionsFailed': 'Could not load your sessions.',
  'profile.sessionsEmpty': 'No other sessions.',
  'profile.sessionCurrent': 'This device',
  'profile.sessionMeta': 'Last active {when} · {ip}',
  'profile.sessionUnknownDevice': 'Unrecognised device',
  'profile.sessionUnknownIp': 'address not recorded',
  'profile.sessionEnd': 'Sign out',
  'profile.sessionEnded': 'That session has been signed out.',
  'profile.sessionEndFailed': 'That session could not be signed out.',
  'profile.sessionEndTitle': 'Sign out this device?',
  'profile.sessionEndBody': 'Whoever is using {device} will have to sign in again.',
  'profile.sessionEndConfirm': 'Sign it out',

  // The account menu's link to the screen above.
  'nav.profile': 'Profile',
  // ── Trading accounts: opening one, and moving its balance ─────────────────
  // These name MT5 concepts an operator has to get right, so the hints say what
  // the choice DOES rather than restating the label.
  'tradingAccounts.openTitle': 'Open a trading account',
  'tradingAccounts.open': 'Open account',
  'tradingAccounts.opening': 'Opening…',
  'tradingAccounts.openFor': 'On the MT5 server, for {client}.',
  'tradingAccounts.opened': 'Account {login} opened.',
  'tradingAccounts.openFailed': 'That account could not be opened.',
  'tradingAccounts.fieldGroup': 'MT5 group',
  'tradingAccounts.chooseGroup': 'Choose a group',
  'tradingAccounts.groupsLoading': 'Loading groups from MT5',
  'tradingAccounts.groupsFailed': 'Could not read the group list from MT5.',
  'tradingAccounts.noGroups':
    'The MT5 manager account can see no groups. The broker needs to grant it access before an account can be opened.',
  'tradingAccounts.fieldEnvironment': 'Environment',
  // Distinct from `envLive`/`envDemo` above, which are the TABLE's badges and
  // have to stay one word. In a dropdown the operator is choosing rather than
  // scanning, and the consequence of the choice is worth spelling out.
  'tradingAccounts.envLiveOption': 'Live — real money',
  'tradingAccounts.envDemoOption': 'Demo — practice money',
  'tradingAccounts.environmentHint': 'A wallet can only fund a live account.',
  'tradingAccounts.fieldLeverage': 'Leverage',
  'tradingAccounts.leveragePlaceholder': 'Group default',
  'tradingAccounts.leverageHint':
    'Leave blank for the group default. MT5 caps it to what the group allows.',

  'tradingAccounts.openedTitle': 'Account opened',
  'tradingAccounts.openedDone': 'Done',
  'tradingAccounts.credentialsEmailed':
    'The login details and passwords have been emailed to {email}.',
  'tradingAccounts.credentialsNoCopy':
    'We keep no copy of the passwords. If the client does not receive the email, an administrator has to set a new password — they cannot be looked up.',

  'tradingAccounts.balanceTitle': 'Adjust balance',
  'tradingAccounts.deposit': 'Deposit',
  'tradingAccounts.withdraw': 'Withdraw',
  'tradingAccounts.balanceFor': 'On MT5 account {login}. This does not touch the client wallet.',
  'tradingAccounts.fieldAmount': 'Amount',
  'tradingAccounts.fieldComment': 'Reason',
  'tradingAccounts.commentPlaceholder': 'Shown in the MT5 deal comment',
  'tradingAccounts.commentHint':
    'Required. This is the only explanation visible in the broker terminal.',
  'tradingAccounts.balanceConfirm': 'Apply',
  'tradingAccounts.balanceApplying': 'Applying…',
  'tradingAccounts.deposited': 'Credited {amount}. Deal {dealId}.',
  'tradingAccounts.withdrawn': 'Debited {amount}. Deal {dealId}.',
  'tradingAccounts.balanceFailed': 'That balance change did not go through.',
  'tradingAccounts.replayed': 'Already applied — the stored result was returned.',
  'tradingAccounts.liveBalance': 'Live balance',
  'tradingAccounts.rowActions': 'Actions for account {login}',
  'tradingAccounts.adjustBalance': 'Adjust balance on MT5',
  'tradingAccounts.dealerWarning':
    'This moves money on MT5 only — the client wallet and the CRM ledger are untouched. To fund an account from a wallet, use a transfer instead.',
  'tradingAccounts.noLoginHint': 'No MT5 account exists for this row, so it has no balance.',
  'tradingAccounts.cachedFootnote':
    '* Last known balance — MT5 did not answer for this account. MT5 owns the real figure.',
  'tradingAccounts.cachedHint': 'Last known. MT5 owns the real figure.',
} as const;

/** Every valid key. A typo is a compile error, never a string rendered as itself. */
export type MessageKey = keyof typeof messages;
