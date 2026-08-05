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
  'nav.roles': 'Roles & Permissions',
  'nav.auditLog': 'Audit Log',
  'nav.settings': 'Settings',
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

  // ── Settings / RBAC ───────────────────────────────────────────────────────
  // /settings is now network and security only — see roles.* and adminUsers.*
  // above. The settings.* keys below are still shared by the RBAC components
  // (role-card, role-form-modal), which both pages render.
  'settings.title': 'Settings',
  'settings.subtitle': 'Network access and the security controls protecting this admin API.',
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
  'kycReview.uploadedFiles': 'Uploaded Files ({count})',
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
