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
  'nav.roles': 'Roles & Permissions',
  'nav.auditLog': 'Audit Log',
  'nav.settings': 'Settings',
  'nav.comingSoon': 'Soon',
  'nav.comingSoonTitle': '{label} — coming soon',
  'nav.logout': 'Logout',
  'nav.collapseSidebar': 'Collapse the sidebar',
  'nav.expandSidebar': 'Expand the sidebar',
  'nav.searchPlaceholder': 'Search clients, deals, IBs… (⌘K)',
  'nav.searchAria': 'Global search across the console',
  'nav.notifications': 'Notifications',
  'nav.systemStatus': 'System Operational',

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

  // ── Security controls (master admin) ──────────────────────────────────────
  'security.title': 'Security controls',
  'security.subtitle':
    'Controls that can be switched off for testing. Leave them on unless you have a reason not to.',
  'security.loading': 'Loading security controls',
  'security.enforced': 'On — enforced on every request.',
  'security.notEnforced': 'OFF — this protection is NOT being enforced.',
  'security.turnOff': 'Turn off',
  'security.turnOn': 'Turn on',
  'security.lastChanged': 'Last changed {when}',
  'security.updateFailed': 'Could not change that control. Please try again.',
  'security.auditNote':
    'Every change is recorded in the admin action log with who made it, and turning a control off raises an alert for as long as it stays off.',
  // Names what stops being enforced, rather than asking a generic "are you
  // sure?" — the question people learn to click through.
  'security.confirmDisable':
    'Turn OFF “{label}”?\n\nThis protection will stop being enforced immediately, for every client. The change is recorded against your account and will keep raising an alert until it is turned back on.',
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

  // ── Partners (IB lifecycle) ───────────────────────────────────────────────
  'partners.title': 'Partners / IBs',
  'partners.subtitle':
    'Introducing-broker applications and lifecycle — approval gates the partner portal',
  'partners.searchPlaceholder': 'Search by name, email, code…',
  'partners.colPartner': 'Partner',
  'partners.colStatus': 'Status',
  'partners.colParent': 'Parent IB',
  'partners.colProgram': 'Program',
  'partners.colReferralCode': 'Referral Code',
  'partners.colApplied': 'Applied',
  'partners.colActions': 'Actions',

  // ── Roles (/roles) ────────────────────────────────────────────────────────
  // RBAC-01/02. Was the "Roles" tab of /settings until the three concerns were
  // split into their own routes: defining roles, holding them, and network
  // access are separate jobs and were only ever one page by accident.
  'roles.title': 'Roles & Permissions',
  'roles.subtitle':
    'Define what a role may do. Permissions come from the API catalog, so a role can never grant something the backend does not enforce.',

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
  'smtp.restricted':
    'Only a master admin can view or change the mail server. Whoever controls it receives every password-reset and invitation link this system sends.',
  'smtp.sourceEnvironment':
    'Nothing has been saved here yet — these are the server’s own start-up settings. Saving stores them in the database, where they can be changed without a deploy.',
  'smtp.sourceDatabase': 'Saved settings, last changed {when}.',
  'smtp.host': 'Host',
  'smtp.hostPlaceholder': 'smtp.postmarkapp.com',
  'smtp.port': 'Port',
  'smtp.portHint': '587 for STARTTLS, 465 for implicit TLS.',
  'smtp.username': 'Username',
  'smtp.usernameHint': 'Leave empty for a relay that takes no credentials.',
  'smtp.password': 'Password',
  'smtp.passwordSetHint':
    'A password is stored. Leave empty to keep it, or type a new one to replace it.',
  'smtp.passwordNoneHint': 'No password is stored.',
  'smtp.passwordClear': 'Remove the stored password',
  'smtp.passwordNeverShown': 'The stored password is encrypted and is never shown again.',
  'smtp.fromAddress': 'From address',
  'smtp.fromHint':
    'The sender on every message. Include a display name, e.g. "OxShare" <no-reply@oxshare.com>.',
  'smtp.secure': 'Use implicit TLS (SMTPS)',
  'smtp.secureHint': 'On for port 465. Off uses STARTTLS, which is the usual choice on 587.',
  'smtp.save': 'Save mail settings',
  'smtp.saving': 'Saving...',
  'smtp.saved': 'Saved',
  'smtp.updateFailed': 'Could not save the mail settings.',
  'smtp.test': 'Send test email',
  'smtp.testing': 'Sending...',
  'smtp.testSentDatabase': 'Sent to {email} using the saved settings. Check your inbox.',
  'smtp.testSentEnvironment':
    'Sent to {email} using the server’s start-up settings. Check your inbox.',
  'smtp.testFailed': 'The test message could not be sent.',
  'smtp.testHint': 'Sends to your own address using whatever is currently saved.',
  'smtp.unsavedWarning':
    'You have unsaved changes. A test sends the SAVED settings, not what is on screen.',
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

  'partners.noParent': '— (L1)',

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
  'ledger.filterClientEntries': "Filter this client's entries",
  'ledger.filterAllEntryTypes': 'All Entry Types',
  'ledger.filterByUserIdAria': 'Filter by client user ID',
  'login.emailPlaceholder': 'admin@oxshare.com',
  'partners.searchAria': 'Search partners by name, email or referral code',
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
} as const;

/** Every valid key. A typo is a compile error, never a string rendered as itself. */
export type MessageKey = keyof typeof messages;
