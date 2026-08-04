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
  // ── Brand and chrome ──────────────────────────────────────────────────────
  'app.name': 'OXShare',
  'app.adminName': 'Admin Portal',
  'app.adminSuffix': 'Admin',

  // ── Navigation ────────────────────────────────────────────────────────────
  'nav.section.main': 'MAIN',
  'nav.section.financials': 'FINANCIALS',
  'nav.section.management': 'MANAGEMENT',
  'nav.dashboard': 'Dashboard',
  'nav.clients': 'Clients',
  'nav.partners': 'Partners / IBs',
  'nav.tradingAccounts': 'Trading Accounts',
  'nav.withdrawals': 'Withdrawals',
  'nav.payouts': 'Payouts',
  'nav.ledger': 'Ledger',
  'nav.commissionPlans': 'Commission Plans',
  'nav.kyc': 'KYC Review',
  'nav.kycBuilder': 'KYC Workflow Builder',
  'nav.adminUsers': 'Admin Users',
  'nav.auditLog': 'Audit Log',
  'nav.settings': 'Roles & Settings',
  'nav.comingSoon': 'Soon',
  'nav.comingSoonTitle': '{label} — coming soon',
  'nav.logout': 'Logout',
  'nav.searchPlaceholder': 'Search clients, deals, IBs… (⌘K)',
  'nav.notifications': 'Notifications',
  'nav.systemStatus': 'System Operational',

  // ── Session ───────────────────────────────────────────────────────────────
  'session.loading': 'Loading your session',
  'session.deniedTitle': 'Access denied',
  'session.deniedBody':
    'Your role does not include access to this section. Ask a master admin if you need it.',
  'session.backToDashboard': 'Back to dashboard',

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

  // ── Withdrawals (ADM-03) ──────────────────────────────────────────────────
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
  'withdrawals.markPaid': 'Mark Paid',
  'withdrawals.rejectionReason': 'Rejection Reason',
  'withdrawals.selectReason': 'Select a reason…',
  'withdrawals.reasonPlaceholder': 'e.g. Beneficiary name does not match the account holder…',
  'withdrawals.providerRef': 'Provider reference',
  'withdrawals.providerRefPlaceholder': 'e.g. whish-payout-9911',
  'withdrawals.tabPending': 'Pending Review',
  'withdrawals.tabApproved': 'Approved / Paid',
  'withdrawals.tabRejected': 'Rejected / Failed',

  // ── Ledger (ADM-13) ───────────────────────────────────────────────────────
  'ledger.title': 'Ledger',
  'ledger.subtitle':
    'Every money movement, append-only. Each row records the running balance it produced — corrections are new compensating entries, never edits.',
  'ledger.allTypes': 'All Entry Types',
  'ledger.filterUser': 'Filter by user ID…',
  'ledger.colWhen': 'When',
  'ledger.colType': 'Type',
  'ledger.colAmount': 'Amount',
  'ledger.colBalanceAfter': 'Balance After',
  'ledger.colCausedBy': 'Caused By',
  'ledger.colClient': 'Client',

  // ── Audit log (D-21) ──────────────────────────────────────────────────────
  'audit.title': 'Audit Log',
  'audit.subtitle': 'Append-only record of every admin action — who did what, to what, and when',
  'audit.allActions': 'All Actions',
  'audit.colWhen': 'When',
  'audit.colActor': 'Actor',
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
  'pagination.summaryOfTotal': 'Showing {showing} {noun} of {total}',
  'pagination.page': 'Page {number}',
  'pagination.previous': 'Previous',
  'pagination.next': 'Next',
  'pagination.rowsPerPage': 'Rows per page:',

  // ── Shared / generic ──────────────────────────────────────────────────────
  'common.retry': 'Try again',
  'common.loading': 'Loading',
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.delete': 'Delete',
  'common.confirm': 'Confirm',
  'common.genericError': 'Something went wrong. Please try again.',
  'common.requestId': 'Reference: {id}',
} as const;

/** Every valid key. A typo is a compile error, never a string rendered as itself. */
export type MessageKey = keyof typeof messages;
