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
  'paymentMethods.subtitle':
    'How clients can send money in. A method with no pay-to account is not offered to them, whatever its status says.',
  'paymentMethods.create': 'Add method',
  'paymentMethods.loading': 'Loading payment methods',
  'paymentMethods.loadFailed': 'Could not load the payment methods.',
  'paymentMethods.caption': 'Configured deposit methods',
  'paymentMethods.empty': 'No payment methods configured. Clients cannot deposit until one is.',
  'paymentMethods.colKey': 'Key',
  'paymentMethods.colName': 'Name',
  'paymentMethods.colKind': 'Kind',
  'paymentMethods.colCurrency': 'Currency',
  'paymentMethods.colLimits': 'Limits',
  'paymentMethods.colStatus': 'Status',
  'paymentMethods.colActions': 'Actions',
  'paymentMethods.kindManual': 'Manual',
  'paymentMethods.kindGateway': 'Gateway',
  'paymentMethods.kindCrypto': 'Crypto',
  'paymentMethods.statusEnabled': 'Enabled',
  'paymentMethods.statusDisabled': 'Disabled',
  // The whole point of the payTo field, said where it can be seen. A method
  // missing it is enabled, looks configured, and silently accepts nobody.
  'paymentMethods.notOffered': 'Not offered to clients',
  'paymentMethods.notOfferedWhy': 'No pay-to account is set, so clients are never shown this.',
  'paymentMethods.noLimits': 'No limits',
  'paymentMethods.minOnly': 'Min {min}',
  'paymentMethods.maxOnly': 'Max {max}',
  'paymentMethods.minMax': '{min} – {max}',
  'paymentMethods.edit': 'Edit',
  'paymentMethods.editAria': 'Edit {name}',
  'paymentMethods.delete': 'Delete',
  'paymentMethods.deleteAria': 'Delete {name}',
  'paymentMethods.createTitle': 'Add a payment method',
  'paymentMethods.editTitle': 'Edit payment method',
  'paymentMethods.key': 'Key',
  'paymentMethods.keyHint': 'Lower-case, no spaces. Stored transactions reference it.',
  'paymentMethods.keyLocked': 'Fixed — transactions already reference this key.',
  'paymentMethods.name': 'Display name',
  'paymentMethods.nameHint': 'What the client sees.',
  'paymentMethods.kind': 'Kind',
  'paymentMethods.kindHint':
    'Decides the deposit flow the client is given, not just the label on it.',
  'paymentMethods.currency': 'Currency',
  'paymentMethods.logoUrl': 'Logo URL',
  'paymentMethods.instructions': 'Instructions',
  'paymentMethods.instructionsHint': 'Shown to the client verbatim. Say exactly what to do.',
  'paymentMethods.payTo': 'Pay-to account',
  'paymentMethods.payToHint':
    'The Whish number, IBAN or wallet address. Leave it empty and this method is never shown to a client.',
  'paymentMethods.minAmount': 'Minimum',
  'paymentMethods.maxAmount': 'Maximum',
  'paymentMethods.amountHint': 'Leave empty for no limit.',
  'paymentMethods.sortOrder': 'Sort order',
  'paymentMethods.sortOrderHint': 'Lower numbers appear first on the deposit screen.',
  'paymentMethods.enabled': 'Offered to clients',
  'paymentMethods.enabledHint':
    'Disabling stops new deposits. Existing transactions keep their history.',
  'paymentMethods.save': 'Save',
  'paymentMethods.saving': 'Saving…',
  'paymentMethods.saveFailed': 'Could not save the payment method.',
  'paymentMethods.deleteFailed': 'Could not delete the payment method.',
  'paymentMethods.confirmDeleteTitle': 'Delete {name}?',
  'paymentMethods.confirmDeleteBody':
    'This only works if no client has ever used it. If any have, the API will refuse and tell you to disable it instead — which keeps their transaction history readable.',
  'paymentMethods.readOnly': 'You do not have permission to change these.',

  // ── Wallets and trading accounts — no endpoint yet ────────────────────────
  'wallets.title': 'Client wallets',
  'wallets.subtitle':
    'Balances and holds, per client and currency. Nothing is shown here until the endpoint exists — a zero would be indistinguishable from a real one.',
  'wallets.pendingTitle': 'Waiting on the wallet listing endpoint',
  'tradingAccounts.title': 'Trading accounts',
  'tradingAccounts.subtitle':
    'MT5 logins, their group and leverage, per client. MetaTrader is the system of record; this screen reads it once the endpoint exists.',
  'tradingAccounts.pendingTitle': 'Waiting on the trading-account listing endpoint',

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
  'clients.colStatus': 'Status',
  'clients.colKycLevel': 'KYC Level',
  'clients.colTags': 'Tags',
  'clients.unnamed': 'Unnamed',
  'clients.tagFilterLabel': 'Tag',
  'clients.allCountries': 'All countries',
  'clients.clearFilters': 'Clear filters',
  'clients.searchLabel': 'Search clients by name or email',
  'clients.levelVerified': 'L1 · Verified',
  'clients.levelUnverified': 'L0 · Unverified',
  'clients.saving': 'Saving…',
  'clients.suspend': 'Suspend',
  'clients.reactivate': 'Reactivate',
  'clients.confirmSuspend':
    'Suspend {email}? They will be logged out immediately and unable to log back in.',
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
  'tags.confirmDelete':
    'Delete "{label}"? It is on {count} client(s) and will be removed from all of them. Any administrator restricted to this tag would lose that restriction, so the server refuses while anyone is scoped to it.',
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
  'adminUsers.accessLabel': 'Access',
  'adminUsers.directOption': 'Individual permissions (no role)',
  'adminUsers.roleHint':
    'Permissions come from the role and follow it — editing the role changes this administrator too.',
  'adminUsers.directHint':
    'Permissions are set on this administrator alone. Choosing a role instead will replace them.',
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
  'adminUsers.confirmSendReset':
    'Email {name} a single-use link to set a new password? It expires in an hour, and using it signs them out everywhere.',
  'adminUsers.resetSent': 'Reset link sent.',
  'adminUsers.suspend': 'Suspend',
  'adminUsers.reactivate': 'Reactivate',
  'adminUsers.statusSuspended': 'Suspended',
  'adminUsers.confirmSuspend':
    'Suspend {name}? They are signed out on their next request and cannot log in until reactivated.',
  'adminUsers.confirmReactivate': 'Reactivate {name}? They regain the access listed here.',
  'adminUsers.colActions': 'Actions',

  // Outstanding invites — sent, not yet accepted.
  'adminUsers.pendingTitle': 'Outstanding Invites',
  'adminUsers.pendingHint':
    'Sent but not yet accepted. The link creates an administrator account, so revoke one that went to the wrong address.',
  'adminUsers.pendingNone': 'No outstanding invites.',
  'adminUsers.colInvited': 'Invited',
  'adminUsers.colExpires': 'Link expires',
  'adminUsers.revoke': 'Revoke',
  'adminUsers.confirmRevoke':
    'Revoke the invite for {email}? The link stops working immediately. You can send a new one afterwards.',

  // ── Settings / RBAC ───────────────────────────────────────────────────────
  // /settings is a four-tab screen: General, Email, Platforms, Security. Roles
  // and the admin directory stay on their own routes — see roles.* and
  // adminUsers.* above. The settings.* keys below are still shared by the RBAC
  // components (role-card, role-form-modal), which those pages render.
  'settings.title': 'Settings',
  'settings.subtitle':
    'Branding, mail delivery, client downloads and the controls protecting this admin API.',

  // ── Settings tabs ─────────────────────────────────────────────────────────
  'settings.tabGeneral': 'General',
  'settings.tabEmail': 'Email',
  'settings.tabPlatforms': 'Platforms',
  'settings.tabSecurity': 'Security',
  'settings.masterOnly': 'Master admin only',

  // ── General tab ───────────────────────────────────────────────────────────
  'general.title': 'Brand and contact',
  'general.subtitle': 'What clients see across the portal, and where they are told to get help.',
  'general.loading': 'Loading general settings',
  'general.loadFailed': 'Could not load the general settings.',
  'general.brandName': 'Brand name',
  'general.brandNameHint': 'Shown in the portal header and in email headings.',
  'general.supportEmail': 'Support email',
  'general.supportEmailHint': 'Where clients are told to write. Leave empty to show no address.',
  'general.supportUrl': 'Support URL',
  'general.supportUrlHint':
    'Help centre or ticket portal. Must be https — it becomes a link in a client’s browser.',
  'general.maintenanceNotice': 'Maintenance notice',
  'general.maintenanceHint':
    'Shown to every client while it is set. Leave empty to show nothing — this is not a draft box.',
  'general.maintenancePlaceholder': 'e.g. Deposits are paused until 09:00 UTC while we upgrade.',
  'general.readOnly': 'You do not have permission to change these.',
  'general.updateFailed': 'Could not save the general settings.',
  'general.save': 'Save changes',
  'general.saving': 'Saving...',
  'general.saved': 'Saved',

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
  'nav.currencies': 'Currencies',
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
  'currencies.confirmDelete':
    'Delete {code}? This is only possible while no client holds a wallet in it. To stop offering a currency that is in use, disable it instead.',

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
  'ibLevels.confirmDelete':
    'Remove level {level} ({name})? Partners already placed at this level keep their position, but no new partner can be placed here.',

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
  'partners.title': 'Partners',
  'partners.subtitle': 'Approved introducing brokers, their placement, and their referral code.',
  'partners.loading': 'Loading partners…',
  'partners.loadFailed': 'Could not load partners.',
  'partners.empty': 'No partners yet. Approved applications appear here.',
  'partners.actionFailed': 'That change could not be made.',

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
} as const;

/** Every valid key. A typo is a compile error, never a string rendered as itself. */
export type MessageKey = keyof typeof messages;
