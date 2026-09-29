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
  /* `app.adminName` ("Admin Portal") went with the sidebar label it existed
     for. `adminSuffix` stays — the sign-in and invite screens still set
     "OXShare Admin" beside the mark, where naming the console is the point. */
  'app.adminSuffix': 'Admin',

  // ── Navigation ────────────────────────────────────────────────────────────
  //
  // The MAIN items (see `components/layout/navigation.ts`). Sentence case, like
  // every label under them: the flat sidebar mixed "Admin Users" with "API keys"
  // in one column, which is the first thing an eye scanning a list notices.
  'nav.group.clients': 'Clients',
  'nav.group.introducingBrokers': 'Introducing brokers',
  'nav.group.finance': 'Finance',
  'nav.group.trading': 'Trading',
  'nav.group.system': 'System',
  'nav.group.security': 'Security',
  'nav.dashboard': 'Dashboard',
  // "All clients", not "Clients": it sits under a main item already named that.
  'nav.clients': 'All clients',
  'nav.withdrawals': 'Withdrawals',
  'nav.ledger': 'Ledger',

  // ── RBAC-08, the admin IP allowlist ───────────────────────────────────────
  'ipAllowlist.title': 'Network access',
  'ipAllowlist.subtitle':
    'Restrict the administration console to particular networks. Client-facing pages are never affected.',
  'ipAllowlist.loading': 'Loading network rules',
  'ipAllowlist.loadFailed': 'Could not load the network rules.',
  // Says OFF in words. A page titled "Network Access" showing no errors reads as
  // protection to anybody who does not know an empty list disables the feature.
  'ipAllowlist.notEnforcing':
    'No rules configured, so this protection is OFF — the console is reachable from any network. Adding the first rule switches it on.',
  'ipAllowlist.enforcing':
    'Enforcing. Only the {count:network|{count} networks} below can reach the administration API.',
  'ipAllowlist.disabledByConfig':
    'Enforcement is switched OFF by configuration (ADMIN_IP_ALLOWLIST_ENABLED=false). The rules below are saved and none of them is being applied. Remove that setting and restart to enforce them again.',
  // The address the SERVER sees. Behind the console's dev proxy that is ::1, not
  // the operator's public address — printing it bare invites them to compare it
  // with a "what is my IP" site and conclude the console is broken.
  'ipAllowlist.yourIp':
    'This request reached the API from {ip}. That is the address the SERVER sees — behind a proxy or in local development it is the proxy, not your public address. A rule has to cover this value to admit you.',
  'ipAllowlist.yourIpUnknown':
    'The API could not determine the address this request came from. Adding a rule now would lock you out, and it will be refused.',
  'ipAllowlist.empty': 'No network rules. The console is reachable from anywhere.',
  'ipAllowlist.firstRuleWarning':
    'This is the FIRST rule, so it turns enforcement on immediately. If it does not cover the address above you would lose access to this screen — the API refuses such a rule rather than locking you out.',
  'ipAllowlist.cidrLabel': 'Address or range (CIDR)',
  'ipAllowlist.labelLabel': 'What is it',
  'ipAllowlist.labelPlaceholder': 'Beirut office',
  'ipAllowlist.addRule': 'Add rule',
  'ipAllowlist.addFailed': 'Could not add that rule.',
  'ipAllowlist.removeFailed': 'Could not remove that rule.',
  'ipAllowlist.remove': 'Remove {cidr}',
  'ipAllowlist.removeTitle': 'Remove this network rule?',
  'ipAllowlist.confirmRemove':
    'Remove {cidr}? If it is the last rule covering your own address the API will refuse, because it would lock you out.',
  'nav.commissionPlans': 'Commission Plans',
  'nav.kyc': 'KYC review',
  'nav.kycBuilder': 'KYC builder',
  'nav.adminUsers': 'Admin users',
  'nav.roles': 'Roles & permissions',
  'nav.auditLog': 'Audit log',
  'nav.settings': 'Settings',
  'nav.logout': 'Logout',
  // Same strings as the portal's, because the account menu at the foot of the
  // sidebar is the same control. See components/layout/user-menu.tsx.
  'nav.noRole': 'No role assigned',
  'nav.accountMenu': 'Account menu',
  'theme.label': 'Theme',
  'theme.light': 'Light',
  'theme.dark': 'Dark',
  'theme.switchToDark': 'Switch to dark mode',
  'theme.switchToLight': 'Switch to light mode',
  'theme.system': 'System',
  'nav.collapseSidebar': 'Collapse the sidebar',
  'nav.expandSidebar': 'Expand the sidebar',
  // The phone drawer: the button that opens it, its name while open, and the
  // button that closes it. All three were unlabelled icons.
  'nav.openMenu': 'Open the menu',
  'nav.menu': 'Menu',
  'nav.closeMenu': 'Close the menu',
  // A main item on the collapsed rail, with the work waiting inside it — the
  // rail shows a dot, so the count has to be in the name.
  'nav.groupWaiting': '{group}, {count} waiting',
  /** The arrow beside a main item: it opens that section's list of pages. */
  'nav.groupPages': '{group} pages',
  'nav.groupPagesWaiting': '{group} pages, {count} waiting',
  /*
   * "Search pages", because that is what it searches.
   *
   * It read "Search clients, deals, IBs… (⌘K)" above a control that searched
   * NOTHING — the input had no handler at all. Now that it opens a real
   * palette, the copy has to stop naming things the palette does not find: it
   * lists the console's own pages, so an operator typing a client's email and
   * getting nothing would read it as broken rather than as out of scope.
   *
   * The shortcut moved out of the placeholder and onto its own `kbd` element,
   * where it is not competing with the sentence for width.
   */
  'nav.searchPlaceholder': 'Search pages…',
  'nav.searchAria': 'Search the pages of this console',
  'nav.searchShortcut': 'Ctrl K',
  'nav.searchResultsAria': 'Matching pages',
  'nav.searchNoResults': 'No page matches “{query}”.',
  /* The keys, so the palette is drivable without a mouse by somebody who has
     not been told how. */
  'nav.searchHintNavigate': '↑↓ to move',
  'nav.searchHintOpen': '↵ to open',
  'nav.searchHintClose': 'Esc to close',
  'nav.notifications': 'Notifications',

  // ── Session ───────────────────────────────────────────────────────────────
  'session.loading': 'Loading your session',
  'session.deniedTitle': 'Access denied',
  'common.notFoundTitle': 'Not found',
  'common.notFoundBody': 'It may have been removed, or it is not available to you.',
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
  // Screen-reader text behind the loader AsyncBoundary paints on a 401, in the
  // moment before the interceptor's redirect to sign-in lands.
  'session.ended': 'Your session has ended. Returning to sign-in…',

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
  // The rail the money goes out through — the operator's own name for it
  // ('Whish Money'), resolved server-side rather than a machine key.
  'withdrawals.colMethod': 'Method',
  'withdrawals.colState': 'State',
  'withdrawals.colRequested': 'Requested',
  'withdrawals.stateAll': 'All',
  'withdrawals.statePending': 'Pending',
  'withdrawals.stateApproved': 'Approved',
  /*
   * `stateApproved` labels the `success` state — the finished payout — while
   * `stateAwaitingPayout` labels `approved`, which the two-lifecycle split
   * (D-66) made a live state again: a rail withdrawal sits there while Rival
   * processes the payout. The earlier merge of the two into one word assumed
   * approval always paid in one step; on the whish rail it no longer does,
   * and "money left our books but has not reached the client" needs its own
   * label. See STATE_META in the transactions page.
   *
   * The `withdrawals.settle*` strings below are NOT dead: `POST
   * /admin/withdrawals/:id/settle` still exists for the Rival rail, where the
   * provider confirms asynchronously. Nothing in the console calls it.
   */
  'withdrawals.stateAwaitingPayout': 'Awaiting payout',
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
    'Review client withdrawals: approve or reject with a reason. Approved on an automated method, the provider pays it and the request settles when the provider confirms.',
  'withdrawals.moneyNote': 'Every money movement is recorded in the audit log.',
  'withdrawals.required': '*',
  'withdrawals.colActions': 'Actions',
  'withdrawals.viewOnly': 'View only',
  // R-5.4: the two steps are separate permissions, so an admin may legitimately
  // hold one and not the other. Saying WHO it is waiting for beats a disabled
  // button with no explanation.
  'withdrawals.awaitingApprover': 'Awaiting an approver',
  'withdrawals.awaitingSettler': 'Awaiting a payer',
  'withdrawals.rejectionReason': 'Rejection Reason',
  'withdrawals.selectReason': 'Select a reason…',
  'withdrawals.reasonPlaceholder': 'e.g. Beneficiary name does not match the account holder…',
  'withdrawals.providerRef': 'Provider reference',
  'withdrawals.providerRefPlaceholder': 'e.g. the transfer or receipt number',
  'withdrawals.tabPending': 'Pending Review',
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
  'paymentMethods.title': 'Deposit methods',
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
  // ── Withdrawal methods ────────────────────────────────────────────────────
  // The payout rails the portal's withdraw form offers. The deposit list's
  // twin: its own rows, switched on and off independently.
  'withdrawalMethods.title': 'Withdrawal methods',
  'withdrawalMethods.subtitle':
    'How clients can take money out. Enabling a method offers it on the client’s withdraw form; disabling it stops new requests and leaves existing ones for the desk to settle.',
  'withdrawalMethods.create': 'Add method',
  'withdrawalMethods.loading': 'Loading withdrawal methods',
  'withdrawalMethods.loadFailed': 'Could not load the withdrawal methods.',
  'withdrawalMethods.caption': 'Configured withdrawal methods',
  'withdrawalMethods.empty':
    'No withdrawal methods configured. Clients cannot request a withdrawal until one is.',
  'withdrawalMethods.readOnly': 'You do not have permission to change these.',
  'withdrawalMethods.colName': 'Name',
  'withdrawalMethods.colStatus': 'Status',
  'withdrawalMethods.colActions': 'Actions',
  'withdrawalMethods.statusEnabled': 'Enabled',
  'withdrawalMethods.statusDisabled': 'Disabled',
  'withdrawalMethods.edit': 'Edit',
  'withdrawalMethods.enable': 'Enable',
  'withdrawalMethods.disable': 'Disable',
  'withdrawalMethods.createTitle': 'Add withdrawal method',
  'withdrawalMethods.editTitle': 'Edit withdrawal method',
  'withdrawalMethods.internalLabel': 'Internal name',
  'withdrawalMethods.internalLabelHint':
    'Only admins see this. It names the rail on every withdrawal, approval and export — rename it any time.',
  'withdrawalMethods.delete': 'Delete',
  'withdrawalMethods.deleteInUse': 'Can’t delete — used by withdrawals',
  'withdrawalMethods.confirmDeleteTitle': 'Delete {name}?',
  'withdrawalMethods.confirmDelete':
    'Nobody has used this method, so nothing refers to it. This cannot be undone.',
  'withdrawalMethods.deleted': '{name} deleted',
  'withdrawalMethods.deleteFailed': 'Could not delete that withdrawal method.',
  'withdrawalMethods.name': 'Name',
  'withdrawalMethods.namePlaceholder': 'Bank transfer',
  'withdrawalMethods.enabled': 'Offer it to clients',
  'withdrawalMethods.save': 'Save',
  'withdrawalMethods.cancel': 'Cancel',
  'withdrawalMethods.saveSucceeded': '{name} saved',
  'withdrawalMethods.saveFailed': 'Could not save that withdrawal method.',
  'withdrawalMethods.enabledSucceeded': '{name} is now offered to clients',
  'withdrawalMethods.disabledSucceeded': '{name} is no longer offered to clients',
  'paymentMethods.loading': 'Loading payment methods',
  'paymentMethods.loadFailed': 'Could not load the payment methods.',
  'paymentMethods.caption': 'Configured deposit methods',
  'paymentMethods.empty': 'No payment methods configured. Clients cannot deposit until one is.',
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
  'paymentMethods.internalLabel': 'Internal name',
  'paymentMethods.internalLabelHint':
    'Only admins see this. It names the method on every transaction, approval and export — rename it any time.',
  'paymentMethods.clientSees': 'Clients see “{name}”',
  'paymentMethods.proofFieldsTitle': 'Details the client gives',
  'paymentMethods.proofFieldsHint':
    'What identifies the payment — the phone it was sent from, a transfer code. The client fills these with the receipt, and you see them on the deposit.',
  'paymentMethods.proofFieldsEmpty': 'No details asked. Add one to have the client give it.',
  'paymentMethods.proofFieldAdd': 'Add a detail',
  'paymentMethods.proofFieldUnnamed': 'this detail',
  'paymentMethods.proofFieldReorder': 'Reorder {name}',
  'paymentMethods.proofFieldLabel': 'Detail name',
  'paymentMethods.proofFieldLabelPlaceholder': 'Phone number you sent from',
  'paymentMethods.proofFieldType': 'Type',
  'paymentMethods.proofFieldTypeText': 'Text or code',
  'paymentMethods.proofFieldTypePhone': 'Phone number',
  'paymentMethods.proofFieldHintLabel': 'Hint for the client (optional)',
  'paymentMethods.proofFieldHintPlaceholder': 'Hint for the client (optional)',
  'paymentMethods.proofFieldRequired': 'Required',
  'paymentMethods.proofFieldShown': 'Show to clients',
  'paymentMethods.proofFieldRemove': 'Remove {name}',
  'paymentMethods.delete': 'Delete',
  'paymentMethods.deleteInUse': 'Can’t delete — used by transactions',
  'paymentMethods.confirmDeleteTitle': 'Delete {name}?',
  'paymentMethods.confirmDelete':
    'Nobody has used this method, so nothing refers to it. This cannot be undone.',
  'paymentMethods.deleted': '{name} deleted',
  'paymentMethods.deleteFailed': 'Could not delete the payment method.',
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
  // A method's own deposit range (0162) — optional, narrower than the currency's.
  'paymentMethods.rangeTitle': 'Deposit range (optional)',
  'paymentMethods.rangeHint':
    "Leave empty to use {currency}'s range, {min} – {max}. A value here can only narrow it.",
  'paymentMethods.rangeHintNoCurrency':
    "Choose a currency first — the range narrows that currency's.",
  'paymentMethods.ownMin': 'Minimum for this method',
  'paymentMethods.ownMax': 'Maximum for this method',
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
  // The 12-char wallet number — the identifier an operator quotes and a client
  // can actually read back. "No." not "Number": the column holds codes, and the
  // long word would out-measure every value under it.
  'wallets.colNumber': 'Wallet no.',
  /* The column header. The VALUE under it is server-generated ("USD Wallet",
     "Commission Wallet") and is rendered as sent rather than translated —
     see WalletDto.name on why the stored string stays English. */
  'wallets.colName': 'Wallet',
  'wallets.colCurrency': 'Currency',
  'wallets.colBalance': 'Balance',
  'wallets.colOnHold': 'On hold',
  'wallets.colOpened': 'Opened',
  'wallets.filterCurrency': 'Currency',
  'wallets.filterCurrencyAll': 'All currencies',
  'wallets.filterClient': 'Search client',
  'wallets.filterClientPlaceholder': 'Search by name, email, Portal ID or wallet no.',
  'wallets.filterClientHint':
    'Matches the owner’s email or name, or a whole wallet number — the identifiers this table shows. A wallet number is matched exactly.',
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
  // The NUMBER is in the title: "this USD wallet" identified nothing when a
  // partner holds two, and the operator is confirming a specific wallet.
  'wallets.closeConfirmTitle': 'Close {currency} wallet {number}?',
  'wallets.closeConfirmBody':
    'This removes wallet {number} from {email}. It only works on an empty wallet with no history — the API refuses any other, and says why.',
  'wallets.closeConfirm': 'Close wallet',
  'wallets.closing': 'Closing…',
  'wallets.closeFailed': 'Could not close the wallet.',
  'wallets.closeSucceeded': '{currency} wallet {number} closed',
  'wallets.creditTitle': 'Add funds to this wallet',
  'wallets.creditClient': 'Client',
  'wallets.creditWalletNumber': 'Wallet no.',
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
  'wallets.creditSucceeded': '{amount} credited to wallet {number}',
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
  'tradingAccounts.filterClient': 'Search client',
  'tradingAccounts.filterClientPlaceholder': 'Search by name, email, Portal ID or MT5 login',
  'tradingAccounts.filterClientHint':
    'Matches the owner’s email or name, or a whole MT5 login — the identifiers this table shows. Leading zeros matter: 00012345 and 12345 are different accounts.',
  'tradingAccounts.clearFilters': 'Clear filters',
  'tradingAccounts.noun': 'account', // pager: "1–25 of 40 accounts"
  'tradingAccounts.nounPlural': 'accounts',
  // `leverage` is nullable — it is unset until MT5 assigns a group.
  'tradingAccounts.noLeverage': 'Not set',
  // ── Accounts on MT5 that no client owns yet (the MT5 account sync, 29 Sep 2026) ──
  'tradingAccounts.noClient': 'No client',
  'tradingAccounts.noClientHint':
    'Found on MT5 by the account sync. No client owns it yet, so its trades pay no commission until it is assigned.',
  'tradingAccounts.mt5Holder': 'On MT5: {holder}',
  'tradingAccounts.filterOwner': 'Client',
  'tradingAccounts.filterOwnerAll': 'All accounts',
  'tradingAccounts.filterOwnerAssigned': 'With a client',
  'tradingAccounts.filterOwnerUnassigned': 'No client',
  'tradingAccounts.assignAction': 'Assign to a client',
  'tradingAccounts.syncButton': 'Sync from MT5',
  'tradingAccounts.syncing': 'Syncing…',
  'tradingAccounts.syncHint':
    'Adds every MT5 account the CRM does not have yet, with no client. It also runs by itself every ten minutes.',
  'tradingAccounts.syncDone':
    'MT5 has {onServer} accounts. {added} new ones were added with no client.',
  'tradingAccounts.syncRemaining':
    '{remaining} more are still being read and will appear over the next minutes.',
  'tradingAccounts.syncUnknownCurrency':
    'Skipped the accounts in {currencies}: this platform does not hold that currency. Add it, and the next sync takes them.',
  'tradingAccounts.syncRemoved': '{removed} accounts no longer on MT5 were removed.',
  'tradingAccounts.syncFailed': 'Could not sync from MT5.',
  'tradingAccounts.showUnassigned': 'Show accounts with no client',

  // ── Audit log (D-21) ──────────────────────────────────────────────────────
  'audit.title': 'Audit Log',
  'audit.subtitle': 'Append-only record of every admin action — who did what, to what, and when',
  'audit.subjectClient': 'Client',
  'audit.filterActor': 'Search administrator or client',
  'audit.filterActorPlaceholder': 'Administrator email or client Portal ID',
  'audit.filterActorHint':
    'An email matches the Administrator column; a Portal ID finds every entry about that client. It does not search the details column, which holds client data.',
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
  'clients.searchPlaceholder': 'Search by name, email or Portal ID…',
  'clients.colName': 'Name',
  'clients.colEmail': 'Email',
  'clients.colId': 'Portal ID',
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
  /*
   * The six `clients.kyc*` status labels that lived here are GONE — they were a
   * second copy of the `kycStatus.*` family, and keeping both is what let the
   * client list keep saying "Submitted" after the review desk's word for it
   * changed. `lib/kyc-status.ts` owns them now.
   */
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
  'clients.colKycLevel': 'KYC',
  'clients.colTags': 'Tags',
  'clients.unnamed': 'Unnamed',
  'clients.tagFilterLabel': 'Tag',
  /* The "clear the tag filter" option — the select's equivalent of a second
     click on a chip, which is how the chips used to be cleared. */
  'clients.allTags': 'All tags',
  'clients.clearFilters': 'Clear filters',
  'clientProfile.recordReferrer': 'Record the partner who introduced them',
  'clientProfile.recordReferrerTitle': 'Record a referring partner',
  'clientProfile.recordReferrerBody':
    'Records the partner who introduced {client}, using the referral code the client gives you. This can only be set once — it cannot be changed afterwards, and it cannot move a client from one partner to another.',
  'clientProfile.recordReferrerField': 'Referral code',
  'clientProfile.recordReferrerConfirm': 'Record partner',
  'clientProfile.recordReferrerDone': 'Partner recorded.',
  'clientProfile.recordReferrerFailed': 'Could not record the partner.',
  'clientProfile.refUnknown':
    'No partner holds that code. Check the spelling against what the client sent you.',
  'clientProfile.refSelf':
    "That is this client's own referral code — they cannot introduce themselves.",
  'clientProfile.refInactive':
    'That code is correct, but the partner it belongs to is suspended. The client gave you the right code; whether attribution should be recorded is a decision about that partner.',
  'clientProfile.refAlready':
    'This client already has a referring partner. Attribution is recorded once and cannot be moved.',
  'clientProfile.refNoBackdate':
    'Applies to future activity. Commission already credited is not restated.',
  'kycReview.correctTitle': 'Correct identity details',
  'kycReview.correctBody':
    "Corrects {client}'s verified details. Each value is checked again, the change is recorded with your reason, and the client is emailed which details changed. For a new document or a move abroad, request a re-verification instead.",
  'kycReview.correctDob': 'Date of birth',
  'kycReview.correctAddress': 'Address',
  'kycReview.correctCity': 'City',
  'kycReview.correctPostalCode': 'Postal / ZIP code',
  'kycReview.correctConfirm': 'Save correction',
  'kycReview.correctFailed': 'Could not save the correction.',
  'kycReview.correctRefusedTitle': 'This record cannot hold that value',
  'kycReview.correctRefusedRemedy':
    'These details would not have been accepted at submission, so this approved verification is not valid. Request a re-verification instead.',
  'kycReview.correctReason': 'Reason for the correction',
  'kycReview.correctReasonPlaceholder':
    'e.g. Surname misspelt at registration; the passport reads "Haddad".',
  'kycReview.correctReasonHint': 'Recorded on the audit trail beside the old and new values.',
  'kycReview.correctPhoneNote':
    "The phone number is not part of a correction: edit it on the client's profile.",
  'kycReview.correctAction': 'Correct details',
  // ── Re-verification (26 Sep 2026): an approved verification returned to the client ──
  'kycReview.reverifyAction': 'Request re-verification',
  'kycReview.reverifyTitle': 'Ask {client} to update their verification',
  'kycReview.reverifyBody':
    'For a detail that changed materially — a new passport, a move abroad. The client is emailed the reason and what to update; their resubmission comes back to this queue.',
  'kycReview.reverifyItems': 'What must the client update?',
  'kycReview.reverifyReason': 'Reason, sent to the client',
  'kycReview.reverifyReasonPlaceholder':
    'e.g. Your passport on file has expired. Please upload your new one.',
  'kycReview.reverifyMoneyPause':
    'Deposits and withdrawals pause until the updated verification is approved.',
  'kycReview.reverifyConfirm': 'Return for re-verification',
  'kycReview.reverifyFailed': 'Could not return the verification.',
  'kycReview.reverificationRequested':
    'Re-verification requested — this client was verified before, and was asked to update the items below.',
  // ── The review, laid out by the server ──
  'kycReview.identityTitle': "Client's identity",
  'kycReview.identityDocumentTitle': 'Identity document',
  'kycReview.proofOfAddressTitle': 'Proof of address',
  'kycReview.selfieTitle': 'Selfie',
  'kycReview.unlistedAnswers': 'Answers to questions no longer on the form',
  'kycReview.notAsked': 'Not asked by this form',
  'kycReview.pageMissing': 'Not uploaded',
  'kycReview.pageUploaded': 'Uploaded',
  // A page the reviewer returned, while it is with the client — shown in red.
  'kycReview.pageReturned': 'Returned',
  'kycReview.identityAtDecision': 'Identity at the time',
  'kycReview.documentsTitle': 'Documents',
  'clientProfile.networkCapped': 'Showing {shown} of {total} introduced clients.',
  'clientProfile.networkSeeAll': 'See all of them',
  'clientProfile.networkOutsideScope':
    '{count} more {count:client|clients} introduced by this partner {count:is|are} outside your territory, so {count:it is|they are} not listed here.',
  'clientProfile.networkPartnersOutsideScope':
    '{count} {count:sub-partner|sub-partners} beneath this partner {count:is|are} outside your territory, so {count:it is|they are} not listed here.',
  'clients.referredByNotice': 'Showing only the clients introduced by {who}.',
  'clients.referredByWho': 'this partner',
  'clients.referredByClear': 'Show all clients',
  'clients.referredByProfile': 'Open their profile',
  'clients.searchLabel': 'Search clients by name, email or Portal ID',
  /*
   * "Verified" / "Not verified", with no level prefix.
   *
   * These read 'L1 · Verified' and 'L0 · Unverified', which put a TIER in front
   * of a yes/no. `verification_level` holds 0 or 1 and nothing else — there is
   * no L2 to be short of — so the number implied a ladder the product does not
   * have, and operators read "L1" as a rung rather than as "done".
   */
  'clients.levelVerified': 'Verified',
  'clients.levelUnverified': 'Not verified',
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
  // The partner who introduced a client — the Referrals page's column.
  'clients.colIntroducedBy': 'Introduced by',
  // Introduced, by a partner the reader may not see — never "not introduced".
  'clients.introducedByOutside': 'A partner outside your territory',

  // ── Referrals (owner, 28 Sep 2026) ───────────────────────────────────────
  // The client list narrowed to clients a partner introduced, under
  // Introducing brokers. The title matches the sidebar label.
  'referrals.title': 'Referrals',
  'referrals.subtitle': 'Clients who joined through a partner, and the partner who introduced them',
  'referrals.loading': 'Loading referrals',
  'referrals.loadFailed': 'Failed to load referrals.',
  'referrals.caption': 'Clients introduced by a partner',
  'referrals.empty': 'No referred clients match the current filters.',
  'referrals.emptyNone': 'No client has joined through a partner yet.',
  'tags.overflow': '+{count} more',

  // ── ADM-14 tag management ───────────────────────────────────────────────
  'nav.tags': 'Client tags',
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
    'It is on {count} {count:client|clients} and will be removed from {count:it|all of them}. Any administrator restricted to this tag would lose that restriction, so the server refuses while anyone is scoped to it.',
  'tags.deleteSucceeded': 'Tag "{label}" deleted',
  'tags.saveSucceeded': 'Tag "{label}" saved',
  'tags.deleteFailed': 'Failed to delete the tag.',
  // A tag the platform itself depends on (is_system) — none ship today.
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
  'roles.maskSummary': '{count} {count:field|fields} hidden',
  'roles.maskSummaryNone': 'Nothing hidden',
  'roles.maskHint':
    'Fields holders of this role cannot see. The value is removed from the API response, not just from the screen — and it applies everywhere, including the KYC review.',
  // The superset rule (assertMaskAllowed): a role you save must hide at least
  // what is hidden from YOU, or saving roles would be the way around your own
  // mask. Locked on the control, so the answer is where the operator looks.
  'roles.maskLockedOwn': 'Hidden from you — you cannot grant visibility you do not have.',

  'adminUsers.scopeSection': 'Client scope',
  // D-60 — the intake pool. "Untriaged" is derived (no tags), never a tag.
  'adminUsers.seesUntriaged': 'Sees new clients (not yet tagged)',
  // A scope id the tag vocabulary did not return — shown rather than dropped.
  'adminUsers.scopeUnknownTag': 'Unknown tag',
  'adminUsers.seesUntriagedHint':
    'The intake pool: clients with no tags at all. Granted by default — untick to restrict. Only unrestricted admins and holders of this grant see them. Assigning any tag moves a client out of intake by definition; removing their last tag returns them to it — nobody can fall between territories.',
  'adminUsers.seesUntriagedLockedOwn':
    'You do not see the intake pool yourself, so you cannot grant it — the invitee starts without it.',
  'adminUsers.scopeSummary': '{count} {count:tag|tags}',
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
    'No tags chosen: this administrator sees no clients — or only new clients, if that is ticked below.',
  'adminUsers.scopeModeLabel': 'Which clients this administrator sees',
  'adminUsers.scopeModeAll': 'All clients',
  'adminUsers.scopeModeTags': 'Only these tags',
  'adminUsers.scopeModeAllHint': 'Sees every client, including new ones.',
  'adminUsers.scopeModeAllLocked':
    'Only an administrator who sees every client can grant all clients.',
  'adminUsers.scopeNone': 'No clients',
  'adminUsers.scopeNewOnly': 'New clients only',
  'adminUsers.maskSection': 'Field visibility',
  'adminUsers.maskSummary': '{count} {count:field|fields} hidden',
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
  'adminUsers.scopeCount': '{count} {count:tag|tags}',
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
  'clientProfile.fieldClientId': 'Portal ID',
  'clientProfile.kycStatus': 'Status',
  // The Identity card's verification fields (the KYC card went, 29 Sep 2026).
  'clientProfile.fieldKycStatus': 'Verification',
  'clientProfile.fieldKycSubmitted': 'KYC submitted',
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
  'clientProfile.sectionIdentityRecord': 'Identity documents',
  'clientProfile.identityLoading': 'Loading the identity record',
  'clientProfile.identityLoadFailed': 'The identity record could not be loaded.',
  'clientProfile.identityCurrent': 'Latest',
  'clientProfile.identityEarlier': 'Earlier versions ({count})',
  'clientProfile.identityPresented': 'Presented {date}',
  'clientProfile.identityDraft': 'Being prepared by the client',
  'clientProfile.identityReturnedPages': 'Returned: {pages}',
  'clientProfile.identityStatusDraft': 'Draft',
  'clientProfile.identityStatusAwaiting': 'Awaiting review',
  'clientProfile.identityStatusVerified': 'Verified',
  'clientProfile.identityStatusReturned': 'Returned',
  'clientProfile.identityStatusReverify': 'Re-verification requested',
  'clientProfile.sectionVerifications': 'Verification history',
  'clientProfile.verificationsHidden': 'The verification history is hidden by your permissions.',
  'clientProfile.noVerifications': 'No verification decisions yet.',
  'clientProfile.verificationBy': 'by {who}',
  'clientProfile.verificationMethodLegacy': 'recorded from the account’s level',
  'clientProfile.verificationMethodFixture': 'test fixture',
  'clientProfile.verificationReturned': 'Returned items: {items}',
  'clientProfile.noTradingAccounts': 'No trading accounts yet.',
  // An account whose MT5 login has not been issued yet. Named rather than left
  // blank: a row with nothing where the login belongs reads as a broken table,
  // and an operator cannot tell that from an account still being opened.
  'clientProfile.loginPending': 'Login pending',
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
  // A tag change that takes the client out of YOUR territory (a hand-off to
  // another desk) is asked first — see use-client-tag-toggle.ts.
  'clientProfile.tagLeavesScopeTitle': 'Hand {client} over?',
  'clientProfile.tagLeavesScopeBody':
    'Changing “{label}” takes {client} out of your territory. You will no longer see or open this client — administrators whose territory covers them still will.',
  'clientProfile.tagLeavesScopeConfirm': 'Hand over',
  'clientProfile.tagHandedOver':
    '{client} was handed over with “{label}” and is no longer in your territory.',
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
  // Distinct from `noParentIb` on purpose: "nobody introduced them" and "somebody
  // did, and they are outside your desk" are different commercial facts, and
  // collapsing them is what the unscoped referrer card used to do in reverse.
  'clientProfile.parentIbOutsideTerritory': 'Introduced by a partner outside your territory.',
  'clientProfile.referredClients': 'Clients introduced',
  'clientProfile.noReferrals': 'No clients introduced.',
  'clientProfile.attributionInactive': 'inactive',

  // ── The partner tab. Rendered only for a client who IS one. ───────────────
  'clientProfile.partnerStanding': 'Partner standing',
  'clientProfile.partnerLevel': 'Commission level',
  // A partner standing DEEPER than the ladder is configured for. Not an error
  // and not impossible: `ib_accounts.level` carries no foreign key to the
  // ladder on purpose, because a tree may legitimately run deeper than the
  // broker pays. Such a partner earns nothing until somebody extends it, so
  // this says which rung is missing rather than rendering a bare number.
  'clientProfile.partnerLevelUnconfigured': 'Level {level} — not on the ladder',
  'clientProfile.partnerLevelNotPaying': 'This level is not paying, so they earn nothing.',
  'clientProfile.partnerTerms': 'What they earn',
  'clientProfile.levelBadge': 'Level {level}',
  'clientProfile.partnerCode': 'Referral code',
  'clientProfile.partnerState': 'Standing',
  'clientProfile.partnerActive': 'Earning',
  'clientProfile.partnerSuspended': 'Suspended',
  'clientProfile.partnerSince': 'Partner since',
  'clientProfile.partnerParent': 'Placed under',
  'clientProfile.partnerNoParent': 'Deals with the broker directly',
  'clientProfile.partnerParentOutsideTerritory': 'A partner outside your territory',

  'clientProfile.partnerEarnings': 'Earnings',
  'clientProfile.partnerConfirmed': 'Confirmed',
  'clientProfile.partnerConfirmedHint': 'Credited to their wallet',
  'clientProfile.partnerPending': 'Pending',
  'clientProfile.partnerPendingHint': 'Accrued, still maturing',
  'clientProfile.partnerClients': 'Clients',
  'clientProfile.partnerClientsHint': 'They introduced',
  'clientProfile.partnerSubCount': 'Sub-partners',
  'clientProfile.partnerSubCountHint': 'Directly beneath them',
  'clientProfile.outsideTerritoryCount': '+{count} outside your territory',

  'clientProfile.partnerAgency': 'Agency',
  'clientProfile.partnerAgencyNoProducts': 'This agency lists no products yet.',
  // NOT "none": a partner on no agency has clients who are offered the FULL
  // catalogue, which is the opposite of what "none" would read as.
  'clientProfile.partnerNoAgency':
    'On no agency — their clients are offered the full product catalogue.',
  'clientProfile.partnerSubPartners': 'Partners beneath them',
  'clientProfile.partnerNoSubPartners': 'No partners placed under them yet.',

  // ── Tabs ──────────────────────────────────────────────────────────────────
  'clientProfile.tabOverview': 'Overview',
  'clientProfile.tabPartner': 'Partner',
  'clientProfile.tabCompliance': 'Compliance',
  'clientProfile.tabMoney': 'Money',
  'clientProfile.tabNetwork': 'Network',
  // A partner's book, in full — the clients they introduced and those clients' accounts.
  'clientProfile.tabReferredClients': 'Referred clients',
  'clientProfile.tabReferredAccounts': 'Referred accounts',
  'clientProfile.referredClientsTitle': 'Clients this partner introduced',
  'clientProfile.referredClientsSearch': 'Search the clients this partner introduced',
  'clientProfile.referredClientsSearchPlaceholder': 'Name, email or Portal ID…',
  'clientProfile.referredClientsOpenList': 'Open in the clients list →',
  'clientProfile.referredClientsLoading': 'Loading the clients this partner introduced',
  'clientProfile.referredClientsLoadFailed': 'Could not load the clients this partner introduced.',
  'clientProfile.referredClientsEmpty': 'This partner has not introduced any clients yet.',
  'clientProfile.referredClientsNoMatch': 'No client this partner introduced matches that search.',
  'clientProfile.referredAccountsTitle': 'Trading accounts of the clients this partner introduced',
  'clientProfile.referredAccountsSearch':
    'Search the accounts of the clients this partner introduced',
  'clientProfile.referredAccountsLoading': 'Loading the accounts of this partner’s clients',
  'clientProfile.referredAccountsLoadFailed':
    'Could not load the accounts of this partner’s clients.',
  'clientProfile.referredAccountsEmpty':
    'None of this partner’s clients holds a trading account yet.',
  'clientProfile.referredAccountsNoMatch':
    'No account of this partner’s clients matches that search.',
  'clientProfile.referredAccountsViewOwner': 'View client profile',
  'clientProfile.partnerLoading': 'Loading partner standing',
  'clientProfile.partnerLoadFailed': 'Could not load their partner standing.',

  // ── The actions menu ──────────────────────────────────────────────────────
  'clientProfile.actions': 'Actions',
  'clientProfile.actionsFor': 'Actions for {name}',
  'clientProfile.actionSuspend': 'Suspend client',
  'clientProfile.actionReactivate': 'Reactivate client',
  'clientProfile.confirmSuspendTitle': 'Suspend {name}?',
  'clientProfile.confirmSuspend':
    'They keep their balances and history and cannot sign in. Reversible at any time.',
  'clientProfile.confirmReactivateTitle': 'Reactivate {name}?',
  'clientProfile.confirmReactivate': 'They can sign in again immediately.',
  'clientProfile.statusChanged': 'Client is now {status}',
  'clientProfile.statusFailed': 'The client’s status could not be changed.',

  'clientProfile.actionSuspendPartner': 'Suspend partner',
  'clientProfile.actionReactivatePartner': 'Reactivate partner',
  'clientProfile.confirmSuspendPartnerTitle': 'Suspend {name} as a partner?',
  // Both halves, because saying only one is misleading in either direction.
  'clientProfile.confirmSuspendPartner':
    'They keep their referral code and everyone beneath them, and stop earning. Nobody above them earns through them either.',
  'clientProfile.confirmReactivatePartnerTitle': 'Reactivate {name} as a partner?',
  'clientProfile.confirmReactivatePartner': 'They start earning again on the next closed trade.',
  'clientProfile.partnerStateChanged': 'Partner is now {state}',
  'clientProfile.partnerStateFailed': 'The partner’s standing could not be changed.',

  // ── Moving a partner to a different level ───────────────────────────
  // The sibling of the parent reassignment, and the distinction is the point:
  // the PARENT is where a partner sits in the tree, the LEVEL is what they are
  // paid. They are normally the same decision — a rung is derived from the
  // parent's — which is exactly why each needs its own control: correcting a
  // mis-recorded introducer must not silently re-price anybody.
  'clientProfile.actionChangeLevel': 'Change commission level',
  'clientProfile.changeLevelTitle': 'Change {name}’s commission level',
  'clientProfile.changeLevelBody':
    'The rung this partner stands on, and therefore their terms. It applies to their next ' +
    'closed trade — commission already earned records the rate it was calculated at and does ' +
    'not change. Partners beneath them keep the levels they were approved on.',
  'clientProfile.changeLevelSave': 'Move to this level',
  'clientProfile.levelChanged': 'The partner’s commission level was changed.',
  'clientProfile.levelFailed': 'Could not change the commission level.',
  'clientProfile.levelOption': 'Level {level} · {name}',
  // The rates, because a rung number alone does not tell an operator what they
  // are about to change somebody's pay TO.
  'clientProfile.levelTerms': 'Partner {commission} · client rebate {rebate}',
  // Shares of the traded product's commission type (0140). What a share comes
  // to in money depends on which product the client trades, so the line names
  // the fraction rather than inventing a figure.
  'clientProfile.termCommissionShare': '{share}% of the product’s commission',
  'clientProfile.termRebateShare': '{share}% of its rebate',
  'clientProfile.levelNoneEnabled':
    'No commission level is enabled, so there is nothing to move this partner to.',
  'clientProfile.actionReassignParent': 'Reassign parent',
  'clientProfile.actionManageTags': 'Manage tags',
  'clientProfile.actionOpenKyc': 'View KYC',
  'clientProfile.actionViewAuditTrail': 'View audit trail',
  'clientProfile.actionViewCommissions': 'View commission ledger',
  'clientProfile.actionViewReferred': 'View clients they introduced',

  // ── Editing a client (CORE-18) ────────────────────────────────────────────
  //
  // Two actions, two permissions, two dialogs. The email copy carries the
  // consequences because three of them are invisible to the operator otherwise:
  // sessions die, verification resets, and the OLD address is emailed.
  'clientProfile.actionEditProfile': 'Edit profile',
  'clientProfile.actionChangeEmail': 'Change sign-in email',

  'clientProfile.editProfileTitle': 'Edit profile',
  'clientProfile.editProfileBody':
    'The client’s one profile — the same record their identity verification shows them. The sign-in email is changed separately: it logs the client out and needs its own permission.',
  'clientProfile.editProfileSaved': 'Profile updated',
  'clientProfile.editProfileFailed': 'This profile could not be updated.',
  'clientProfile.fieldFirstName': 'First name',
  'clientProfile.fieldLastName': 'Last name',
  // `clientProfile.fieldPhone` is NOT redeclared here — the profile section
  // above already owns it, and two entries for one label is a TS1117 the
  // moment both are in the same object.
  'clientProfile.fieldCountry': 'Country of residence',
  'clientProfile.fieldClearHint': 'Leave empty to remove it.',
  'clientProfile.fieldHiddenFromYou': 'Hidden from you — your role cannot see this field.',
  // The rest of the profile (0139) — asked for at sign-up and in KYC.
  'clientProfile.fieldDateOfBirth': 'Date of birth',
  'clientProfile.fieldNationality': 'Nationality',
  'clientProfile.fieldAddress': 'Street address',
  'clientProfile.fieldCity': 'City',
  'clientProfile.fieldStateProvince': 'State / Province',
  'clientProfile.fieldPostalCode': 'Postal / ZIP code',
  'clientProfile.fieldAddressLine': 'Address',
  'clientProfile.choose': 'Choose…',
  'clientProfile.listLoading': 'Loading the list…',
  // The server's per-field refusals are shown under their box; this is the line above.
  'clientProfile.fixHighlighted': 'Some fields need attention — see the messages below them.',
  // The lock, in the server's words (`lockedFields`), shown under each field.
  'clientProfile.lockedNotice':
    'Some fields are locked by the client’s identity verification. Each says where it can be changed.',
  // Said ONCE above the form, with the way to change a locked field.
  'clientProfile.lockedNoticeApproved':
    'The locked fields were verified by KYC. Only an admin who may correct verified details can change them.',
  'clientProfile.lockedNoticeInReview':
    'The locked fields are being checked against the client’s documents right now. They can change once the reviewer decides.',
  // A verified detail is corrected HERE (28 Sep 2026), never on another screen.
  'clientProfile.correctionNotice':
    'Some details were verified by KYC. You can correct them here: a change needs a reason, is checked again and recorded on the verification, and the client is told. They stay verified.',
  'clientProfile.verifiedBadge': 'Verified by KYC',
  'clientProfile.correctionReason': 'Reason for changing verified details',
  'clientProfile.correctionReasonPlaceholder':
    'e.g. Surname misspelt at sign-up; the passport reads "Haddad".',
  'clientProfile.correctionReasonHint':
    'Recorded on the verification beside the old and new values. The client is told which details changed.',
  // Under each locked field — the full sentence is kept for screen readers and on hover.
  'clientProfile.lockedVerified': 'Verified by KYC',
  'clientProfile.lockedInReview': 'Being checked by KYC',
  'clientProfile.lockedShort': 'Locked',

  'clientProfile.changeEmailTitle': 'Change sign-in email',
  'clientProfile.changeEmailWarnTitle': 'This changes how the client signs in.',
  'clientProfile.changeEmailWarnSessions':
    'They are signed out everywhere and must sign in again with the new address.',
  'clientProfile.changeEmailWarnVerify':
    'The new address starts unverified, and a verification link is sent to it.',
  'clientProfile.changeEmailWarnNotice':
    'Their previous address is emailed a notice that this happened. That is deliberate and cannot be skipped.',
  'clientProfile.changeEmailCurrent': 'Current address',
  'clientProfile.changeEmailNew': 'New address',
  'clientProfile.changeEmailConfirmLabel': 'Type {word} to confirm',
  'clientProfile.changeEmailSubmit': 'Change it',
  'clientProfile.changeEmailSaved': 'Sign-in email changed',
  'clientProfile.changeEmailFailed': 'The sign-in email could not be changed.',

  'clientProfile.reassignParentTitle': 'Reassign {name}’s parent',
  'clientProfile.reassignParentBody':
    'Who they sit under. The API refuses a choice that would close a loop, and a partner’s own level is not changed by moving them.',
  'clientProfile.reassignParentNone': 'No parent — deals with the broker directly',
  'clientProfile.reassignParentKeepOutside': 'Keep current — a partner outside your territory',
  'clientProfile.reassignParentSave': 'Reassign',
  'clientProfile.parentChanged': 'Parent reassigned',
  'clientProfile.parentFailed': 'Their parent could not be reassigned.',
  'clientProfile.manageTagsTitle': 'Tags for {name}',
  'clientProfile.manageTagsBody':
    'A tag decides which administrators can see this client, so removing one can take them out of your own scope — the API refuses that.',
  'clientProfile.done': 'Done',

  // ── Positions ─────────────────────────────────────────────────────────────
  'clientProfile.tabPositions': 'Positions',
  'clientProfile.posClosedTitle': 'Closed positions',
  'clientProfile.posSymbol': 'Symbol',
  'clientProfile.posSide': 'Side',
  'clientProfile.posVolume': 'Lots',
  'clientProfile.posAccount': 'Account',
  'clientProfile.posOpenPrice': 'Open',
  'clientProfile.posClosePrice': 'Close',
  'clientProfile.posRealised': 'Realised P/L',
  // MT5's own charges on the trade, taken on top of its result.
  'clientProfile.posCommission': 'Commission',
  'clientProfile.posSwap': 'Swap',
  'clientProfile.posDemo': 'Demo',
  'clientProfile.posOpened': 'Opened',
  'clientProfile.posClosed': 'Closed',
  'clientProfile.posLoading': 'Loading positions',
  'clientProfile.posLoadFailed': 'Their positions could not be loaded.',
  'clientProfile.posNoneClosed': 'No closed positions yet.',

  // ── Transactions tab (owner, 29 Sep 2026) — replaced History ──────────────
  'clientProfile.tabTransactions': 'Transactions',
  'clientProfile.txTabDeposits': 'Deposits',
  'clientProfile.txTabWithdrawals': 'Withdrawals',
  'clientProfile.txTabTransfers': 'Transfers',
  'clientProfile.txColDate': 'Date',
  'clientProfile.txColType': 'Type',
  'clientProfile.txColWay': 'Direction',
  'clientProfile.txColMethod': 'Method',
  'clientProfile.txColAmount': 'Amount',
  'clientProfile.txColState': 'Status',
  'clientProfile.txColDetails': 'Details',
  'clientProfile.txDetails': 'Details',
  'clientProfile.txDetailsFor': 'Details of {amount}',
  'clientProfile.txDetailsTitle': 'Transaction details',
  'clientProfile.txTypeDeposit': 'Deposit',
  'clientProfile.txTypeWithdrawal': 'Withdrawal',
  // A transfer, from the client's wallet's side.
  'clientProfile.txTransferToAccount': 'Wallet → trading account',
  'clientProfile.txTransferToWallet': 'Trading account → wallet',
  'clientProfile.txReceipt': 'Receipt',
  'clientProfile.txHasReceipt': 'Has a receipt',
  'clientProfile.txDestination': 'Paid to',
  'clientProfile.txReference': 'Provider reference',
  'clientProfile.txProviderId': 'Provider reference',
  'clientProfile.txTradingAccount': 'Trading account',
  'clientProfile.txCreated': 'Requested',
  'clientProfile.txReviewed': 'Decided',
  'clientProfile.txSettled': 'Completed',
  'clientProfile.txRejectedWhy': 'Why it was rejected',
  'clientProfile.txFailedWhy': 'Why it failed',
  'clientProfile.txAttention': 'Needs attention',
  'clientProfile.txId': 'Transaction ID',
  'clientProfile.txFilterState': 'Status',
  'clientProfile.txFilterStateAll': 'All statuses',
  'clientProfile.txFilterCurrency': 'Currency',
  'clientProfile.txFilterCurrencyAll': 'All currencies',
  'clientProfile.txNoMatch': 'Nothing matches these filters.',
  'clientProfile.txEmpty.deposits': 'This client has made no deposits yet.',
  'clientProfile.txEmpty.withdrawals': 'This client has requested no withdrawals yet.',
  'clientProfile.txEmpty.transfers':
    'This client has moved no money between wallet and accounts yet.',
  'clientProfile.txNoun': 'transaction',
  'clientProfile.txNounPlural': 'transactions',
  // Money that went through no payment method, named from where it came from.
  'clientProfile.txMethodTransfer': 'Internal transfer',
  'clientProfile.txMethodCommission': 'Commission',
  'clientProfile.txLoading': 'Loading transactions',
  'clientProfile.txLoadFailed': 'Their transactions could not be loaded.',

  // ── Accounts tab — this client's MT5 accounts (owner, 29 Sep 2026) ────────
  'clientProfile.tabAccounts': 'Accounts',
  'clientProfile.accountsTitle': 'Trading accounts',
  'clientProfile.accountsSearch': "Search this client's accounts",
  'clientProfile.accountsSearchPlaceholder': 'MT5 login',
  'clientProfile.accountsOpen': 'Open account',
  'clientProfile.accountsLinkExisting': 'Link existing',
  'clientProfile.accountsLoading': 'Loading trading accounts',
  'clientProfile.accountsLoadFailed': "This client's trading accounts could not be loaded.",
  'clientProfile.accountsNoMatch': 'No accounts match these filters.',
  'clientProfile.accountsEmpty': 'This client has no trading accounts yet.',

  // ── Documents tab — every file the client handed over (owner, 29 Sep 2026)
  // The sub-partner table on the Partner tab (owner, 29 Sep 2026).
  'clientProfile.subColPartner': 'Partner',
  'clientProfile.subColLevel': 'Level',
  'clientProfile.subColAgency': 'Agency',
  'clientProfile.subColClients': 'Clients',
  'clientProfile.subColPartners': 'Partners',
  'clientProfile.subColCode': 'Referral code',
  'clientProfile.subColStatus': 'Status',
  'clientProfile.subColSince': 'Partner since',
  'clientProfile.subNoAgency': 'Full catalogue',
  // The Overview's cards (owner, 29 Sep 2026: an overview should show much more).
  'clientProfile.ovPersonal': 'Personal details',
  'clientProfile.ovAccount': 'Account',
  'clientProfile.ovStatus': 'Account status',
  'clientProfile.ovType': 'Client type',
  'clientProfile.ovEmailConfirmed': 'Email confirmed',
  'clientProfile.ovIntroducedBy': 'Introduced by',
  'clientProfile.ovDirect': 'Nobody — joined directly',
  'clientProfile.ovNoTags': 'No tags',
  'clientProfile.ovKycReviewed': 'KYC reviewed',
  'clientProfile.ovKycDocuments': 'Documents submitted',
  'clientProfile.ovKycReason': 'Why it was refused',
  // The Overview's glance row — one figure each, opening its tab.
  'clientProfile.glanceBalance': 'Balance',
  'clientProfile.glanceNoWallet': 'No wallet yet',
  'clientProfile.glanceAccounts': 'Trading accounts',
  'clientProfile.glanceAccountsSplit': '{live} live · {demo} demo',
  'clientProfile.glanceDeposited': 'Deposited',
  'clientProfile.glanceWithdrawn': 'Withdrawn',
  'clientProfile.glancePending': 'Pending',
  'clientProfile.glanceLastActivity': 'Last activity',
  'clientProfile.glanceNever': 'None yet',
  'clientProfile.glancePartner': 'Partner earnings',
  'clientProfile.glancePartnerHint': '{clients} clients · {partners} partners',
  'clientProfile.tabDocuments': 'Documents',
  'clientProfile.docTitle': 'Documents',
  'clientProfile.docColDocument': 'Document',
  'clientProfile.docColType': 'Type',
  'clientProfile.docColStatus': 'Status',
  'clientProfile.docColDate': 'Uploaded',
  'clientProfile.docColFiles': 'Files',
  'clientProfile.docReplaced': 'Replaced',
  'clientProfile.docView': 'View',
  'clientProfile.docViewPages': 'View ({count} pages)',
  'clientProfile.docViewFor': 'View {name}',
  'clientProfile.docNoFiles': 'No file',
  'clientProfile.docCategory.identity': 'Identity',
  'clientProfile.docCategory.address': 'Proof of address',
  'clientProfile.docCategory.selfie': 'Selfie',
  'clientProfile.docCategory.kyc_other': 'Other KYC',
  'clientProfile.docCategory.deposit_receipt': 'Deposit receipt',
  'clientProfile.docStatus.pending': 'Pending',
  'clientProfile.docStatus.approved': 'Approved',
  'clientProfile.docStatus.rejected': 'Rejected',
  'clientProfile.docStatus.reverification_requested': 'Re-verification requested',
  'clientProfile.docStatus.draft': 'Not submitted',
  'clientProfile.docFilterType': 'Type',
  'clientProfile.docFilterTypeAll': 'All types',
  'clientProfile.docFilterStatus': 'Status',
  'clientProfile.docFilterStatusAll': 'All statuses',
  'clientProfile.docHiddenKyc': 'KYC documents are hidden by your permissions.',
  'clientProfile.docHiddenReceipts': 'Deposit receipts are hidden by your permissions.',
  'clientProfile.docHiddenBoth':
    'KYC documents and deposit receipts are hidden by your permissions.',
  'clientProfile.docNoMatch': 'No documents match these filters.',
  'clientProfile.docEmpty': 'This client has not uploaded any documents yet.',
  'clientProfile.docLoading': 'Loading documents',
  'clientProfile.docLoadFailed': "This client's documents could not be loaded.",

  // ── Wallets, as a table with a row menu ───────────────────────────────────
  /* The column now leads with the wallet's NAME and carries the code beneath
     it, because a partner's main and commission wallets in one currency were
     otherwise two identical "USD" rows. The key stays for anything still
     labelling a plain currency cell. */
  'clientProfile.walletCurrency': 'Currency',
  'clientProfile.walletName': 'Wallet',
  'clientProfile.walletNumber': 'Wallet no.',
  'clientProfile.walletBalance': 'Balance',
  'clientProfile.walletOnHold': 'On hold',
  'clientProfile.walletCloseAction': 'Close wallet',
  'clientProfile.walletActionsFor': 'Actions for the {currency} wallet',

  // ── The downline tree ─────────────────────────────────────────────────────
  'clientProfile.networkTitle': 'Downline',
  'clientProfile.networkLoading': 'Loading this branch',
  'clientProfile.networkEmpty': 'Nobody beneath them.',
  'clientProfile.networkToggle': 'Expand {name}',
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
  'invite.emailedOnly':
    'The invitation email has been sent. For security the activation link is not shown here — it mints an administrator account, so it is delivered only to the invitee’s mailbox. If it does not arrive, revoke the invite and send it again.',
  'invite.sendAnother': 'Send another invite',
  'invite.fullName': 'Full Name',
  'invite.email': 'Email Address',
  'invite.defaultRole': 'Default (KYC review + client list)',
  'invite.namePlaceholder': 'Jane Smith',
  'invite.emailPlaceholder': 'jane@oxshare.com',
  'invite.loadingParams': 'Loading invite parameters…',

  // ── KYC review ────────────────────────────────────────────────────────────
  'kycReview.title': 'KYC Submissions',
  'kycReview.searchPlaceholder': 'Search by name, email or Portal ID…',
  'kycReview.review': 'Review',
  'kycReview.colUser': 'User',
  'kycReview.colId': 'Portal ID',
  'kycReview.colCountry': 'Country',
  'kycReview.colStatus': 'Status',
  'kycReview.colSubmitted': 'Submitted',
  'kycReview.colReviewed': 'Reviewed',
  'kycReview.colAction': 'Action',
  'kycReview.filterAll': 'All',
  /*
   * The `submitted` status, named for what it means to the DESK rather than
   * for the action the client took. A separate key from `colSubmitted`, which
   * is the "Submitted" DATE column and genuinely does mean when — reusing that
   * one here is what made the tab say "Submitted" in the first place.
   */
  /*
   * "In progress" is the CLIENT still filling the wizard — nobody is waiting on
   * us. "Pending" and "Under Review" below are both post-submission and waiting
   * on a reviewer, which is why this one reads differently on purpose.
   */
  /*
   * The whole QUEUE — submitted plus under_review, the set the dashboard tile
   * and the sidebar badge count. Both used to link to `submitted` alone, so a
   * badge reading 17 opened a list of 12 and the five somebody had already
   * picked up fell off the daily sweep.
   */
  'kycReview.filterNeedsReview': 'Open',
  'kycReview.filterApproved': 'Approved',
  'kycReview.filterRejected': 'Rejected',
  'kycReview.backToList': 'Back to KYC list',
  'kycReview.personalInfo': 'Personal Information',
  // Heading for values the step configuration no longer describes — a field
  // renamed or removed in the builder after this client submitted. Shown rather
  // than hidden: it is still identity data somebody is deciding on.
  'kycReview.otherFields': 'Other Details',
  /*
   * A value under `customField_<timestamp>` that no step names any more — the
   * builder hides that key and generates it, so its shape means a question was
   * removed from the form after this client answered it. "Custom Field
   * 1790263652846" said the same thing in a way nobody could read.
   */
  'kycReview.retiredQuestion': 'Question no longer on the form',
  // A file answer whose original name was not kept.
  'kycReview.uploadedFile': 'Uploaded file',
  'kycReview.viewFile': 'View',
  'kycReview.valueYes': 'Yes',
  'kycReview.valueNo': 'No',
  'kycReview.notSubmitted': 'Not submitted',
  'kycReview.documentType': 'Document Type',
  'kycReview.flaggedFields': 'Flagged Fields for Correction:',
  'kycReview.timeline': 'Timeline',
  'kycReview.reviewed': 'Reviewed',
  /*
   * The decided labels carry the OUTCOME, so the name beside them answers "who
   * approved this client" rather than "who touched this record". "Reviewed" is
   * true of an approval and a rejection alike, which is what made it useless on
   * a card whose whole job is to record a decision.
   */
  'kycReview.approvedOn': 'Approved by',
  'kycReview.rejectedOn': 'Rejected by',
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
  'kycReview.waitingHours': 'waiting {hours}h',
  'kycReview.waitingUnderHour': 'waiting <1h',
  'kycReview.openFullSize': 'Open full size in a new tab',
  'kycReview.docPassport': 'Passport (photo & signature page)',
  'kycReview.docIdFront': 'ID document (front)',
  'kycReview.docIdBack': 'ID document (back)',
  /*
   * "Selfie VERIFICATION" was an overclaim in one word. Nothing verifies it:
   * the portal opens the front camera and uploads what it captures, and the
   * same `POST /kyc/upload` accepts any JPEG from any client, so a reviewer is
   * looking at a photograph and not at a liveness result. Naming it accurately
   * is free; `kycReview.selfieCaveat` says the rest once, beside the documents.
   */
  'kycReview.docSelfie': 'Selfie photo',
  'kycReview.selfieCaveat':
    'Selfies are captured from the client’s camera and are not liveness-verified — a photo of a photo would look the same here. Judge it as a photograph, against the ID.',
  'kycReview.docAddress': 'Proof of address',
  /*
   * A proof of address can be TWO pages — a bank statement's second sheet is
   * where the address often is. The client can upload it and the API stores
   * and serves it; until this label existed the review grid built four
   * candidates and silently dropped it, so a reviewer decided on page 1 alone.
   */
  'kycReview.docAddress2': 'Proof of address — page 2',
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
  'kycReview.colReviewer': 'Reviewer',
  'kycReview.release': 'Hand back',
  'kycReview.releaseAria': 'Hand this submission back to the queue',
  'kycReview.releaseHint':
    'Returns it to the queue so any reviewer can pick it up. Nothing is decided.',
  'kycReview.releaseFailed': 'Could not hand this submission back.',
  'kycReview.claimedBy': 'Being reviewed by {name}',
  'kycReview.claimedByUnknown': 'Being reviewed',
  'kycReview.claimHint':
    'Marks this submission as under review by you, so another admin does not review it at the same time',
  /*
   * THE KYC STATUS VOCABULARY — one family, read through `lib/kyc-status.ts`.
   *
   * There were THREE of these (`clients.kyc*`, `dashboard.kycStatus*` and this
   * one) plus a hardcoded map on the review queue. Renaming one left the other
   * four saying something else, so the same client read as "Pending" on the
   * queue and "Submitted" on the client list, the dashboard and the detail
   * page. The duplicates are gone; these six words are written only here.
   *
   * (The pill before that rendered `status.replace('_', ' ')` — English by
   * accident, and untranslatable by construction.)
   */
  'kycStatus.not_started': 'Not started',
  'kycStatus.in_progress': 'Incomplete',
  /*
   * "Pending", not "Submitted". The stored value records what the CLIENT did;
   * this says what it means to the DESK — waiting on a decision.
   */
  'kycStatus.submitted': 'Awaiting review',
  'kycStatus.under_review': 'In review',
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
  'builder.holdsAdded':
    'Your own step: any question, and any extra file or photo you need. Passports, ID cards and proofs of address are collected on their own steps, once.',
  'builder.holdsPersonal':
    'Questions of your own, asked after the identity — occupation, source of funds, a declaration. Uploads go on a step of your own.',
  'builder.checkboxChoices': 'Choices (optional)',
  'builder.checkboxChoicesPlaceholder': 'e.g. Salary, Savings, Gift',
  'builder.checkboxSingle':
    'No choices: a single tick box — the label is what the client confirms.',
  'builder.checkboxMany': '{count} {count:choice|choices} — the client ticks any that apply.',
  'builder.lockedLastDocument':
    'Clients must be offered at least one document here — add another first, or disable the step.',
  'builder.addField': 'Add Field',
  'builder.fieldLabel': 'Field Label',
  /*
   * Both identifiers are shown and not editable. They are storage keys: a
   * field's key is the column its answers live under, and a step's slug decides
   * which column the step writes to at all. The API refuses a rename that would
   * break either (`kyc-config-integrity.ts`); these titles say why before
   * anyone tries.
   */
  'builder.inputType': 'Input Type',
  'builder.typeText': 'Text Input',
  'builder.typeDate': 'Date Picker',
  'builder.typePhone': 'Phone Input',
  'builder.typeSelect': 'Dropdown Select',
  'builder.typeFile': 'File Uploader',
  'builder.typeCamera': 'Live Camera',
  'builder.typeCheckbox': 'Checkbox',
  'builder.newStepTitle': 'Add Custom Onboarding Step',
  'builder.newStepBody':
    'A step of your own, for questions and uploads the built-in steps do not cover. Its address is made from its name.',
  'builder.guidance': 'Description / Guidance',
  'builder.addStep': 'Add Step',
  'builder.titlePlaceholder': 'e.g., Employment & Tax Declaration',
  'builder.guidancePlaceholder':
    'e.g., Provide details about your employment status and source of funds.',
  'builder.newField': 'New Field',
  // ── The identity core (26 Sep 2026): what is the platform's, and what is yours ──
  'builder.identityBadge': 'Identity',
  'builder.identityRequiredNamed': '{label} is required',
  'builder.removeIdentity': 'Stop asking for this detail',
  'builder.removeIdentityNamed': 'Stop asking for {label}',
  'builder.addIdentity': 'Ask for an identity detail…',
  'builder.personalRowsTitle': 'Identity details and questions',
  'builder.personalRowsBody':
    'Arrange the client’s identity details and your own questions in any order. A detail you remove is not asked here — the client’s answer from sign-up stays on their profile.',
  'builder.evidenceRequired': 'Required',
  'builder.evidenceRequiredHint': 'The client must provide this before they can submit.',
  'builder.evidenceOptionalHint': 'Optional: the client may skip this step’s evidence.',
  'builder.moveTo': 'Move to…',
  'builder.moveFieldNamed': 'Move {label} to another step',
  'builder.identityTitle': "The client's identity",
  'builder.identityBody':
    'Fixed by the platform, as in any regulated CRM: these fields, their labels and which are required cannot be changed, removed or asked twice. The client fills them in at sign-up and confirms them here.',
  'builder.identityLockedSr': '(fixed by the platform)',
  'builder.identityRequired': 'Required to verify',
  'builder.identityOptional': 'Optional',
  'builder.identitySummary':
    "Personal Information asks for {count} of the client's identity details — arrange them on its tab. Below are the fields you added.",
  'builder.acceptedIdentityBody':
    'The client chooses ONE of the documents ticked here and uploads its pages. Each is collected once, only on this step.',
  'builder.acceptedAddressBody':
    'The client chooses ONE of the documents ticked here as proof of their address.',
  'builder.builtIn': 'Built-in',
  'builder.alwaysOn': 'Always on',
  'builder.selfieFixed':
    'The client takes one live selfie with their camera, compared with their identity document. Nothing here to configure — switch the step off to stop asking for one.',
  'builder.yourQuestions': 'Your questions',
  'builder.fieldsTitle': 'Fields',
  'builder.addQuestion': 'Add question',
  'builder.noQuestions': 'No questions of your own yet.',
  'builder.noOwnFields': 'No fields of your own yet.',
  'builder.personalFirst':
    'Personal Information comes first: every later step is checked against the identity it collects.',
  'builder.moveUpNamed': 'Move {title} up',
  'builder.moveDownNamed': 'Move {title} down',
  'builder.defaultStepDescription': 'A few more details we need to complete your verification.',
  'builder.staleBody':
    'Someone else changed this form while you were editing it. Reload to see their changes, then make yours again.',
  'builder.reload': 'Reload',
  'builder.loadFailed': 'The KYC form could not be loaded.',

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
  'roles.yourRole': 'Your role',
  'roles.yourRoleHint':
    'This role decides your own access, so you cannot edit it. Another administrator with role access can.',
  'roles.selfReadOnly':
    'You cannot edit the role you are assigned to — it decides your own access. Ask another administrator with role access to make this change.',
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
  'settings.tabJobs': 'Scheduled jobs',

  // ── Settings → Scheduled jobs (29 Sep 2026): every background job's timing ──
  'jobs.title': 'Scheduled jobs',
  'jobs.subtitle':
    'How often each background job runs. A change applies within 15 seconds (within a minute for the MT5 bridge), with no restart.',
  'jobs.readOnly': 'You can see these timings but not change them.',
  'jobs.loading': 'Loading scheduled jobs',
  'jobs.loadFailed': 'Could not load the scheduled jobs.',
  'jobs.groupMt5': 'MT5',
  'jobs.groupCommission': 'Commission',
  'jobs.groupMoney': 'Money',
  'jobs.groupSystem': 'System',
  'jobs.colJob': 'Job',
  'jobs.colEvery': 'Runs every',
  'jobs.colLastRun': 'Last run',
  'jobs.runsOnBridge': 'On the MT5 bridge',
  'jobs.unitSeconds': 'seconds',
  'jobs.unitMinutes': 'minutes',
  'jobs.unitHours': 'hours',
  'jobs.unitDays': 'days',
  'jobs.unitSecond': 'second',
  'jobs.unitMinute': 'minute',
  'jobs.unitHour': 'hour',
  'jobs.unitDay': 'day',
  'jobs.unit': 'Unit',
  'jobs.interval': 'How often {job} runs',
  'jobs.save': 'Save',
  'jobs.saved': '{job} now runs every {every}.',
  'jobs.saveFailed': 'Could not change the interval.',
  'jobs.bounds': 'Between {min} and {max}.',
  'jobs.outOfBounds': 'Choose between {min} and {max}.',
  'jobs.default': 'Default {every}',
  'jobs.runNow': 'Run now',
  'jobs.runRequested': '{job} will start within 15 seconds.',
  'jobs.runFailed': 'Could not start the job.',
  'jobs.never': 'Not run yet',
  'jobs.running': 'Running…',
  'jobs.ok': 'OK',
  'jobs.failed': 'Failed',
  'jobs.lastRun': '{when} · took {duration}',
  'jobs.bridgeRead': 'Bridge read this {when}',
  'jobs.bridgeNeverRead': 'The bridge has not read this yet',
  'jobs.sharedCommission':
    'One interval for both commission jobs, and also how long a commission is held before it is paid — the same value as Trading → commission interval.',
  'jobs.label.bridge.sweep': 'MT5 deal & balance sweep',
  'jobs.desc.bridge.sweep':
    'The bridge re-reads recent deals from MT5 and refreshes account balances.',
  'jobs.label.mt5.syncAccounts': 'MT5 account sync',
  'jobs.desc.mt5.syncAccounts':
    'Adds MT5 accounts the CRM does not have yet, with no client, to be assigned.',
  'jobs.label.mt5.syncGroups': 'MT5 group sync',
  'jobs.desc.mt5.syncGroups':
    'Re-reads the MT5 group catalogue and flags groups that changed or vanished.',
  'jobs.label.ib.accrueDeals': 'Commission — calculate from trades',
  'jobs.desc.ib.accrueDeals': 'Turns closed MT5 trades into commission owed to partners.',
  'jobs.label.ib.confirmAccruals': 'Commission — pay partners',
  'jobs.desc.ib.confirmAccruals': 'Credits matured commission to partners’ commission wallets.',
  'jobs.label.payments.resumeTransfers': 'Resume stuck transfers',
  'jobs.desc.payments.resumeTransfers':
    'Retries wallet ↔ MT5 transfers that stopped halfway, e.g. while the bridge was down.',
  'jobs.label.rival.reconcile': 'Payment gateway check',
  'jobs.desc.rival.reconcile':
    'Asks the payment gateway about payments still waiting for an answer.',
  'jobs.label.payments.foldMovementTotals': 'Financial totals',
  'jobs.desc.payments.foldMovementTotals': 'Keeps the Financial list totals and counts up to date.',
  'jobs.label.wallet.reconcile': 'Wallet reconciliation',
  'jobs.desc.wallet.reconcile':
    'Checks every wallet balance against its ledger and alerts on a mismatch.',
  'jobs.label.security.sweep': 'Security sweep',
  'jobs.desc.security.sweep':
    'Clears expired sessions, old request keys and login-attempt counters.',
  'jobs.label.notifications.prune': 'Notification clean-up',
  'jobs.desc.notifications.prune':
    'Deletes old notifications (clients after 90 days, admins after a year).',

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
  // ── How often commission is paid (0113) ───────────────────────────────────
  // Replaced "Maximum commission levels", which capped how deep the ladder
  // could go. That is the IB Levels page's job now — add a rung and it pays.
  'tradingSettings.commissionInterval': 'Pay commission every',
  'tradingSettings.commissionIntervalHint':
    'How often partners are paid, and how long each commission waits before it becomes ' +
    'spendable — one number for both. Set it to a minute and a partner is credited about a ' +
    'minute after the trade closes.',
  'tradingSettings.commissionIntervalUnit': 'Unit',
  'tradingSettings.unitMinutes': 'minutes',
  'tradingSettings.unitHours': 'hours',
  'tradingSettings.unitDays': 'days',
  // ⚠️ Shown only below an hour, so it keeps its force. The wait is not a delay
  // for its own sake — it is the window in which a bad trade can be caught
  // BEFORE the commission on it can be withdrawn.
  'tradingSettings.commissionIntervalShortWarning':
    'Under an hour leaves almost no time to review a trade before the commission on it becomes ' +
    'spendable. Reversing it later means taking back money the partner may already have moved.',
  'tradingSettings.maxDemoDeposit': 'Largest demo starting balance',
  'tradingSettings.maxDemoDepositHint':
    'A client asking for more gets this instead. Practice with position sizes nobody would really trade teaches nothing.',
  'tradingSettings.holdHours': 'Settlement window (hours)',
  // The rule between earned and spendable, said plainly: an operator setting
  // this is deciding how long the desk has to catch a reversal before a
  // partner can move the money.
  'tradingSettings.holdHoursHint':
    'How long a commission is held before a partner can spend it. 0 pays as soon as it is ' +
    'calculated, which leaves no window to reverse a trade in.',
  // WHAT a partner is paid on, as against how long it is held. This was a
  // constant in the API's source until it became a setting, so the hint carries
  // the whole decision: what each option means, and the order that matters.
  'tradingSettings.revenueBasis': 'Partners are paid on',
  'tradingSettings.revenueBasisHint':
    'Which of the broker earnings a partner rate applies to. Charges is what the platform has ' +
    'always paid on. Changing this re-prices FUTURE trades only — nothing already calculated is ' +
    'restated.',
  'tradingSettings.revenueBasisWarning':
    'Before choosing an option that includes spread, set the spread markup on every product. A ' +
    'product left at 0 earns nothing, and a trade that earns nothing is closed permanently — ' +
    'changing this back will not recover it.',
  'tradingSettings.revenueBasis.commission_swap': 'Charges — commission + swap (default)',
  'tradingSettings.revenueBasis.spread': 'Spread — lots x the product markup',
  'tradingSettings.revenueBasis.commission_swap_spread': 'Both — charges and spread',
  // The BACKLOG DECISION — the only irreversible field on this form, and the
  // one that had no control at all until now. Three meanings, one of which is a
  // moment, so the copy has to carry what each option actually does rather than
  // leaving an operator to infer it from a date box.
  'tradingSettings.accrualStart': 'Commission is paid from',
  'tradingSettings.accrualStartHint':
    'Which trades the engine will pay partners for. This applies ONLY to trades it has not already ' +
    'decided — a trade already processed is never revisited, so changing this later re-prices ' +
    'nothing and reports no error.',
  'tradingSettings.accrualStart.unset': 'Not decided yet — the engine holds',
  'tradingSettings.accrualStart.all': 'Every trade on record, including history',
  'tradingSettings.accrualStart.from': 'Trades from a date onwards',
  'tradingSettings.accrualStartDate': 'Paying from',
  'tradingSettings.accrualStartUnsetNote':
    'While this is undecided the engine stops rather than paying a backlog nobody chose. That is ' +
    'the safe state, and it is also indistinguishable from "no trades yet" — so it will not ' +
    'resolve itself.',
  'tradingSettings.accrualStartWarning':
    'Money paid to a partner for a trade nobody meant to pay for comes back by conversation, not ' +
    'by changing this field.',
  'tradingSettings.accrualStartDateMissing': 'Choose the date commission should be paid from.',
  'tradingSettings.confirmAccrualTitle': 'Pay commission on every trade on record?',
  'tradingSettings.confirmAccrualAllBody':
    'This includes the whole history the platform has ingested. On a busy book that can be months ' +
    'of commission credited in a single run, and it cannot be undone from this screen.',
  'tradingSettings.confirmAccrualFromTitle': 'Start paying commission from {date}?',
  'tradingSettings.confirmAccrualFromBody':
    'Trades before this date will be marked decided and will never accrue. Trades from it onwards ' +
    'will be paid on the next run. Neither is reversible from this screen.',
  'tradingSettings.confirmAccrualAction': 'Set the start date',
  'tradingSettings.readOnly': 'You do not have permission to change these.',
  'tradingSettings.updateFailed': 'Could not save the trading settings.',
  'tradingSettings.save': 'Save changes',
  /*
   * WHO last saved this, and when.
   *
   * Every settings save records the administrator and no panel showed it, so
   * "who changed the commission basis / the leverage ladder / the SMTP host,
   * and when" was answerable only from the audit log — on settings that decide
   * what partners are paid and whether mail leaves the building.
   */
  'settings.lastSavedBy': 'Last saved by {who} · {when}',
  'settings.lastSavedAt': 'Last saved {when}',
  'tradingSettings.saving': 'Saving...',
  'tradingSettings.saved': 'Saved',

  // ── Products tab ──────────────────────────────────────────────────────────
  'products.title': 'Products',
  'products.pageTitle': 'Products',
  'products.editTitle': 'Edit product',
  'products.createTitle': 'Add product',
  'products.saving': 'Saving...',
  // Says what the number DOES to the rest of the list, because it now moves
  // them. "Lower comes first" described a sort key; this describes an insert.
  // The rate card this product pays partners on (0140). The spread markup
  // that stood here drove nothing and is gone.
  'products.commissionType': 'Commission type',
  'products.commissionTypeHint':
    'What this product pays per lot — the partners’ commission and the client’s rebate. Each ' +
    'commission level takes its share of it. Leave it unset for a product that pays no partner ' +
    'commission.',
  'products.commissionTypeNone': 'None — pays no partner commission',
  'products.commissionTypeDemo': 'The demo product never pays commission.',
  'products.commissionTypeInactive': 'inactive',
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
  'products.colCommissionType': 'Commission type',
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
  'products.claimed': 'also on another product',
  // One group per currency on a product: says which group holds the currency.
  'products.currencyTaken': '{currency} is already {group} — remove it first',
  /*
   * A picker that cannot say how stale it is reads exactly like a current one.
   *
   * The catalogue endpoint falls back to the SYNCED list when MT5 cannot be
   * reached, and every row carries `lastSeenAt` for precisely this — its own
   * DTO ends "Surface it". Nothing rendered it, so an operator attaching a
   * group during an outage picked from a possibly-weeks-old list presented as
   * live.
   */
  'products.groupsStale': 'MT5 is unreachable — showing the last synced list (confirmed {at}).',
  'products.groupsUnavailable':
    'Could not read the groups from MT5. The bridge may be down — attaching needs it, because the group is verified against the server.',
  'products.live': 'Live',
  'products.demo': 'Demo',
  'products.type': 'Type',
  'products.typeReal': 'Real',
  'products.typeDemo': 'Demo',
  'products.typeHint':
    'Real products carry live MT5 groups and are sold through agencies. The demo product carries demo groups and is offered to every client automatically — only one can exist.',
  'products.typeDemoExists':
    'A demo product already exists, and only one can. Edit that product to change what demo accounts open in.',
  'products.typeLocked': 'Fixed when the product was created.',

  // ── Agencies tab ──────────────────────────────────────────────────────────
  'agencies.title': 'Agencies',
  'agencies.pageTitle': 'Agencies',
  // The agency's default terms. Labelled for WHEN it applies, because it is a
  // default and not an assignment — a reviewer can still choose otherwise at
  // approval, and a label reading "Commission programme" would hide that.
  'agencies.colProgram': 'Programme',
  'agencies.programNotSet': 'Not set',
  // Shown when the agency points at a programme the catalogue no longer lists —
  // deletion clears the pointer, so in practice this catches a partial read
  // rather than a real dangling reference. Named rather than blank: an empty
  // cell reads as "not set", which is a different and less urgent state.
  'agencies.programMissing': 'Unknown programme',
  'agencies.defaultProgram': 'Commission programme for new partners',
  'agencies.defaultProgramNone': 'None — use the first enabled programme',
  'agencies.defaultProgramHint':
    'Pre-selected when a partner is approved into this agency. The reviewer can still pick a ' +
    'different one, and changing it never re-prices partners already approved.',
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
  // Sign-up mails a CODE (and a link) since 25 Sep 2026; withdrawals send no
  // code at all any more, so neither the old "links" nor "withdrawal codes" held.
  'smtp.subtitle':
    'How this system sends sign-up verification codes, password resets and admin invitations.',
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
  'builder.noFieldsHint': 'No custom fields added yet. Click "Add Field" to configure inputs.',
  /*
   * This string existed with NO consumer: somebody wrote the copy for a lock and
   * the input stayed editable, so the intent survived and the behaviour did not.
   * It is now the tooltip on a genuinely read-only field, and reworded from a
   * suffix label into the sentence a tooltip has to be. `builder.slugLockedFull`
   * beside it is still orphaned.
   */
  'builder.noFields': 'No custom fields added yet.',

  // Field editor — `options` and `hint` are in the API schema and had no
  // control at all until the tabbed rework.
  'builder.fieldHint': 'Helper Text',
  'builder.fieldHintPlaceholder': 'e.g., As shown on your ID',
  'builder.fieldOptions': 'Dropdown Choices',
  'builder.fieldOptionsPlaceholder': 'Passport, National ID, Driving licence',
  'builder.fieldOptionsEmpty':
    'Separate choices with commas. A dropdown with none is empty for the client.',
  'builder.fieldOptionsCount': '{count} choices, comma separated.',
  'builder.requiredField': 'Required',
  'builder.removeField': 'Remove',
  'builder.removeFieldNamed': 'Remove field {label}',

  // Tabs, drag and drop, and the summary rail.
  'builder.tabSteps': 'Steps & Fields',
  'builder.tabPreview': 'Flow Preview',
  'builder.tabAll': 'All Fields',
  'builder.reorderStep': 'Reorder step {title}',
  'builder.reorderField': 'Reorder field {label}',
  'builder.dragHint': 'Drag the handle to reorder, or use the arrow buttons.',
  'builder.unsaved': 'Unsaved changes',
  'builder.unsavedBody': 'Your edits are not live until you save.',
  'builder.stepsCount': '{count} steps',
  'builder.activeCount': '{count} active',
  'builder.previewIntro':
    'The order a client walks through, exactly as the portal renders it. Disabled steps are skipped.',
  'builder.previewSkipped': 'Skipped — step is disabled',
  'builder.allFieldsIntro':
    'Every field across every step, so a duplicated key name or a select with no choices is visible without opening each step.',
  'builder.duplicateKey': 'Duplicate key name',
  'builder.emptySelect': 'Dropdown with no choices',
  'builder.problemsFound': '{count} to look at',
  'builder.noProblems': 'Nothing to flag.',
  'builder.colStep': 'Step',
  'builder.colField': 'Field',
  'builder.colType': 'Type',
  'builder.colRequired': 'Required',
  'builder.yes': 'Yes',
  'builder.no': 'No',
  'builder.active': 'Active',
  'builder.disabled': 'Disabled',
  'builder.enable': 'Enable',
  'builder.disable': 'Disable',
  'builder.deleteStep': 'Delete step',
  'builder.deleteStepNamed': 'Delete step {title}',
  'builder.saveAll': 'Save all changes',
  'builder.savingAll': 'Saving…',
  'builder.saved': 'KYC onboarding steps updated successfully.',
  'builder.saveFailed': 'Error saving configuration.',
  'builder.resetDone': 'Reset to default KYC configuration.',
  'builder.resetFailed': 'Failed to reset steps.',
  'builder.stepAdded': 'Added step "{title}". Remember to save your changes.',
  'builder.stepDeleted': 'Step deleted.',
  'builder.noSteps': 'No steps configured yet.',
  // The `document` field type: one field that is the picker AND its uploads.
  'builder.acceptedDocuments': 'Documents this step accepts',
  'builder.documentParts': '{count} {count:photo|photos} required',
  'builder.tabOverview': 'Overview',
  'builder.openStep': 'Open',
  // Per-ACTION, not one shared string. A disabled control has to say why IT is
  // disabled: "cannot be disabled or deleted" on a delete button makes the
  // reader work out which half applies to the thing they just clicked.

  'kycReview.totalSubmissions': '{count} total submissions',
  'kycReview.rejectionReasonLabel': '❌ Rejection Reason',
  'kycReview.uploadedFiles': 'Uploaded files ({docType})',
  /*
   * No glyphs. These carried a literal '✓' and '✕' from when the buttons were
   * plain text; the dock renders real icons beside them now, so the characters
   * were a second tick next to the first — and a punctuation mark a screen
   * reader either announces as noise or skips entirely.
   *
   * The buttons carry a fuller `aria-label` ("Approve KYC submission"), which
   * CONTAINS this visible text — the label-in-name rule — so the short word
   * reads on screen and the accessible name still says what is being approved
   * to somebody navigating a list of buttons out of context.
   */
  'kycReview.approveCta': 'Approve',
  'kycReview.rejectCta': 'Reject',
  'kycReview.approveAria': 'Approve KYC submission',
  'kycReview.rejectAria': 'Reject KYC submission',
  'kycReview.approvedNote': '✅ KYC has been approved. User verification level set to 1.',
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
  'auditLog.filterByAction': 'Filter by action',
  'clients.searchAria': 'Search clients by name, email or Portal ID',
  'kycBuilder.requiredStepTitle': 'Required by FR-CORE-15 — cannot be disabled or deleted',
  'kycBuilder.moveStepUp': 'Move Step Up',
  'kycBuilder.moveStepDown': 'Move Step Down',
  'kycBuilder.removeField': 'Remove Field',
  'kycBuilder.expandStep': 'Show step details — {name}',
  'kycBuilder.collapseStep': 'Hide step details — {name}',
  'kyc.searchAria': 'Search submissions by name, email or Portal ID',
  'kyc.loadingQueue': 'Loading KYC submissions',
  'kyc.queueLoadFailed':
    'Failed to load the review queue. This is NOT an empty queue — submissions may be waiting.',
  'kyc.queueCaption': 'KYC Submissions',
  'kyc.queueEmpty': 'No submissions match the current filters.',
  'kyc.nounSingular': 'submission',
  'kyc.nounPlural': 'submissions',
  // The `ledger.*` keys went with the ledger screen. `getLedger` is back in
  // lib/api/admin.ts and the endpoint exists, but no page renders it yet, and a
  // catalogue entry with no call site is a string nobody can find.
  'login.emailPlaceholder': 'admin@oxshare.com',
  'withdrawals.rejectTitle': 'Reject Withdrawal',
  'pagination.firstTitle': 'First Page',
  'pagination.firstAria': 'Go to First Page',
  'pagination.previousTitle': 'Previous Page',
  'pagination.nextTitle': 'Next Page',
  'pagination.lastTitle': 'Last Page',
  'pagination.lastAria': 'Go to Last Page',
  'common.close': 'Close',
  'common.clearSearch': 'Clear search',
  'common.copy': 'Copy',
  /* The CopyableId button's default label. Says what lands on the clipboard —
     the FULL value, not the characters a truncated cell shows. A Portal ID
     passes its own label (`common.copyPortalId`). */
  'common.copyId': 'Copy full ID',
  'common.portalId': 'Portal ID',
  'common.copyPortalId': 'Copy Portal ID',
  'common.clientRemoved': 'Client no longer exists',
  /*
   * Copying can FAIL, and silently: `navigator.clipboard` is undefined on
   * plain HTTP and the promise rejects when permission is denied. Without a
   * message the button looks identical to one that was never pressed, and the
   * operator pastes whatever was on the clipboard before.
   */
  'common.copyFailed': 'Could not copy — select the value and copy it manually.',
  'common.copied': 'Copied',
  // ── Link an existing MT5 account to a client (owner, 29 Sep 2026) ────────
  'linkAccount.title': 'Link an existing MT5 account',
  'linkAccount.action': 'Link MT5 account',
  'linkAccount.headerButton': 'Link account',
  'linkAccount.stepClient': '1 · Client',
  'linkAccount.stepAccount': '2 · MT5 account',
  'linkAccount.stepCompare': '3 · Check they match',
  'linkAccount.stepProduct': '4 · Product',
  'linkAccount.changeClient': 'Change',
  'linkAccount.clientSearch': 'Search clients',
  'linkAccount.clientSearchPlaceholder': 'Name, email or Portal ID',
  'linkAccount.searching': 'Searching…',
  'linkAccount.noClients': 'No client matches.',
  'linkAccount.loginLabel': 'MT5 login',
  'linkAccount.find': 'Find',
  'linkAccount.lookupFailed': 'That login could not be looked up.',
  'linkAccount.sideClient': 'Client in the CRM',
  'linkAccount.sideMt5': 'MT5 account {login}',
  'linkAccount.pickClientFirst': 'Choose the client above.',
  'linkAccount.name': 'Name',
  'linkAccount.email': 'Email',
  'linkAccount.portalId': 'Portal ID',
  'linkAccount.country': 'Country',
  'linkAccount.group': 'Group',
  'linkAccount.balance': 'Balance',
  'linkAccount.leverage': 'Leverage',
  'linkAccount.environment': 'Type',
  'linkAccount.namesDiffer':
    'The names do not look alike — make sure this is the right client before linking.',
  'linkAccount.ownedBy':
    'This account is already linked to {who}. Moving an account between clients is not done here.',
  'linkAccount.ownedOutside': 'This account is already linked to a client outside your territory.',
  'linkAccount.currencyUnknown':
    'This account is in {currency}, which the platform does not hold. Add the currency first.',
  'linkAccount.waitingDeals':
    '{count} of its trades are waiting for an owner — they earn commission on the next run once linked.',
  'linkAccount.noProduct':
    'No product sells the group {group}. You can link it now and set the product once the group is attached to one — until then its trades pay no commission.',
  'linkAccount.productLabel': 'Product',
  'linkAccount.productPlaceholder': 'Choose the product',
  'linkAccount.productHint':
    "The product decides the commission its trades pay. Only products that sell this account's group are offered.",
  'linkAccount.link': 'Link account',
  'linkAccount.failed': 'The account could not be linked.',
  'linkAccount.succeeded': 'MT5 account {login} linked',
  'linkAccount.doneTitle': "Account {login} is now this client's.",
  'linkAccount.doneWaiting': '{count} waiting trades will earn commission on the next run.',
  'linkAccount.doneNoWaiting': 'Its trades will earn commission from now on.',
  // ── Set an account's product ─────────────────────────────────────────────
  'setProduct.action': 'Set product',
  'setProduct.title': "Set the account's product",
  'setProduct.intro':
    'Account {login}, in the MT5 group {group}. The product decides the commission its trades pay.',
  'setProduct.noSellers':
    'No product sells the group {group}. Attach the group to a product first.',
  'setProduct.label': 'Product',
  'setProduct.placeholder': 'Choose the product',
  'setProduct.none': 'No product',
  'setProduct.hint':
    'Applies to trades not yet paid on; commission already calculated keeps its terms.',
  'setProduct.save': 'Save',
  'setProduct.saved': 'Product set on {login}',
  'setProduct.failed': 'The product could not be set.',
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
  'nav.leverages': 'Leverages',
  // "Reconciliation", not "Ledger check": it is the accounting term an operator
  // on a money system already knows, and the screen answers exactly the
  // question that word asks.
  'nav.reconciliation': 'Reconciliation',

  // ── Financial (GET /admin/transactions — every money movement) ────────────
  'nav.financial': 'All transactions',
  'financial.title': 'Financial',
  'financial.subtitle':
    'Every money movement on the platform — deposits, withdrawals and internal transfers, across every client. Read-only: withdrawals are actioned on the Transactions desk.',
  'financial.loading': 'Loading movements',
  'financial.loadFailed': 'Could not load the movement list.',
  'financial.empty': 'No money has moved yet.',
  'financial.emptyFiltered': 'No movements match these filters.',
  'financial.caption': 'Money movements',
  'financial.noun': 'movement',
  'financial.nounPlural': 'movements',
  'financial.searchPlaceholder': 'Search by name, email or Portal ID…',
  'financial.searchAria': 'Search movements by client',
  'financial.clearFilters': 'Clear',
  'financial.colClient': 'Client',
  'financial.colMovement': 'Movement',
  'financial.colAmount': 'Amount',
  'financial.colCurrency': 'Currency',
  'financial.colMethod': 'Method',
  'financial.colState': 'State',
  'financial.colCreated': 'Created',
  'financial.colSettled': 'Settled',
  // The wallet-side direction — printed for payments; transfers print their
  // kind instead, because "Withdrawal" on a wallet→account transfer would
  // read as money leaving the platform.
  'financial.direction.deposit': 'Deposit',
  'financial.direction.withdrawal': 'Withdrawal',
  'financial.directionAll': 'All movements',
  'financial.kind.payment': 'Payment',
  'financial.kind.transfer': 'Trading transfer',
  'financial.kind.commission_transfer': 'Commission transfer',
  'financial.kindAll': 'All kinds',
  // `approved`/`rejected` only ever occur on payment withdrawals; transfers
  // arrive pre-mapped to pending/success/failure.
  'financial.state.pending': 'Pending',
  'financial.state.approved': 'Approved',
  'financial.state.success': 'Success',
  'financial.state.failure': 'Failure',
  'financial.state.rejected': 'Rejected',
  'financial.stateAll': 'All states',
  /*
   * Releasing a transfer the bridge left in flight.
   *
   * Every string here is written for the one moment that matters: an operator
   * about to state that money did NOT move, on evidence this system cannot see.
   * The warning is not decoration — releasing a transfer MT5 actually applied
   * lets the client spend the same money twice — so it names the check to make
   * rather than saying "are you sure".
   */
  /*
   * The stuck-transfer banner.
   *
   * Leads with what is NOT wrong. "No money has moved" is the operator's first
   * question and the answer is reassuring — the wallet is debited only once MT5
   * confirms — so saying it first stops the banner reading as a loss.
   *
   * Then what IS wrong, which is a client watching a spinner, and then the
   * cause, because the fix is usually on the MT5 side rather than in here.
   */
  // Two sentences, not "transfer(s)": the banner is read in the one moment an
  // operator is deciding whether money went missing, and should read as prose.
  'financial.stuckBannerOne':
    'One transfer has been processing for over {minutes} minutes. No money has moved — a ' +
    'wallet is debited only once MT5 confirms — but the client is watching a spinner. The ' +
    'usual cause is the MT5 bridge having lost its session. Release the hold from the row’s ⋯ ' +
    'menu once the broker confirms the money never arrived.',
  'financial.stuckBanner':
    '{count} transfers have been processing for over {minutes} minutes. No money has moved — a ' +
    'wallet is debited only once MT5 confirms — but the clients are watching a spinner. The ' +
    'usual cause is the MT5 bridge having lost its session. Release the hold from a row’s ⋯ menu ' +
    'once the broker confirms the money never arrived.',
  'financial.rowActionsLabel': 'Actions for this movement',
  'financial.abandon': 'Release hold',
  'financial.abandonTitle': 'Release this stuck transfer',
  'financial.abandonIntro':
    'This transfer has been waiting on the MT5 bridge since {created}. Releasing it frees the ' +
    'hold on {amount} {currency} and makes the money spendable again for {email}.',
  'financial.abandonWarning':
    'Check the broker’s own deal history first. If MT5 did apply this movement, releasing the ' +
    'hold lets the client spend money that has already left their account.',
  'financial.abandonReason': 'What did the broker’s record show?',
  // Counts DOWN the shortfall, not up to the limit: the operator's question
  // at that moment is "why will this not submit", and the answer is a
  // number of characters still needed.
  'financial.abandonReasonTooShort': '{count} more characters',
  'financial.abandonReasonHint':
    'At least 10 characters, and shown to the client beside the failed transfer.',
  'financial.abandonReasonPlaceholder':
    'Confirmed with the broker that the trading account was never credited.',
  'financial.abandonConfirm': 'Release the hold',
  'financial.abandoning': 'Releasing…',
  'financial.abandonSucceeded': 'Hold released on {amount} — the money is spendable again',
  'financial.abandonFailed': 'Could not release the hold.',

  // ── A payment only a PERSON can settle (the attention flag, backend 0140) ──
  // An amount the platform reported differently, a reversal, money paid
  // against a failed row, or two platforms disagreeing about a payout.
  // "Mark resolved" is what ends the admin task about it, for everyone.
  'attention.badge': 'Needs attention',
  'attention.filter': 'Needs attention',
  'attention.filterTitle': 'Only payments flagged for a person to reconcile',
  'attention.resolve': 'Mark resolved',
  'attention.resolveTitle': 'Mark as resolved',
  'attention.resolveIntroDeposit':
    'A deposit of {amount} for client #{portalId} was flagged for a person to check.',
  'attention.resolveIntroWithdrawal':
    'A withdrawal of {amount} for client #{portalId} was flagged for a person to check.',
  'attention.reasonLabel': 'Why it was flagged',
  'attention.noReason': 'No reason was recorded with the flag.',
  'attention.noteLabel': 'What did you find?',
  'attention.notePlaceholder':
    'Checked the payment platform: the reversal was a duplicate and the client is credited correctly.',
  'attention.noteHint':
    'Saved to the audit log with your name. This moves no money — make any correction first.',
  'attention.noteTooShort': '{count} more {count:character|characters}',
  'attention.confirm': 'Mark resolved',
  'attention.resolving': 'Resolving…',
  'attention.resolved': 'Marked as resolved — the task is cleared for every admin',
  'attention.resolveFailed': 'Could not mark it as resolved.',

  'financial.filterKind': 'Kind',
  'financial.filterState': 'State',
  'financial.filterCurrency': 'Currency',
  'financial.filterCurrencyAll': 'All currencies',
  'financial.filterFrom': 'From',
  'financial.filterTo': 'To',
  'financial.dateAny': 'Any date',
  'financial.dateClear': 'Clear date',
  'financial.tileDeposits': 'Deposits',
  'financial.tileWithdrawals': 'Withdrawals',
  'financial.tileMovements': 'Movements',
  // The dash when the summary has nothing to total — "no money", not "loading".
  'financial.tileHintNone': '—',
  'financial.tileMovementsHint': 'Everything matching the current filters',
  // The one provider value recognised by name — a hand-placed admin credit
  // went through no payment method, so its raw key is not a rail name.
  'financial.methodManualCredit': 'Manual credit',
  // RBAC-03 — what the masked-fields notice calls the hidden client fields.
  'financial.maskedLabelEmail': 'Email address',
  'financial.maskedLabelName': 'Client name',
  // The desk link on a pending payment withdrawal — where the actions live.
  'financial.openInDesk': 'Review on the desk',

  // ── Ledger (ADM-13) ───────────────────────────────────────────────────────
  'ledger.title': 'Ledger',
  'ledger.subtitle':
    'Every money movement on the platform, append-only. A correction is a new compensating entry — nothing here is ever edited or deleted.',
  'ledger.loading': 'Loading the ledger',
  'ledger.loadFailed': 'Could not load the ledger.',
  'ledger.empty': 'No ledger entries match these filters.',
  'ledger.colWhen': 'When',
  'ledger.colClient': 'Client',
  // The wallet number; clicking it scopes the ledger to that wallet.
  'ledger.colWallet': 'Wallet',
  'ledger.colType': 'Type',
  'ledger.colAmount': 'Amount',
  'ledger.colBalance': 'Balance after',
  'ledger.colReference': 'Reference',
  'ledger.filterType': 'Entry type',
  'ledger.filterTypeAll': 'All entry types',
  'ledger.filterClient': 'Search client',
  'ledger.filterClientPlaceholder': 'Search by name, email or Portal ID',
  'ledger.filterClientHint':
    'Matches the client’s email or name — the same identifiers shown in the Client column.',
  'ledger.clearFilters': 'Clear',
  'ledger.scopedToClient': 'Showing one client. Clear the filter to see the whole ledger.',
  'ledger.scopedToWallet': 'Showing one wallet. Clear the filter to see the whole ledger.',
  'ledger.noun': 'entry',
  'ledger.nounPlural': 'entries',
  // The six values `ledger_entries.entry_type` can hold.
  'ledger.type.deposit': 'Deposit',
  'ledger.type.withdrawal': 'Withdrawal',
  'ledger.type.commission': 'Commission',
  'ledger.type.rebate': 'Rebate',
  'ledger.type.payout': 'Payout',
  'ledger.type.adjustment': 'Adjustment',
  'nav.bridge': 'MT5 bridge',
  'nav.mt5Groups': 'MT5 groups',
  // ── MT5 groups ────────────────────────────────────────────────────────────
  // The groups the server reports, as the sync job last mirrored them. Read
  // from the mirror, so the page answers when the bridge is down — which is
  // why every row says when the server last confirmed it.
  'mt5Groups.pageTitle': 'MT5 groups',
  'mt5Groups.subtitle':
    'The groups on the MT5 server, refreshed automatically by the group sync. Assign a group to a product on the Products page to let clients open accounts in it.',
  'mt5Groups.loading': 'Loading MT5 groups',
  'mt5Groups.loadFailed': 'Could not load the MT5 groups.',
  'mt5Groups.empty':
    'No groups have been synced yet. They appear once the bridge is connected and the group sync has run.',
  'mt5Groups.colName': 'Group',
  'mt5Groups.colCurrency': 'Currency',
  'mt5Groups.colLeverage': 'Default leverage',
  'mt5Groups.colAccounts': 'Accounts',
  'mt5Groups.notSold': 'Not assigned',
  'mt5Groups.colProducts': 'Products',
  'mt5Groups.productEnv': '{product} · {environment}',
  'mt5Groups.envLive': 'live',
  'mt5Groups.envDemo': 'demo',
  'mt5Groups.leverageRatio': '1:{ratio}',
  // MT5's OWN commission on a group, set by the broker on the trading server.
  // Separate from the CRM's commission types, which pay partners.
  'mt5Groups.colCommission': 'MT5 commission',
  'mt5Groups.colMargin': 'Margin call / stop out',
  'mt5Groups.commissionNone': 'None',
  'mt5Groups.commissionUnknown': 'Not reported',
  'mt5Groups.perLot': 'per lot',
  'mt5Groups.perDeal': 'per deal',
  'mt5Groups.entryIn': 'on opening deals',
  'mt5Groups.entryOut': 'on closing deals',
  'mt5Groups.entryAll': 'on every deal',
  'mt5Groups.chargeInstant': 'Taken with the deal',
  'mt5Groups.chargeDaily': 'Taken at the end of each day',
  'mt5Groups.chargeMonthly': 'Taken at the end of each month',
  'mt5Groups.tiered': 'tiered ({count} tiers)',
  'mt5Groups.agentPaid': 'paid to an agent, not charged to the client',
  'mt5Groups.noTiers': 'No tiers set',
  'mt5Groups.unitPoints': '{value} points',
  'mt5Groups.unitPercent': '{value}%',
  'mt5Groups.unitBase': '{value} in the symbol base currency',
  'mt5Groups.unitProfit': '{value} in the symbol profit currency',
  'mt5Groups.unitMargin': '{value} in the symbol margin currency',
  'mt5Groups.unitUnknown': '{value} (unit not recognised)',
  'mt5Groups.rangeFrom': '{from} and above',
  'mt5Groups.rangeBetween': '{from} – {to}',
  'mt5Groups.detailTitle': 'Commission rules on this group',
  'mt5Groups.detailExplain':
    'MT5 takes these from the client’s deals on the trading server. They are set by the broker in MT5, not in this console, and are separate from the partner commission types.',
  'mt5Groups.detailNone': 'This group charges no MT5 commission.',
  'mt5Groups.detailUnknown':
    'The bridge did not report this group’s commission rules. They appear after the bridge is updated and the next group sync runs.',
  'mt5Groups.detailSymbols': 'Symbols',
  'mt5Groups.detailCharged': 'When',
  'mt5Groups.detailTier': 'Commission',
  'mt5Groups.detailRange': 'Band',
  'mt5Groups.detailMinMax': 'Min / max',
  'nav.apiKeys': 'API keys',
  'nav.networkAccess': 'Network access',
  'nav.externalLinks': 'External links',

  // ── API keys ───────────────────────────────────────────────────────────────
  'apiKeys.title': 'API keys',
  'apiKeys.subtitle':
    'Machine credentials for the admin API. A key carries its own permissions and is not tied to any administrator’s account.',
  'apiKeys.loading': 'Loading keys…',
  'apiKeys.loadFailed': 'Could not load the API keys.',
  'apiKeys.prefixTruncated': '{prefix}…',
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
  // ── MT5 bridge ────────────────────────────────────────────────────────────
  //
  // Wording rule for this whole screen: it says what IS, never what it guesses.
  // It is read during an incident, and a diagnostics page that softens a fact is
  // worse than no page.
  'bridge.title': 'MT5 bridge',
  'bridge.subtitle':
    'Whether deals are reaching this system, and whether any money movement was left unresolved.',

  'bridge.tab.outbox': 'Deal queue',
  'bridge.tab.operations': 'Balance operations',
  'bridge.tab.logs': 'Log',

  'bridge.loading': 'Asking the bridge…',
  // "Could not ask" — NOT "nothing found". On this screen those are opposite
  // answers, and reporting a silent bridge as an empty queue says the thing the
  // operator most needs to disbelieve.
  'bridge.loadFailed': 'Could not reach the MT5 bridge.',
  'bridge.refresh': 'Refresh',

  'bridge.outbox.total': 'Deals queued',
  'bridge.outbox.delivered': 'Delivered',
  'bridge.outbox.pending': 'Awaiting delivery',
  'bridge.outbox.failing': 'Failing',
  'bridge.outbox.failingHint': 'Attempted and rejected',
  'bridge.outbox.pendingOnly': 'Not yet delivered',
  'bridge.outbox.empty': 'No deals in the queue.',
  'bridge.outbox.emptyPending': 'Every deal the bridge has read has reached this system.',
  'bridge.outbox.healthy': 'Every queued deal has been delivered.',
  'bridge.outbox.unhealthy':
    '{count} {count:deal has|deals have} been attempted and rejected. {count:It is|They are} not lost — the bridge keeps retrying — but {count:it is|they are} not here yet.',

  'bridge.operations.total': 'Operations',
  'bridge.operations.completed': 'Completed',
  'bridge.operations.stuck': 'Unresolved',
  'bridge.operations.stuckOnly': 'Unresolved only',
  'bridge.operations.empty': 'No balance operations recorded.',
  'bridge.operations.emptyStuck': 'Every balance operation has a confirmed outcome.',
  // The most important sentence on the screen. It names the state precisely —
  // the money may or may not have moved — because "failed" would be a guess in
  // the safe direction and "pending" a guess in the dangerous one.
  'bridge.operations.stuckWarning':
    '{count} {count:operation was|operations were} sent to MT5 without a confirmed outcome. The money may or may not have moved. Check {count:it|each} against MT5 deal history before retrying — the key stays claimed so a retry cannot double-credit.',

  'bridge.logs.empty': 'No log lines for today yet.',
  'bridge.logs.missing': 'No log file for today at {file}.',
  'bridge.logs.filter': 'Filter lines',
  'bridge.logs.matched': '{count} {count:line|lines} matched',
  'bridge.logs.errorsOnly': 'Warnings and errors',

  'bridge.col.deal': 'Deal',
  'bridge.col.source': 'Source',
  'bridge.col.attempts': 'Attempts',
  'bridge.col.delivered': 'Delivered',
  'bridge.col.error': 'Last error',
  'bridge.col.created': 'Queued',
  'bridge.col.key': 'Reference',
  'bridge.col.login': 'Login',
  'bridge.col.amount': 'Amount',
  'bridge.col.type': 'Type',
  'bridge.col.started': 'Started',
  'bridge.col.outcome': 'Outcome',
  'bridge.value.unresolved': 'Unresolved',
  'bridge.value.none': '—',

  'reconciliation.title': 'Reconciliation',
  'reconciliation.subtitle':
    'Every wallet balance checked against the sum of its own ledger entries.',
  'reconciliation.loading': 'Checking the ledger…',
  'reconciliation.loadFailed': 'Could not run the reconciliation.',
  'reconciliation.runNow': 'Run now',
  'reconciliation.running': 'Checking…',
  'reconciliation.ok.title': 'The books balance',
  'reconciliation.ok.body':
    '{count:The wallet agrees with its ledger|All {count} wallets agree with their ledgers} to the cent. Wallet balances only — unpaid commission accruals are checked separately.',
  /*
   * The mismatch copy names the NEXT ACTION, and deliberately does not offer to
   * fix anything. A repair here would write a compensating entry for a cause
   * nobody has diagnosed — the discrepancy stops being visible without ever
   * having been explained.
   */
  'reconciliation.mismatch.title': 'The ledger and the balances disagree',
  'reconciliation.mismatch.body':
    'Investigate before making any correction. Nothing here is repaired automatically: a compensating entry written for an undiagnosed cause hides the problem instead of fixing it.',
  'reconciliation.checkedAt': 'Checked {count} {count:wallet|wallets} · last run {at}',
  /*
   * The SCALE of the break, which the screen could not state.
   *
   * `walletDiscrepancies` is capped at 20 rows server-side and the response
   * carries the real `discrepancyCount` and `totalDifference` beside it — its
   * own DTO warns that "a screen that counts this array reports 20 on a
   * database with thousands". Until these strings existed the page rendered
   * the sample and no figure, so a systemic ledger break read as twenty
   * isolated ones.
   */
  'reconciliation.mismatch.scale':
    '{count} {count:wallet|wallets} affected · {total} out of balance',
  'reconciliation.sampleNote':
    'Showing the first {shown} of {count}. Investigate these, then re-run.',
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
  'paymentMethods.colFlow': 'Runs on',
  'paymentMethods.requiresProof': 'Ask for a receipt',
  'paymentMethods.requiresProofHint':
    'The client uploads a photo of the receipt with the deposit, and answers the details below. The deposit waits in Finance → Deposits until somebody credits it.',
  'paymentMethods.route': 'How clients pay',
  'paymentMethods.routeHint':
    'Which payment provider this method runs on, and how. Fixed once the method exists — to change it, add a new method, so past deposits keep saying how they were paid.',
  'paymentMethods.routeFixed': 'Fixed when the method was created.',
  'paymentMethods.routeLoading': 'Loading payment providers…',
  'paymentMethods.routeDeskOnly':
    'Paid outside the platform and confirmed by the desk. (Other providers appear here for admins who can view Payment providers.)',
  'withdrawalMethods.colRoute': 'Paid through',
  'withdrawalMethods.route': 'How it is paid',
  'withdrawalMethods.routeHint':
    'Who pays a withdrawal on this method, and what the client must give. Fixed once the method exists.',
  'withdrawalMethods.routeDeskOnly':
    'Paid by the desk. (Other providers appear here for admins who can view Payment providers.)',

  // ── Payment providers (backend 0168) ──────────────────────────────────────
  'providers.title': 'Payment providers',
  'providers.subtitle':
    'The systems that move the money behind your deposit and withdrawal methods. Every method runs on exactly one of them.',
  'providers.loading': 'Loading payment providers',
  'providers.loadFailed': 'Could not load the payment providers.',
  'providers.caption': 'Payment providers',
  'providers.back': 'All payment providers',
  'providers.manage': 'Manage',
  'providers.builtIn': 'Built in',
  'providers.builtInNote': 'The desk itself: always on, nothing to set up.',
  'providers.readOnly': 'You can view payment providers but not change them.',
  'providers.sandbox': 'Sandbox',
  'providers.configuredFromEnv':
    'Running on the server’s environment settings. Save a connection here to manage it from the console instead.',
  'providers.status.connected': 'Connected',
  'providers.status.unverified': 'On, not tested yet',
  'providers.status.failing': 'Failing',
  'providers.status.off': 'Off',
  'providers.status.not_configured': 'Not set up',
  'providers.status.sandbox_refused': 'Sandbox refused',
  'providers.lastEvent': 'Last event',
  'providers.never': 'Never',
  'providers.lastCheck': 'Last test',
  'providers.checkOk': 'passed',
  'providers.checkFailed': 'failed',
  'providers.channels': 'Channels',
  'providers.channelsHint': 'The ways this provider moves money. Each method uses one of them.',
  'providers.direction.deposit': 'Deposit',
  'providers.direction.payout': 'Withdrawal',
  'providers.flow.redirect': 'The client pays on the provider’s page; the provider confirms it',
  'providers.flow.offline': 'The client pays outside the platform; the desk confirms it',
  'providers.flow.adjustment': 'The desk’s own credit, never offered to clients',
  'providers.flow.automated': 'The provider pays once the desk approves',
  'providers.flow.desk': 'The desk pays by hand',
  'providers.flow.cash': 'The client collects it in cash',
  'providers.destination.none': 'The client enters nothing',
  'providers.destination.phone': 'The client gives a phone number',
  'providers.destination.crypto_address': 'The client gives a wallet address',
  'providers.destination.cryptoNetwork': 'The client gives a {network} wallet address',
  'providers.destination.iban': 'The client gives an IBAN',
  'providers.destination.text': 'The client says where to send it',
  'providers.methods': 'Methods using it',
  'providers.methodsNone': 'No method runs on this provider yet.',
  'providers.methodDeposit': 'Deposit',
  'providers.methodPayout': 'Withdrawal',
  'providers.availability.offered': 'Offered to clients',
  'providers.availability.disabled': 'Switched off',
  'providers.availability.provider_off': 'Hidden: provider is off',
  'providers.availability.provider_not_configured': 'Hidden: provider not set up',
  'providers.paidBy.provider': 'Paid by {provider}',
  'providers.paidBy.desk': 'Paid by the desk',
  'providers.last24h': 'Last 24 hours',
  'providers.stat.total': 'Filed',
  'providers.stat.succeeded': 'Succeeded',
  'providers.stat.failed': 'Failed',
  'providers.stat.pending': 'Pending',
  'providers.connection': 'Connection',
  'providers.enabled': 'Switched on',
  'providers.enabledHint':
    'Off: no new payment starts on its methods, and its deposit methods are hidden from clients. Payments already in flight still settle.',
  'providers.environment': 'Environment',
  'providers.env.live': 'Live',
  'providers.env.sandbox': 'Sandbox (testing only)',
  'providers.envHint':
    'A production server refuses a sandbox connection, so test money never becomes real money.',
  'providers.secretSet': 'A value is saved. Leave blank to keep it; type to replace it.',
  'providers.secretNone': 'Nothing saved yet.',
  'providers.secretRemove': 'Remove it',
  'providers.secretRemoving': 'Will be removed when you save.',
  'providers.save': 'Save',
  'providers.saving': 'Saving…',
  'providers.saved': '{provider} saved',
  'providers.saveFailed': 'Could not save the payment provider.',
  'providers.test': 'Test connection',
  'providers.testFailed': 'Could not test the connection.',
  'providers.webhook': 'Webhook',
  'providers.webhookHint':
    'Paste the address and the key into {provider}’s dashboard. {provider} signs every event with the key, and anything unsigned is refused.',
  'providers.webhookEndpoint': 'Webhook address',
  'providers.webhookEndpointUnset':
    'Unavailable: the server has no public address (API_PUBLIC_URL).',
  'providers.fingerprint': 'Key fingerprint',
  'providers.keyNone': 'No key yet',
  'providers.generate': 'Generate key',
  'providers.rotate': 'Rotate key',
  'providers.rotateWarning':
    'Rotating refuses events signed with the old key until the new one is in the provider’s dashboard. The regular check catches up on anything missed.',
  'providers.rotateFailed': 'Could not generate the key.',
  'providers.mintedTitle': 'Your new key',
  'providers.mintedDescription': 'Copy it now. It is shown once and never again.',
  'providers.mintedKey': 'Key',
  'providers.mintedDone': 'I have copied it',
  'providers.copy': 'Copy',
  'providers.events': 'Recent events',
  'providers.eventsHint': 'What the provider reported, and what the platform did about it.',
  'providers.eventsEmpty': 'Nothing reported yet.',
  'providers.eventsLoading': 'Loading events',
  'providers.eventsLoadFailed': 'Could not load the events.',
  'providers.eventsCaption': 'Recent provider events',
  'providers.col.when': 'When',
  'providers.col.event': 'Event',
  'providers.col.source': 'From',
  'providers.col.outcome': 'Result',
  'providers.col.details': 'Details',
  'providers.source.webhook': 'Webhook',
  'providers.source.poll': 'Check',
  'providers.source.desk': 'Desk',
  'providers.outcome.applied': 'Applied',
  'providers.outcome.ignored': 'Ignored',
  'providers.outcome.rejected': 'Needs a person',
  'providers.outcome.failed': 'Will retry',
  'providers.event.payment.pending': 'Payment pending',
  'providers.event.payment.succeeded': 'Payment succeeded',
  'providers.event.payment.failed': 'Payment failed',
  'providers.event.payment.reversed': 'Payment reversed',
  'providers.event.payout.submitted': 'Payout received',
  'providers.event.payout.completed': 'Payout completed',
  'providers.event.payout.rejected': 'Payout rejected',
  'providers.event.payout.cancelled': 'Payout cancelled',
  'providers.settingsMoved': 'The Rival connection moved to System → Payment providers.',
  'nav.deposits': 'Deposits',

  // ── The offline deposit desk ──────────────────────────────────────────────
  'deposits.title': 'Deposit approvals',
  'deposits.subtitle':
    'Deposits a client paid outside the platform. Check the receipt, then credit the wallet or refuse it with a reason.',
  'deposits.loading': 'Loading deposits',
  'deposits.loadFailed': 'Could not load the deposit queue.',
  'deposits.empty': 'Nothing waiting here.',
  'deposits.tabPending': 'Waiting',
  'deposits.tabApproved': 'Credited',
  'deposits.tabRejected': 'Refused',
  'deposits.colClient': 'Client',
  'deposits.colAmount': 'Amount',
  'deposits.colMethod': 'Method',
  'deposits.colReference': 'Reference',
  'deposits.colReceipt': 'Receipt',
  'deposits.colDetails': 'Details',
  'deposits.copyDetail': 'Copy {label}',
  'deposits.colRequested': 'Requested',
  'deposits.colState': 'State',
  'deposits.noReceipt': 'No receipt',
  'deposits.openReceipt': 'Open receipt',
  'deposits.approve': 'Approve & credit',
  'deposits.reject': 'Refuse',
  'deposits.viewOnly': 'View only',
  'deposits.unknownClient': 'this client',
  'deposits.searchPlaceholder': 'Search by name, email, Portal ID, reference, phone or code…',
  'deposits.searchAria': 'Search deposits',
  'deposits.confirmApproveTitle': 'Credit {amount}?',
  'deposits.confirmApprove':
    '{name} says they sent {amount} by {method}, reference {reference}. Approving credits their wallet now.',
  'deposits.confirmApproveNoReceipt':
    'NO RECEIPT is attached to this deposit. Approving credits {name} {amount} with nothing here to check it against.',
  'deposits.approved': 'Deposit approved — the wallet has been credited.',
  'deposits.approveFailed': 'Could not approve this deposit.',
  'deposits.rejected': 'Deposit refused. The client has been told why.',
  'deposits.rejectFailed': 'Could not refuse this deposit.',
  'deposits.rejectTitle': 'Refuse this deposit',
  'deposits.rejectIntro': 'Refusing {name}’s deposit of {amount}. They are told the reason.',
  'deposits.rejectNoRefund':
    'Nothing is refunded — this deposit never took money from their wallet. If they did send the transfer, it is a matter for support.',
  'deposits.rejectReason': 'Reason',
  'deposits.rejectReasonNone': 'No catalogued reason',
  'deposits.rejectNote': 'Note to the client',
  'deposits.rejectNotePlaceholder': 'What they need to do next…',
  'deposits.rejectNoteHint': 'The client reads the reason and this note together.',
  'deposits.rejecting': 'Refusing…',
  'deposits.confirmReject': 'Refuse deposit',
  'deposits.rowActionsLabel': 'Deposit actions',

  // "Deposit methods", not "Payment methods": the withdrawal list sits beside
  // it now, and "payment" alone does not say which direction.
  'nav.paymentMethods': 'Deposit methods',
  'nav.withdrawalMethods': 'Withdrawal methods',
  'nav.paymentProviders': 'Payment providers',
  'nav.wallets': 'Wallets',
  'nav.tradingAccounts': 'Trading accounts',
  // ── The leverage ladder ───────────────────────────────────────────────────
  'leverages.title': 'Leverages',
  'leverages.subtitle': 'The leverage a client may open a trading account on.',
  'leverages.loading': 'Loading leverages',
  'leverages.loadFailed': 'The leverage ladder could not be loaded.',
  'leverages.empty': 'No leverages yet. Add one so clients can open an account.',
  'leverages.add': 'Add leverage',
  'leverages.addTitle': 'Add a leverage',
  'leverages.editTitle': 'Edit leverage',
  'leverages.edit': 'Edit',
  'leverages.save': 'Save',
  'leverages.saving': 'Saving…',
  'leverages.saveFailed': 'The leverage could not be saved.',
  'leverages.created': 'Leverage added',
  'leverages.updated': 'Leverage updated',

  'leverages.colRatio': 'Leverage',
  'leverages.colLabel': 'Label',
  'leverages.colStatus': 'Status',
  'leverages.colActions': 'Actions',
  'leverages.labelDefault': 'Shown as 1:{ratio}',
  'leverages.actionsFor': 'Actions for 1:{ratio}',

  /*
   * "Offered" and "Withdrawn", not "Enabled" and "Disabled".
   *
   * The distinction the old CSV could not make is the entire reason this is a
   * table: a withdrawn rung is off the client's menu while the accounts opened
   * on it are still trading. "Disabled" reads as though something stopped.
   */
  'leverages.statusOffered': 'Offered',
  'leverages.statusWithdrawn': 'Withdrawn',
  'leverages.enable': 'Offer again',
  'leverages.disable': 'Withdraw',
  'leverages.enabled': 'Leverage is offered again',
  'leverages.disabled': 'Leverage withdrawn — open accounts are unaffected',

  'leverages.delete': 'Delete',
  'leverages.deleted': 'Leverage deleted',
  'leverages.deleteFailed': 'The leverage could not be deleted.',
  'leverages.confirmDeleteTitle': 'Delete 1:{ratio}?',
  'leverages.confirmDelete':
    'Refused if any account is open at this leverage. To take it off the menu without touching those accounts, withdraw it instead.',

  'leverages.fieldRatio': 'Leverage',
  'leverages.fieldRatioHint': 'A whole number — 500 means 1:500.',
  'leverages.fieldRatioFixed':
    'Fixed once created: accounts opened at this leverage carry the number.',
  'leverages.fieldLabel': 'Label (optional)',
  'leverages.fieldLabelHint': 'What the client reads. Left blank, they see 1:<leverage>.',
  'leverages.fieldEnabled': 'Offer this leverage to clients',
  'leverages.fieldEnabledHint':
    'Unticked, it is withdrawn: off the account-opening menu, with existing accounts unaffected.',

  // ── The portal's sidebar links ────────────────────────────────────────────
  'externalLinks.title': 'External links',
  'externalLinks.subtitle':
    'Links shown to clients in the portal sidebar — an economic calendar, a help centre, a Telegram channel. They open in a new tab.',
  'externalLinks.loading': 'Loading links',
  'externalLinks.loadFailed': 'The links could not be loaded.',
  'externalLinks.empty': 'No links yet. Add one and it appears in every client’s sidebar.',
  'externalLinks.add': 'Add link',
  'externalLinks.addTitle': 'Add a link',
  'externalLinks.editTitle': 'Edit link',
  'externalLinks.edit': 'Edit',
  'externalLinks.save': 'Save',
  'externalLinks.saving': 'Saving…',
  'externalLinks.saveFailed': 'The link could not be saved.',
  'externalLinks.created': 'Link added',
  'externalLinks.updated': 'Link updated',

  'externalLinks.colTitle': 'Title',
  'externalLinks.colDescription': 'Description',
  'externalLinks.colUrl': 'Link',
  'externalLinks.colStatus': 'Status',
  'externalLinks.colActions': 'Actions',
  'externalLinks.noDescription': 'No description',
  'externalLinks.actionsFor': 'Actions for {title}',
  'externalLinks.openInNewTab': 'Open {title} in a new tab',

  /*
   * "Shown" and "Hidden", not "Enabled" and "Disabled".
   *
   * The operator's question about a row on this screen is whether clients can
   * see it, and those two words answer it directly. "Disabled" reads as though
   * the link stopped working.
   */
  'externalLinks.statusShown': 'Shown',
  'externalLinks.statusHidden': 'Hidden',
  'externalLinks.show': 'Show to clients',
  'externalLinks.hide': 'Hide from clients',
  'externalLinks.shown': 'Link is shown to clients again',
  'externalLinks.hidden': 'Link hidden — it keeps its title, description and position',

  'externalLinks.delete': 'Delete',
  'externalLinks.deleted': 'Link deleted',
  'externalLinks.deleteFailed': 'The link could not be deleted.',
  'externalLinks.confirmDeleteTitle': 'Delete “{title}”?',
  'externalLinks.confirmDelete':
    'This removes the link, its description and its position for good. To take it off the client sidebar and keep all three, hide it instead.',

  'externalLinks.fieldTitle': 'Title',
  'externalLinks.fieldTitleHint': 'What the client reads in the sidebar.',
  'externalLinks.fieldDescription': 'Description (optional)',
  'externalLinks.fieldDescriptionHint':
    'One line of context. Clients see it as a tooltip; leaving it blank is fine.',
  'externalLinks.fieldUrl': 'Link',
  'externalLinks.fieldUrlHint':
    'Include the scheme — https://example.com/calendar. Only http and https are accepted.',
  'externalLinks.fieldUrlInvalid': 'That is not a complete URL. Start with https://',
  /*
   * Not "(optional)" any more, and the select is never empty.
   *
   * A blank field standing for "append" was the one state the control could be
   * in that was not a position — so the answer the operator got was one the form
   * never showed them. Adding now defaults to the last slot, which is the same
   * outcome, said out loud.
   */
  'externalLinks.fieldEnabled': 'Show this link to clients',
  'externalLinks.fieldEnabledHint':
    'Unticked, it is off the client sidebar and still on this screen, with its title, description and position kept.',

  'phone.countryCode': 'Country code — {country} ({dialCode})',
  'country.searchPlaceholder': 'Search country or code…',
  'country.noneFound': 'No country found',

  'currencies.title': 'Currencies',
  'currencies.subtitle':
    'The money this platform can hold. Adding or enabling one offers it: clients and partners see it on their wallet screens and open a wallet in it themselves. Disabling one hides its empty wallets from clients; balances stay theirs.',
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
  'currencies.colStatus': 'Status',
  'currencies.colDepositLimits': 'Deposit',
  'currencies.colWithdrawalLimits': 'Withdrawal',
  'currencies.colAdminCredit': 'Admin credit',
  'currencies.perDay': '{amount} a day',
  // The money limits (0162) — in the currency's own units.
  'currencies.limitsTitle': 'Limits',
  'currencies.limitsHint':
    "In this currency's own units — for LBP that means millions. Deposit methods in this currency can narrow the deposit range, never widen it.",
  'currencies.limit.minDeposit': 'Minimum deposit',
  'currencies.limit.maxDeposit': 'Maximum deposit',
  'currencies.limit.minWithdrawal': 'Minimum withdrawal',
  'currencies.limit.maxWithdrawal': 'Maximum withdrawal',
  'currencies.limit.maxWithdrawalDaily': 'Daily withdrawal limit',
  'currencies.limit.maxAdminCredit': 'Maximum admin credit',
  'currencies.limitDailyHint': 'per client, rolling 24 hours',
  'currencies.limitAdminCreditHint': 'per credit or funding',
  'currencies.limitMalformed': 'An amount, e.g. 10 or 5000000 — up to 8 decimals.',
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
    'Only possible while it has never held money: any empty wallets clients opened in it are removed with it. To stop offering a currency that has been used, disable it instead.',
  'currencies.deleteSucceeded': '{code} deleted',
  'currencies.defaultSucceeded': '{code} is now the default currency',
  'currencies.enabledSucceeded': '{code} enabled — clients can now open a wallet in it',
  'currencies.disabledSucceeded': '{code} disabled',
  'currencies.saveSucceeded': '{code} saved',

  'currencies.code': 'Code',
  'currencies.codeHint': 'Letters and digits, e.g. EUR or USDT. Stored upper-case.',
  'currencies.codeLocked': 'The code cannot change — wallets and ledger entries reference it.',
  'currencies.name': 'Name',
  'currencies.symbol': 'Symbol',
  'currencies.decimals': 'Display decimals',
  'currencies.decimalsHint': 'How balances are shown. Storage is always 8 decimal places.',
  'currencies.enabled': 'Enabled',
  'currencies.enabledHint':
    'Enabled, clients and partners are offered it and open their own wallets in it. No wallet is opened for anybody on save. Disabling never touches existing balances.',
  'currencies.isDefault': 'Default currency',
  'currencies.isDefaultHint':
    "The currency a new client's first wallet opens in. Exactly one currency holds this, and it must stay enabled.",

  // ── IB levels (the payout ladder) ─────────────────────────────────────────
  //
  // The wording is doing real work here. "2 levels" is naturally read as "we
  // allow 2 partners", when it means the payout chain is two hops deep — so the
  // depth hint spells the consequence out rather than restating the number.
  // Short, because the main item above them already says whose they are.
  /*
   * ── The Introducing brokers group, named for what each page HOLDS (25 Sep
   * 2026) ─────────────────────────────────────────────────────────────────────
   *
   *   Partners              the approved partners
   *   Partner applications  requests to become one, waiting on a decision
   *   Commission payouts    every commission paid to a partner and every
   *                         rebate paid back to a client, per trade
   *   Commission types      what a product pays per lot (the rate card)
   *   Partner levels        what share of that a partner at each level takes
   *   Agencies              the packages a partner sells under
   *
   * The page title matches the sidebar label on every one, so what an operator
   * clicked is what the heading says.
   */
  'nav.partnerApprovals': 'Partner applications',
  'nav.partners': 'Partners',
  'nav.referrals': 'Referrals',
  'nav.commissionTypes': 'Commission types',
  'nav.ibLevels': 'Partner levels',
  // ── Commission levels (0112) ──────────────────────────────────────────────
  // The ladder that replaced the programme catalogue. Every string here talks
  // about where a partner STANDS rather than about a card they hold: a level is
  // a position in the tree, and the terms follow from it.
  //
  // `ibPrograms.*` are gone with the screen they served. The one thing worth
  // carrying forward from them is the warning about naming: never "L1 / L2" as
  // a bare heading — but the reason has INVERTED. Under programmes the short
  // form wrongly read as the rung; here the rung is exactly what it means, and
  // the misreading to avoid is depth ("the trade was two hops below me").
  'ibLevels.title': 'Partner levels',
  /*
   * ONE sentence, and it says what the page IS.
   *
   * This ran to five and explained the whole model — how a level is derived,
   * that edits are not retroactive, what a rung means. All of it true, none of
   * it what somebody opening this page needs in order to read the tree below it,
   * and long enough that it was skipped entirely.
   *
   * It had also gone WRONG: it named two payout modes when there are three.
   * `share_of_parent` — a rung taking a cut of the rung above, which is how a
   * sub-partner earns a share of the main partner's per-lot rate — arrived in
   * 0114 and this copy never learned about it. A subtitle that enumerates
   * something is a subtitle that goes stale; this one no longer enumerates.
   */
  'ibLevels.subtitle':
    'What each rung of the partner tree earns, and what its clients get back. Changes apply to ' +
    'the next trade.',
  'ibLevels.loading': 'Loading the commission ladder…',
  'ibLevels.loadFailed': 'Could not load the commission levels.',
  'ibLevels.empty': 'No commission levels are configured, so no partner is being paid.',
  'ibLevels.cardLabel': 'Level {level}',
  'ibLevels.defaultName': 'Level {level}',
  'ibLevels.name': 'Level name',
  'ibLevels.disabled': 'Disabled',
  'ibLevels.partnerCount': '{count} {count:partner|partners} here',

  // WHO stands on this rung, said plainly. "Level 2" alone is a number; "a
  // partner recruited by a level 1 partner" is the thing an operator is
  // actually pricing.
  'ibLevels.whoIsHere_1': 'Partners who deal with the broker directly.',
  'ibLevels.whoIsHere_n': 'Partners recruited by a level {parent} partner.',

  'ibLevels.add': 'Add level {level}',
  'ibLevels.addSucceeded': 'Level {level} was added. Set its rates before anybody is placed on it.',
  'ibLevels.addFailed': 'Could not add the level.',
  // The ceiling an operator could raise is gone (0113). What is left is the
  // depth the commission engine actually walks — a rung past it could never be
  // reached by any trade, so this explains rather than pointing at a setting.
  'ibLevels.atCeiling':
    'The ladder is {max} levels deep, which is as far as the commission engine pays. A partner ' +
    'deeper than this earns nothing and the trade pays the levels above them.',

  'ibLevels.enable': 'Enable',
  'ibLevels.disable': 'Disable',
  'ibLevels.enabledSucceeded': 'Level {level} is enabled and paying again.',
  'ibLevels.disabledSucceeded': 'Level {level} is disabled and has stopped paying.',
  'ibLevels.toggleFailed': 'Could not change whether this level is enabled.',

  'ibLevels.remove': 'Remove level {level}',
  'ibLevels.confirmDeleteTitle': 'Remove level {level}?',
  'ibLevels.confirmDelete':
    'The ladder will stop at level {level} minus one. Nothing already earned is affected.',
  // The count is the whole answer, and the API refuses this anyway — asking
  // with the number turns a refusal into an informed cancellation.
  'ibLevels.confirmDeleteOccupied':
    '{count} {count:partner stands|partners stand} on level {level} and would be left on terms that do not exist. ' +
    'Move them first — this will be refused.',
  'ibLevels.deleteSucceeded': 'Level {level} was removed.',
  'ibLevels.deleteFailed': 'Could not remove the level.',

  // ── The two shares (0140) ─────────────────────────────────────────────────
  // A rung is a PERCENTAGE of the traded product's commission type. The money
  // per lot lives on the type (Commission Types); a rung never holds an amount.
  'ibLevels.commission': 'The partner earns',
  'ibLevels.commissionHint':
    'The share of the product’s commission per lot a partner on this level takes, on every ' +
    'trade that reaches them — their own clients’ and their sub-partners’ alike.',
  'ibLevels.rebate': 'Their client gets back',
  'ibLevels.rebateHint':
    'The share of the product’s rebate per lot returned to a client introduced by a partner on ' +
    'this level. Set it to zero if this level pays no rebate.',
  'ibLevels.independentNote':
    'Shares are paid independently: on a sub-partner’s client’s trade, this level and every ' +
    'level above it each take their own share of the product’s figure.',
  'ibLevels.shareTooLarge': 'A share cannot exceed 100% of the product’s figure.',
  'ibLevels.rowActions': 'Actions for level {level}',
  'ibLevels.description': 'Description',
  'ibLevels.descriptionPlaceholder': 'What this tier is for — who qualifies, what was agreed.',
  'ibLevels.addTitle': 'Add level {level}',
  'ibLevels.addDescription':
    'Partners recruited by a level {parent} partner sit here. Set what they earn before anybody ' +
    'is placed on it — a level paying nothing looks the same as one nobody has configured.',
  'ibLevels.addSave': 'Add level',
  'ibLevels.editTitle': 'Edit level {level}',
  'ibLevels.partners': 'Partners',
  // The card shows shares READ-ONLY, so each names what it is a share OF. "70"
  // alone is unreadable on a money screen.
  'ibLevels.termCommission': '{share}% of the product’s commission',
  'ibLevels.termRebate': '{share}% of the product’s rebate',
  'ibLevels.unitPercent': '%',
  // What the share comes to in money, per commission type — because a
  // percentage of a number on another screen is not a figure anybody can hold
  // in their head.
  'ibLevels.perTypeHeading': 'Per lot, by commission type',
  'ibLevels.perType': '{name}: partner ${commission} · client ${rebate}',
  'ibLevels.noTypes': 'No commission types yet — nothing to take a share of.',
  'ibLevels.saveSucceeded': 'Level {level} was saved. It applies to the next trade.',
  'ibLevels.saveFailed': 'Could not save the level.',

  // ── Commission types (0140) ───────────────────────────────────────────────
  // The rate cards products are sold on: money per lot for the partners and
  // for the client. The ladder takes its shares of these.
  'commissionTypes.pageTitle': 'Commission types',
  'commissionTypes.subtitle':
    'What a product pays per lot: the partners’ commission and the client’s rebate. Assign a ' +
    'type to each product; the commission levels then take their share of it.',
  'commissionTypes.loading': 'Loading commission types',
  'commissionTypes.loadFailed': 'Could not load the commission types.',
  'commissionTypes.empty':
    'No commission types yet. Add one, then assign it to the products it applies to.',
  'commissionTypes.add': 'Add commission type',
  'commissionTypes.createTitle': 'Add commission type',
  'commissionTypes.editTitle': 'Edit commission type',
  'commissionTypes.name': 'Name',
  'commissionTypes.namePlaceholder': 'Standard terms',
  'commissionTypes.description': 'Description',
  'commissionTypes.descriptionPlaceholder': 'What was agreed, and which products it is for.',
  'commissionTypes.commission': 'Partners’ commission per lot',
  'commissionTypes.commissionHint':
    'The pool one standard lot puts on the table for the partners above the client. Each ' +
    'commission level takes its percentage of this.',
  'commissionTypes.rebate': 'Client rebate per lot',
  'commissionTypes.rebateHint':
    'What one standard lot returns to the trading client, before the introducer’s level ' +
    'applies its share. Zero for a type that pays no rebate.',
  'commissionTypes.unitPerLot': '/lot',
  'commissionTypes.colName': 'Type',
  'commissionTypes.colStatus': 'Status',
  'commissionTypes.colCommission': 'Commission / lot',
  'commissionTypes.colRebate': 'Rebate / lot',
  'commissionTypes.colProducts': 'Products',
  'commissionTypes.colDescription': 'Description',
  'commissionTypes.statusActive': 'Active',
  'commissionTypes.statusInactive': 'Inactive',
  'commissionTypes.noProducts': 'Not assigned',
  'commissionTypes.edit': 'Edit',
  'commissionTypes.enable': 'Activate',
  'commissionTypes.disable': 'Deactivate',
  'commissionTypes.delete': 'Delete commission type',
  'commissionTypes.save': 'Save',
  'commissionTypes.saving': 'Saving...',
  'commissionTypes.cancel': 'Cancel',
  'commissionTypes.saveSucceeded': '{name} saved',
  'commissionTypes.saveFailed': 'Could not save that commission type.',
  'commissionTypes.enabledSucceeded': '{name} is now active',
  'commissionTypes.disabledSucceeded': '{name} is now inactive',
  'commissionTypes.toggleFailed': 'Could not change whether this commission type is active.',
  'commissionTypes.deleteSucceeded': '{name} deleted',
  'commissionTypes.deleteFailed': 'Could not delete that commission type.',
  'commissionTypes.confirmDeleteTitle': 'Delete {name}?',
  'commissionTypes.confirmDelete':
    'This cannot be undone, and it is refused while any product is sold on it or once it has ' +
    'priced a payout. Making it inactive is usually what is wanted.',
  'commissionTypes.confirmDeleteAssigned':
    '{products} {count:is|are} sold on it, so this will be refused. Move those products to ' +
    'another type first.',
  // ── Partner application review ────────────────────────────────────────────
  'partnerReview.title': 'Partner applications',
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
  'partnerReview.colAgency': 'Applied for',
  /*
   * This used to read "Not specified", with a note that approval would leave
   * the partner unrestricted. Both are now wrong: an agency is required, so a
   * blank one is not a state that survives a decision — the reviewer is asked
   * for one in the approve dialog and the API refuses without it.
   *
   * Worded as the ACTION it implies rather than as an absence, because that is
   * what the reviewer has to do about it.
   */
  'partnerReview.noAgency': 'Choose on approval',
  'partnerReview.colStatus': 'Status',
  'partnerReview.colActions': 'Decision',
  'partnerReview.waitingDays': 'waiting {days} days',

  'partnerReview.statusPending': 'Pending',
  'partnerReview.statusApproved': 'Approved',
  'partnerReview.statusRejected': 'Rejected',

  'partnerReview.approve': 'Approve',
  'partnerReview.reject': 'Reject',
  'partnerReview.readOnly': 'View only',
  // The client is NAMED, because this is a queue of near-identical rows and the
  // menu opens under whichever one was clicked.
  'partnerReview.confirmApproveTitle': 'Approve {name} as a partner?',
  'partnerReview.confirmApprove':
    'This creates their partner account and issues a referral code, which is never reissued. The application cannot be decided again.',
  'partnerReview.approving': 'Approving…',
  'withdrawals.searchPlaceholder': 'Search by name, email or Portal ID',
  'withdrawals.actionsFor': 'Actions for {name}’s withdrawal',
  'withdrawals.detailsAction': 'View details',
  // The AMOUNT is in the title and the client in the body: this is a queue of
  // near-identical rows, and approving now pays with no undo.
  'withdrawals.confirmApproveTitle': 'Pay out {amount}?',
  'withdrawals.confirmApprove':
    'This pays {name} immediately — one step, straight to settled. The money leaves now and there is no undo.',
  // Backend 0168: an approved withdrawal on an automated method goes to its
  // provider, which pays it; the row waits in "Awaiting payout" until it does.
  'withdrawals.confirmApproveProvider':
    '{provider} pays {name} once you approve. The request waits in Awaiting payout until {provider} confirms it; until then it can still be cancelled.',
  'withdrawals.detailsTitle': 'Withdrawal details',
  'withdrawals.detailsProviderRef': 'Provider reference',
  'withdrawals.detailsRivalRef': 'Provider reference',
  'financial.rivalRefTitle': 'Provider reference',
  'withdrawals.detailsReviewed': 'Reviewed',
  'withdrawals.detailsSettled': 'Settled',
  /*
   * ONE stored column, TWO labels. `rejectionReason` is written both when a
   * reviewer refuses and when a payout fails, so the label is picked from the
   * state — calling a provider error a "rejection reason" would attribute it to
   * a person.
   */
  'withdrawals.detailsRejectionReason': 'Reason for rejection',
  'withdrawals.detailsFailureReason': 'Why this failed',
  'withdrawals.detailsNoReason': 'No reason was recorded.',
  'withdrawals.searchAria': 'Search withdrawals',
  'partnerReview.searchPlaceholder': 'Search by name, email or Portal ID',
  // Named for the QUEUE. Several screens carry a search box and "Search" alone
  // announces the same thing on all of them.
  'partnerReview.searchAria': 'Search partner applications',
  // The agency is REQUIRED now — a partner without one has clients offered the
  // entire catalogue, so the API refuses rather than defaulting. Applications
  // submitted before the rule carry none, and the reviewer supplies it here.
  'partnerReview.chooseAgency': 'Choose the agency',
  'partnerReview.chooseAgencyHint':
    'This application names none, so pick the programme to appoint them under. It decides what they and their clients may trade.',
  // ── The commission programme, chosen at approval ─────────────────────────
  // Asked every time, unlike the agency: the agency is what the APPLICANT
  // requested, the programme is what the BROKER decides. There is no request to
  // honour, so nothing is being second-guessed by asking.
  'partnerReview.programmeLabel': 'Commission programme',
  'partnerReview.programmeHint':
    'What this partner will be paid on. The first one is used unless you choose otherwise, and ' +
    'it can be changed later from their profile.',
  'partnerReview.programmeLadder': '{rates} — reaches {count} {count:level|levels}',
  'partnerReview.programmeRebateOnly': 'Pays no partner commission · {rebate}% client rebate',
  'partnerReview.noProgrammesEnabled':
    'No commission programme is enabled, so an approved partner would have no terms to be paid ' +
    'on. Enable one on the Commission Programmes page first.',

  'partnerReview.approvingUnder': 'Appointing them under {agency}, as they requested.',
  'partnerReview.agencyClosed': 'Closed to new applications — still valid for this one.',
  'partnerReview.noAgenciesConfigured':
    'No agencies exist yet. Create one under Agencies before approving any partner.',
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
  /*
   * The BASIS is a closed position, not a deposit.
   *
   * This copy dates from when the engine accrued on every settled deposit —
   * which was itself the defect that paid a partner a share of the client's own
   * money. Commission is a share of what the broker EARNED on a closed trade
   * (FR-IB-04), and a screen still naming a deposit teaches an operator to
   * answer a dispute with the wrong number.
   */
  /*
   * "Commissions and rebates", because the screen has always listed BOTH and
   * said so only in a column. The two are paid to different people from one
   * trade — a commission to the partner, a rebate to the trading client — so a
   * title naming one of them tells an operator the other is somewhere else.
   */
  'nav.commissions': 'Commission payouts',
  'commissions.title': 'Commission payouts',
  'commissions.subtitle':
    'Every payout the partner programme makes, one line per trade: commissions paid to partners and rebates paid back to the clients who traded. Pending has been worked out and is waiting to be credited; confirmed has reached the wallet.',
  'commissions.loading': 'Loading commissions and rebates',
  'commissions.loadFailed': 'Could not load the commissions and rebates.',
  'commissions.empty': 'No commissions or rebates have been accrued yet.',
  /* A person on the row that this reader holds no territory over. Said in
     words, because a blank name reads as missing data on a money screen. */
  'commissions.outsideScope': 'Outside your territory',
  'commissions.colDate': 'When',
  'commissions.colPartner': 'Partner (earned)',
  'commissions.colClient': 'Client (generated)',
  // The working, so a partner disputing a figure can be answered from the row.
  // The base is the broker's revenue on the closed position — its commission
  // and swap — never the client's deposit, volume or profit.
  'commissions.colBasis': 'Broker revenue x rate',
  'commissions.colAmount': 'Commission',
  'commissions.colDepth': 'Depth',
  'commissions.colTerms': 'Terms',
  'commissions.colStatus': 'Status',
  'commissions.filterStatus': 'Status',
  'commissions.filterStatusAll': 'All statuses',
  /*
   * Commission and rebate are ONE screen with a filter, not two screens.
   *
   * They are the same table differing by one column — same partner, client,
   * rate, rung and reversal path — so two pages would be two sets of columns,
   * sorting, permissions and PII masking to keep in step.
   *
   * "Client rebate" rather than bare "Rebate": the word alone does not say who
   * received it, and the whole reason the column exists is that the two legs of
   * one trade are paid to different people.
   */
  'commissions.colKind': 'Type',
  'commissions.kind.commission': 'Commission',
  'commissions.kind.rebate': 'Client rebate',
  'commissions.filterKind': 'Filter by type',
  'commissions.filterKindAll': 'Commission and rebates',
  'commissions.filterPartner': 'Search partner',
  'commissions.filterPartnerPlaceholder': 'Search by partner name, email or Portal ID',
  'commissions.filterPartnerHint':
    'Matches the partner’s Portal ID, email or name — the identifiers shown in the Partner column. It does not search the client on the row.',
  'commissions.clearFilters': 'Clear',
  'commissions.noun': 'commission',
  'commissions.nounPlural': 'commissions',
  // Calculated but NOT yet credited. Kept distinct from confirmed everywhere,
  // because quoting a partner a pending figure as though it were paid is the
  // mistake this wording exists to prevent.
  'commissions.status.pending': 'Pending',
  'commissions.status.confirmed': 'Confirmed',
  'commissions.status.reversed': 'Reversed',

  // ── The partner directory (/partners) ───────────────────────────────────
  // Back on the owner's request (25 Sep 2026), under Introducing brokers. The
  // strings of the page deleted on 13 Aug went with it except where they still
  // said the right thing; the row actions reuse the profile's own wording, so a
  // partner is suspended in the same words from either screen.
  'partners.title': 'Partners',
  'partners.subtitle':
    'Every approved introducing broker — where they stand, who placed them, their referral code, and what they have earned.',
  'partners.loading': 'Loading partners…',
  'partners.loadFailed': 'Could not load the partner list.',
  'partners.empty': 'No partner matches these filters.',
  'partners.caption': 'Partners',
  'partners.nounOne': 'partner',
  'partners.nounMany': 'partners',
  'partners.searchLabel': 'Search partners',
  'partners.searchPlaceholder': 'Portal ID, name, email or referral code',
  'partners.searchHint':
    'A Portal ID or a referral code matches exactly; a name or an email matches in part.',
  'partners.filterStatus': 'Filter by state',
  'partners.statusAll': 'Every state',
  // "Earning", the profile's word for an active partner — what the state means.
  'partners.statusActive': 'Earning',
  'partners.statusSuspended': 'Suspended',
  'partners.clearFilters': 'Clear filters',

  'partners.colName': 'Partner',
  'partners.colLevel': 'Level',
  'partners.levelLine': 'Level {level}',
  'partners.colAgency': 'Agency',
  // Their clients are offered every product, so this is "unrestricted" and
  // deliberately not "none" — the two read as opposites.
  'partners.noAgency': 'All products',
  'partners.colReferralCode': 'Referral code',
  'partners.copyCode': 'Copy referral code',
  // Confirmed and pending kept apart: quoting a partner a pending figure as
  // though it were paid is the mistake this wording exists to prevent. One line
  // PER CURRENCY — there is no FX source to add them with.
  'partners.colEarnings': 'Commission earned',
  'partners.pendingAmount': '+{amount} pending',
  'partners.pendingHint': 'Calculated by the engine but not yet credited.',
  'partners.nothingEarned': 'Nothing yet',
  'partners.colParent': 'Placed under',
  'partners.direct': 'Direct',
  'partners.directHint': 'Deals with the broker directly — the top of their chain.',
  // A parent EXISTS and sits in another desk's territory. Not "Direct": the two
  // read as the same and decide different terms.
  'partners.parentHidden': 'Outside your territory',
  'partners.colApproved': 'Partner since',
  'partners.suspended': 'Suspended',
  'partners.rowActions': 'Actions for {name}',

  // ── Notifications ─────────────────────────────────────────────────────────
  // The admin bell — `GET /admin/notifications` and its siblings. Task copy is
  // keyed by the backend catalogue's enum in `components/notifications/
  // catalogue.ts`, so a kind this file has no words for fails the build.
  'notifications.open': 'Open notifications',
  // ── The admin bell: TASKS (backend 0140) ────────────────────────────────
  // Every title is phrased as the thing to DO — the owner's rule is that an
  // admin notification means "you must handle something".
  'notifications.needActionLabel':
    '{count:1 task needs your action|{count} tasks need your action}',
  'notifications.tabInbox': 'Inbox',
  'notifications.tabInboxCount': 'Inbox ({count})',
  'notifications.tabHistory': 'History',
  'notifications.viewHistory': 'View history',
  'notifications.openPage': 'Open all notifications',
  'notifications.groupToday': 'Today',
  'notifications.groupYesterday': 'Yesterday',
  'notifications.inboxEmptyTitle': "You're all caught up",
  'notifications.inboxEmptyBody':
    'Deposits, withdrawals, KYC and IB requests for your clients will appear here when they need you.',
  'notifications.historyEmptyTitle': 'No notifications yet',
  'notifications.historyEmptyBody': 'Every task you receive stays here, with how it ended.',
  'notifications.filteredEmptyTitle': 'Nothing matches',
  'notifications.filteredEmptyBody': 'Try another category, or clear the search.',
  'notifications.markRead': 'Mark "{title}" as read',
  'notifications.markReadShort': 'Mark as read',
  'notifications.markUnread': 'Mark "{title}" as unread',
  'notifications.markUnreadShort': 'Mark as unread',
  'notifications.markedRead': 'Marked as read',
  'notifications.undo': 'Undo',
  'notifications.markReadFailed': 'Could not mark it as read.',
  'notifications.markUnreadFailed': 'Could not mark it as unread.',
  'notifications.refreshFailed': "Couldn't refresh — showing the last list.",
  'notifications.loadMore': 'Load more',
  'notifications.loadingMore': 'Loading…',
  'notifications.review': 'Review',
  // Several tasks landing together are one toast, not a stack of them.
  'notifications.burstTitle':
    '{count:1 new task needs your action|{count} new tasks need your action}',
  'notifications.openInbox': 'Open inbox',
  'notifications.taskApproveDeposit': 'Approve deposit',
  'notifications.taskApproveDepositBody': '{amount} · Ref {reference}',
  'notifications.taskDepositAnomaly': 'Resolve deposit anomaly',
  'notifications.taskDepositAnomalyMismatch':
    'The payment platform reported a different amount for this {amount} deposit. Nothing was credited.',
  'notifications.taskDepositAnomalyReversed':
    'The payment platform reversed a settled deposit of {amount}. The wallet was not debited.',
  'notifications.taskDepositAnomalyPaidAfterFailure':
    'The payment platform reports {amount} paid on a deposit already marked failed. No wallet was credited.',
  'notifications.taskDepositAnomalyGeneric': 'A deposit of {amount} needs reconciling.',
  'notifications.taskApproveWithdrawal': 'Approve withdrawal',
  'notifications.taskApproveWithdrawalBody': '{amount} requested',
  'notifications.taskPayoutRefused': 'Payout refused — retry or cancel',
  'notifications.taskPayoutRefusedBody': '{amount} · {reason}',
  'notifications.taskPayoutReconcile': 'Reconcile payout',
  'notifications.taskPayoutReconcileBody':
    'The payment platform and the CRM disagree about whether this payout moved.',
  'notifications.taskReviewKyc': 'Review KYC',
  'notifications.taskReviewKycBody': 'A new identity submission is waiting for review.',
  'notifications.taskReviewKycAgain': 'Review KYC resubmission',
  'notifications.taskReviewKycAgainBody': 'Corrected after a rejection — the client is waiting.',
  'notifications.taskReviewIb': 'Review IB application',
  'notifications.taskReviewIbBody': 'Wants to become an introducing broker.',
  'notifications.taskClawback': 'Reverse IB commission',
  'notifications.taskClawbackCredited':
    '{amount} was already credited for a trade the dealer cancelled.',
  'notifications.taskClawbackPending': '{amount} is pending for a trade the dealer cancelled.',
  'notifications.taskStuckTransfer': 'Release stuck transfer',
  'notifications.taskStuckTransferToAccount':
    '{amount} to a trading account has been pending for over 15 minutes.',
  'notifications.taskStuckTransferToWallet':
    '{amount} back to the wallet has been pending for over 15 minutes.',
  'notifications.outcomeNeedsAction': 'Needs action',
  'notifications.outcomeApproved': 'Approved',
  'notifications.outcomeRejected': 'Rejected',
  'notifications.outcomePaid': 'Paid',
  'notifications.outcomeCancelled': 'Cancelled',
  'notifications.outcomeFailed': 'Failed',
  'notifications.outcomeReleased': 'Released',
  'notifications.outcomeCompleted': 'Completed',
  'notifications.outcomeReversed': 'Reversed',
  'notifications.outcomeResolved': 'Resolved',
  'notifications.outcomeReset': 'Reset by the client',
  'notifications.outcomeHandled': 'Handled',
  'notifications.outcomeBy': '{outcome} · {name}',
  'notifications.pageTitle': 'Notifications',
  'notifications.pageSubtitle':
    'Every deposit, withdrawal, KYC and IB task for the clients in your territory — what still needs you, and how the rest ended.',
  'notifications.searchLabel': 'Search by client',
  'notifications.searchPlaceholder': 'Portal ID or client name',
  'notifications.searchTitle': 'Matches a Portal ID exactly, or part of a name or email.',
  'notifications.title': 'Notifications',
  'notifications.loading': 'Loading notifications',
  'notifications.loadFailed': 'Could not load notifications.',
  // The PANEL's description, read by a screen reader when it opens. Distinct
  // from the trigger's label, which is an action rather than a description.
  'notifications.panelDescription':
    'Deposits, withdrawals, KYC and IB tasks for the clients in your territory.',
  'notifications.markAllRead': 'Mark all as read',
  'notifications.markAllReadFailed': 'Could not mark notifications as read.',
  'notifications.itemUnread': 'Unread',
  'notifications.fallbackTitle': 'Notification',
  // A kind the backend knows and this build of the console does not — yet.
  'notifications.fallbackBody':
    'This version of the console cannot show it yet. Refresh the page to update.',
  'notifications.soundOn': 'Notification sound is on',
  'notifications.soundOff': 'Notification sound is off',

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
  /*
   * The six `dashboard.kyc*` stage labels that lived here are GONE — a third
   * copy of the `kycStatus.*` family, which is why the funnel kept its own
   * word for `submitted` after the review desk changed theirs.
   * `lib/kyc-status.ts` owns them; this file still owns the funnel's chrome.
   */

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
  /*
   * ONE label for the paid outcome, matching the transactions queue.
   *
   * Approving a withdrawal pays it in one step, so `approved` and `success`
   * describe the same fact — `approved` is where rows landed before the two
   * actions became one, `success` is where they land now. The chart sums them
   * into a single bar, and `withdrawals.statePaid` was already deleted for the
   * same reason, so "Approved" is the word the console uses throughout.
   *
   * `dashboard.withdrawalApproved` is kept as the key the merged bar reads,
   * rather than renaming it — the string is what changed, not the concept.
   */
  'dashboard.withdrawalApproved': 'Approved',
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
  /*
   * WHEN this administrator's password last changed. It is on every
   * `/admin/auth/me` payload and its DTO claims "the profile screen words it
   * as unknown rather than guessing" — which was false, because no screen
   * showed it at all. On a console that can approve payouts, "when did I last
   * rotate this" is a question the profile should answer.
   */
  'profile.fieldPasswordChanged': 'Password changed',
  'profile.fieldPasswordNever': 'Not since this was recorded',
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
  // Asked only when the chosen group is sold by more than one product (0142):
  // the product decides the account's commission type.
  'tradingAccounts.fieldProduct': 'Product',
  'tradingAccounts.chooseProduct': 'Choose a product',
  'tradingAccounts.productHint':
    'This group is sold by more than one product. The product decides the commission the account’s trades pay.',
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

  /*
   * The DEALER ADJUSTMENT copy is gone with its dialog — `balanceTitle`,
   * `balanceFor`, `fieldComment`, `commentHint`, `balanceConfirm`,
   * `balanceApplying`, `balanceFailed`, `replayed` and `dealerWarning`, which
   * existed to tell the operator the ledger would not see what they were about
   * to do.
   *
   * `deposited` and `withdrawn` were REWORDED rather than dropped: both quoted
   * an MT5 deal id, which no longer exists on this path, and the withdraw one
   * now has to say the money went to the client's WALLET — an operator reading
   * "debited" as "paid out" would tell the client something false.
   *
   * `deposit` and `withdraw` SURVIVE as the direction labels on the funding
   * dialog, which is now the only money control on this screen.
   */
  'tradingAccounts.deposit': 'Deposit',
  'tradingAccounts.withdraw': 'Withdraw',
  'tradingAccounts.liveBalance': 'Live balance',
  'tradingAccounts.rowActions': 'Actions for account {login}',
  /*
   * FUNDING, which is a different act from the adjustment above and the copy has
   * to say so on both controls. An operator who reads "add money" and picks the
   * dealer adjustment has moved money with no ledger entry behind it; one who
   * picks this for a bonus has minted a deposit onto the client's statement.
   */
  'tradingAccounts.fundTitle': 'Move money on trading account',
  'tradingAccounts.fundAction': 'Add or remove funds',
  'tradingAccounts.fundDirection': 'Direction',
  'tradingAccounts.fundFor': 'MT5 account {login}, in {currency}.',
  'tradingAccounts.fundWallet': 'wallet',
  'tradingAccounts.fundExplainer':
    'Records TWO movements: a deposit into the client {currency} wallet, then a transfer of the same amount to this account. Both appear on the client statement, in the ledger and in the financial reports.',
  /*
   * WHERE THE MONEY GOES is the load-bearing sentence, not the mechanism. An
   * operator who reads "withdraw" as "paid out to the client's bank" has told
   * them something false — this moves it to their wallet, where the reviewed
   * withdrawal desk is what actually pays out.
   */
  'tradingAccounts.withdrawExplainer':
    'Moves money OFF this account and into the client {currency} wallet, recorded as a transfer in the ledger and on their statement. This is NOT a payout — nothing leaves the platform. The client can withdraw it from the wallet through the normal reviewed process.',
  'tradingAccounts.fundAmount': 'Amount',
  'tradingAccounts.fundReason': 'Reason',
  'tradingAccounts.fundReasonPlaceholder': 'Why this money is being moved',
  'tradingAccounts.fundReasonHint':
    'Required. It goes on the audit entry and into the email telling the client their wallet was credited.',
  'tradingAccounts.withdrawReasonHint':
    'Required. It goes on the audit entry and is the only explanation of this movement anybody reading the ledger will have.',
  'tradingAccounts.fundConfirm': 'Add funds',
  'tradingAccounts.withdrawConfirm': 'Remove funds',
  'tradingAccounts.fundApplying': 'Applying…',
  'tradingAccounts.funded': 'Added {amount} to account {login}.',
  'tradingAccounts.withdrawn': 'Moved {amount} from account {login} to the client wallet.',
  'tradingAccounts.fundReplayed': 'Already applied — the stored result was returned.',
  'tradingAccounts.fundFailed': 'That movement did not go through.',
  /*
   * The HALF-DONE case, and it needs its own sentence rather than an error
   * toast. The deposit is not unwound when the onward transfer fails, so the
   * money is genuinely in the wallet — telling the operator "it failed" would
   * send them to fund it a second time.
   */
  'tradingAccounts.fundPartial':
    'The wallet was credited {amount}, but the transfer to the account did not complete: {error} The money is in the client wallet and can be transferred from there.',
  'tradingAccounts.noLoginHint': 'No MT5 account exists for this row, so it has no balance.',
  'tradingAccounts.syncedHint': 'MT5 confirmed this balance {when}.',
  'tradingAccounts.neverSynced': 'never synced',
  'tradingAccounts.neverSyncedHint':
    'MT5 has never confirmed a balance for this account. This is not a zero balance — it means the bridge has not delivered one yet.',
  'tradingAccounts.neverSyncedFootnote':
    'Some accounts show “never synced”: the bridge has not delivered a balance for them yet. That is different from a zero balance — check that the MT5 bridge is running.',
} as const;

/** Every valid key. A typo is a compile error, never a string rendered as itself. */
export type MessageKey = keyof typeof messages;
