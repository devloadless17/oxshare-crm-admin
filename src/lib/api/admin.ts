import { apiClient, idempotent } from './client';
import type { components } from './types.gen';

// Types are ALIASES of the schemas generated from the backend's Swagger
// (npm run gen:api-types, with the backend running). Never hand-write an
// interface for an API request OR response — regenerate instead; drift then
// becomes a compile error (docs/API-CONTRACTS.md Part C).
export type PermissionItem = components['schemas']['PermissionItemDto'];
export type PermissionModule = components['schemas']['PermissionModuleDto'];
export type Role = components['schemas']['RoleResponseDto'];
export type AdminUser = components['schemas']['AdminProfileDto'];
export type RejectionReason = components['schemas']['RejectionReasonResponseDto'];
/**
 * Which decision a configured reason belongs to.
 *
 * Read off the response type rather than written out, so a context added on the
 * backend reaches the callers as a compile error at the switch that does not
 * handle it — which is what a hand-written union here failed to do when
 * 'partner' arrived.
 */
export type RejectionContext = RejectionReason['context'];
export type KycSubmission = components['schemas']['KycSubmissionDto'];
export type KycListResponse = components['schemas']['KycListResponseDto'];
export type ClientRow = components['schemas']['ClientRowDto'];
export type ClientListResponse = components['schemas']['ClientListResponseDto'];
/**
 * The six identity-verification states, read off the row rather than written
 * out — a state added on the backend then reaches the label and colour maps as
 * a missing-key compile error rather than rendering as a raw enum string.
 *
 * NOT a synonym for `status`, which is the ACCOUNT state (may this person sign
 * in), nor for `verificationLevel`, which is the TIER a decision granted. All
 * three are separate columns on the client list for exactly that reason: a
 * rejected submission leaves the level at 0, exactly where a client who never
 * applied sits, and those are opposite pieces of work for a reviewer.
 */
export type ClientKycStatus = ClientRow['kycStatus'];
export type ClientProfile = components['schemas']['ClientProfileDto'];
export type ClientTag = components['schemas']['ClientTagDto'];
export type ClientTagWithCount = components['schemas']['ClientTagWithCountDto'];
export type ClientFieldGroup = components['schemas']['ClientFieldGroupDto'];
export type Currency = components['schemas']['CurrencyDto'];
export type IbLevel = components['schemas']['IbLevelDto'];
export type IbApplication = components['schemas']['IbApplicationDto'];
export type IbApplicationStatus = IbApplication['status'];
export type IbAccount = components['schemas']['IbAccountDto'];

/**
 * The queue page. Hand-declared: the endpoint returns rows joined to their
 * applicant plus per-status counts, and Nest describes that shape as a bare
 * object because the handler returns a store result rather than a DTO class.
 *
 * REPLACE THIS with an alias once `AdminIbController.list` declares an
 * `@ApiOkResponse` DTO — this is the gap, named so it gets closed.
 */
/**
 * The partner list. Hand-declared for the same reason as `IbApplicationPage`:
 * the handler returns a store result rather than a DTO class, so Nest describes
 * it as a bare object.
 *
 * REPLACE with an alias once `AdminIbController.listPartners` declares an
 * `@ApiOkResponse` DTO.
 */
export interface IbPartnerPage {
  rows: Array<{
    account: IbAccount;
    user: { id: string; email: string; firstName: string; lastName: string };
    levelName: string;
    /**
     * What this partner has earned, summed by the SERVER across all their
     * accruals — decimal strings (§6.1), never numbers.
     *
     * Two figures rather than one total, and deliberately so: `confirmed` is
     * money the platform has credited, `pending` is what the engine has
     * calculated and not yet paid. Collapsing them would let an operator quote
     * a partner a figure that has not settled.
     *
     * A partner with no accruals reports '0' for both rather than being absent,
     * so a caller never has to distinguish "nothing earned" from "no data".
     */
    earnings: { confirmed: string; pending: string };
  }>;
  total: number;
}

export interface IbApplicationPage {
  rows: Array<{
    application: IbApplication;
    user: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      verificationLevel: number;
    };
  }>;
  total: number;
  counts: Record<IbApplicationStatus, number>;
}
// ── The money surface (ADM-03, ADM-13) ──────────────────────────────────────

export type WithdrawalRow = components['schemas']['WithdrawalRowDto'];
export type WithdrawalListResponse = components['schemas']['WithdrawalListResponseDto'];
/**
 * The five states a withdrawal can be in, read off the row rather than written
 * out — a state added on the backend then reaches the `STATE_META` map as a
 * missing-key compile error rather than rendering as a raw enum string.
 */
export type WithdrawalState = WithdrawalRow['state'];
export type LedgerEntry = components['schemas']['LedgerEntryDto'];
export type LedgerListResponse = components['schemas']['LedgerListResponseDto'];
export type ReconciliationReport = components['schemas']['ReconciliationReportDto'];
export type WalletDiscrepancy = components['schemas']['WalletDiscrepancyDto'];
export type ApiKey = components['schemas']['ApiKeyDto'];
/** The create response — the ONLY moment `plaintext` is ever populated. */
export type IssuedApiKey = components['schemas']['IssuedApiKeyDto'];
export type PaymentMethod = components['schemas']['PaymentMethodDto'];
export type CreatePaymentMethod = components['schemas']['CreatePaymentMethodDto'];
export type UpdatePaymentMethod = components['schemas']['UpdatePaymentMethodDto'];
/*
 * `PaymentMethodKind` is GONE, with the column behind it (migration 0043).
 *
 * It read `manual | gateway | crypto` and claimed to be the deposit FLOW. It was
 * really a fact about the backend's own integrations, and this console asked an
 * operator to pick it from a dropdown — a question about our code, put to
 * somebody who cannot answer it and whose wrong answer routed clients down the
 * wrong deposit path. The server derives the flow from the key now.
 */

export type CreateIbLevel = components['schemas']['CreateIbLevelDto'];
export type UpdateIbLevel = components['schemas']['UpdateIbLevelDto'];
export type CreateCurrency = components['schemas']['CreateCurrencyDto'];
export type UpdateCurrency = components['schemas']['UpdateCurrencyDto'];

/**
 * The columns the API will sort by, mirroring its SORTABLE_COLUMNS allowlist.
 *
 * A column may not declare a `sortKey` outside this list. That is what stops
 * the table promising an order the endpoint refuses — R-2.5 makes an
 * unrecognised sort a 400 rather than a silent fallback, so a header outside
 * this set would produce an error instead of rows.
 */
export const CLIENT_SORT_KEYS = [
  'createdAt',
  'email',
  'firstName',
  'status',
  'type',
  'verificationLevel',
  'country',
] as const;
export type ClientSortKey = (typeof CLIENT_SORT_KEYS)[number];

export interface ClientListParams {
  limit: number;
  page?: number;
  /**
   * Ask for the count. Numbered pages cannot be drawn without it.
   *
   * Opt-in because counting ~219,000 rows is a full scan — the endpoint returns
   * no `total` at all unless this is set, and `ClientListResponseDto.total` is
   * optional for exactly that reason. A pager handed `undefined` would draw one
   * page and hide the rest of the list.
   */
  withTotal?: boolean;
  q?: string;
  type?: string;
  /**
   * The ACCOUNT state — `active | pending | suspended`, i.e. whether this person
   * may sign in. Deliberately not a verification state: `pending` here says the
   * account is not yet active and says nothing at all about documents. Read
   * `kycStatus` and `emailVerified` for those.
   */
  status?: string;
  level?: string;
  /**
   * Still accepted by the endpoint, and still sent when a saved link carries it
   * — the client list no longer OFFERS a country control, but a URL somebody
   * bookmarked must keep resolving to the segment it named.
   */
  country?: string;
  /**
   * One of the six `ClientKycStatus` values. An unrecognised one is a 400
   * naming the six, never a silent fallback — so this is only ever set from a
   * value that came out of the enum.
   */
  kycStatus?: string;
  /** `'true' | 'false'` as a string: it travels as a query parameter. */
  emailVerified?: string;
  /** Tag SLUG, not id — a rename must not break a link somebody saved. */
  tag?: string;
  sort?: ClientSortKey;
  order?: 'asc' | 'desc';
}

/**
 * The six KYC states, in the order a submission moves through them.
 *
 * Derived-checked against `ClientKycStatus` by the `satisfies` below, so a
 * state added on the backend fails to compile here rather than quietly missing
 * from the filter — which would leave a segment of clients unfindable.
 */
export const CLIENT_KYC_STATUSES = [
  'not_started',
  'in_progress',
  'submitted',
  'under_review',
  'approved',
  'rejected',
] as const satisfies readonly ClientKycStatus[];

/**
 * The columns `GET /admin/withdrawals` will sort by, mirroring the backend's
 * `WITHDRAWAL_SORT_COLUMNS` (modules/payments/transactions.service.ts).
 *
 * `amount` IS here and is safe to offer: the server orders on the
 * `NUMERIC(28,8)` column, so this is a true decimal ordering rather than the
 * text comparison a client-side sort would do. That is the difference between
 * "the largest withdrawal" meaning the largest of all of them and meaning the
 * largest of the twenty-five on screen.
 *
 * There is no `destination` key — the queue's destination column must stay
 * unsortable, because R-2.5 makes an unrecognised sort a 400 rather than a
 * silent fallback, so declaring it would produce an error instead of rows.
 */
export const WITHDRAWAL_SORT_KEYS = [
  'createdAt',
  'amount',
  'state',
  'userEmail',
  'userFirstName',
] as const;
export type WithdrawalSortKey = (typeof WITHDRAWAL_SORT_KEYS)[number];

export interface WithdrawalListParams {
  state?: string;
  limit: number;
  page?: number;
  sort?: WithdrawalSortKey;
  order?: 'asc' | 'desc';
}

// ── Holdings: wallets and trading accounts (AdminHoldingsController) ─────────
//
// Aliases, like the rest of this surface. `balance`, `onHold` and every other
// monetary field on these rows is a STRING and must reach the DOM as one —
// §6.1. Nothing here parses one, and neither should a caller.

export type WalletRow = components['schemas']['WalletRowDto'];

/**
 * One partner commission, with both people it concerns.
 *
 * ## ⚠️ HAND-DECLARED, and this is the gap
 *
 * `GET /admin/ib/accruals` composes its response in the store rather than
 * returning a DTO class, so Swagger emits no named schema and
 * openapi-typescript has nothing to alias. Per the repo rule, it is written out
 * here and the gap is named so it gets replaced rather than forgotten: adding an
 * `IbAccrualPageDto` on the controller makes this an alias and deletes the
 * duplication.
 *
 * Everything monetary is a STRING (§6.1). `amount` is what the partner earned,
 * `baseAmount` the deposit it was calculated from, `rateValue` the percentage
 * applied — all three shown, because a commission nobody can recompute is one
 * nobody can dispute.
 */
export interface IbAccrual {
  accrual: {
    id: string;
    status: 'pending' | 'confirmed' | 'reversed';
    amount: string;
    baseAmount: string;
    rateValue: string;
    currency: string;
    level: number;
    depth: number;
    sourceType: string;
    sourceId: string;
    createdAt: string;
    confirmedAt: string | null;
  };
  /** The partner being PAID. */
  partner: { id: string; email: string; firstName: string | null; lastName: string | null };
  /** The client whose deposit GENERATED it — a different person. */
  client: { id: string; email: string; firstName: string | null; lastName: string | null };
}

export interface IbAccrualPage {
  rows: IbAccrual[];
  total: number;
  /** Summed in SQL across the whole filtered set, not the page. */
  totals: { status: string; amount: string }[];
}

/** The sort keys `GET /admin/ib/accruals` accepts — mirrors the API allow-list. */
export const IB_ACCRUAL_SORT_KEYS = ['createdAt', 'amount', 'status', 'level'] as const;
export type IbAccrualSortKey = (typeof IB_ACCRUAL_SORT_KEYS)[number];
/** One movement of a client's money — what `creditWallet` answers with. */
export type Transaction = components['schemas']['TransactionDto'];
/**
 * `transaction.provider` for money an admin placed by hand.
 *
 * The one provider value a screen may recognise by name: such a row has no
 * `methodKey` and no `methodName` (it went through no payment method), so
 * without this it renders as having no source at all. Mirrors the constant of
 * the same name in the backend and in the portal — all three must agree.
 */
export const MANUAL_ADMIN_PROVIDER = 'manual_admin';
export type WalletListResponse = components['schemas']['WalletListResponseDto'];
export type TradingAccountRow = components['schemas']['TradingAccountRowDto'];
export type TradingAccountListResponse = components['schemas']['TradingAccountListResponseDto'];
/**
 * live | demo, and active | suspended | closed — read off the ROW rather than
 * written out, so an environment or status added on the backend arrives as a
 * missing-key compile error in the label maps rather than as a raw enum string
 * on the screen.
 */
export type TradingAccountEnvironment = TradingAccountRow['environment'];
export type TradingAccountStatus = TradingAccountRow['status'];

/**
 * The columns `GET /admin/wallets` will sort by, mirroring the endpoint's own
 * `sort` enum in the OpenAPI document.
 *
 * `balance` IS here and is safe to offer for the same reason the withdrawal
 * queue's `amount` is: the server orders on the `NUMERIC(28,8)` column, so this
 * is a true decimal ordering rather than the text comparison a client-side sort
 * would do — which put '100.00000000' below '9.00000000'.
 *
 * There is no `onHold` and no `updatedAt` key. A column outside this list must
 * declare `sortable: false`: R-2.5 makes an unrecognised sort a 400 rather than
 * a silent fallback, so a header claiming one would produce an error page
 * instead of rows.
 */
export const WALLET_SORT_KEYS = [
  'createdAt',
  'balance',
  'currency',
  'userEmail',
  'userFirstName',
] as const;
export type WalletSortKey = (typeof WALLET_SORT_KEYS)[number];

export interface WalletListParams {
  limit: number;
  page?: number;
  userId?: string;
  /** Exact match on the wallet code, e.g. `USD`. Not a substring search. */
  currency?: string;
  sort?: WalletSortKey;
  order?: 'asc' | 'desc';
}

/**
 * The columns `GET /admin/trading-accounts` will sort by.
 *
 * `login` is nullable and the endpoint pins NULLS LAST in both directions, so
 * sorting by it groups the accounts MT5 has not issued a login for at the end
 * rather than interleaving them — which is the useful answer, since "no login
 * yet" is a state rather than a value.
 *
 * There is no `tier`, no `leverage` and no `mt5Group` key, so those columns
 * must declare `sortable: false`.
 */
export const TRADING_ACCOUNT_SORT_KEYS = [
  'createdAt',
  'balance',
  'login',
  'currency',
  'status',
  'environment',
  'userEmail',
  'userFirstName',
] as const;
export type TradingAccountSortKey = (typeof TRADING_ACCOUNT_SORT_KEYS)[number];

export interface TradingAccountListParams {
  limit: number;
  page?: number;
  userId?: string;
  environment?: TradingAccountEnvironment;
  status?: TradingAccountStatus;
  sort?: TradingAccountSortKey;
  order?: 'asc' | 'desc';
}

/**
 * The columns `GET /admin/kyc` will sort by, mirroring the backend's
 * `KYC_SORT_COLUMNS` (store/kyc.store.ts).
 *
 * Note what is ABSENT: there is no `userId` and no `country`. The review queue
 * declared both as sortable headers and the endpoint has never accepted either
 * — `country` lives in a JSON blob rather than a column, and sorting a queue by
 * opaque user id is not a question anybody asks.
 */
export const KYC_SORT_KEYS = [
  'submittedAt',
  'status',
  'createdAt',
  'userEmail',
  'userFirstName',
] as const;
export type KycSortKey = (typeof KYC_SORT_KEYS)[number];

/**
 * Query string for the client list. Exported for its own unit test.
 *
 * Empty values are OMITTED rather than sent blank: `?country=` reaches the API
 * as an empty string, and a filter that is present-but-empty is a different
 * request from one that is absent.
 *
 * `page` and `withTotal` are handled apart from the string filters because they
 * are not strings — the loop below tests `typeof value === 'string'`, which
 * silently dropped a numeric page and a boolean flag when they were first
 * added. A page parameter that vanishes on the way out looks exactly like a
 * pager that does not work.
 */
export function clientListSearchParams(params: ClientListParams): URLSearchParams {
  const query = new URLSearchParams();
  query.set('limit', String(params.limit));
  if (params.page !== undefined) query.set('page', String(params.page));
  if (params.withTotal) query.set('withTotal', 'true');
  for (const [key, value] of Object.entries(params)) {
    if (key === 'limit' || key === 'page' || key === 'withTotal') continue;
    if (typeof value === 'string' && value !== '') query.set(key, value);
  }
  return query;
}
// ── Dashboard statistics (GET /admin/stats/*) ───────────────────────────────
//
// Aliases, like everything else on this surface. The overview in particular has
// to be one: its four sections are OPTIONAL and each is present only when the
// caller holds the matching permission, so a hand-written interface that made
// them required would compile away the exact distinction the endpoint exists to
// draw — "hidden from you" versus "there are none".

export type StatsOverview = components['schemas']['StatsOverviewDto'];
export type ClientStats = components['schemas']['ClientStatsDto'];
export type KycStats = components['schemas']['KycStatsDto'];
export type WithdrawalStats = components['schemas']['WithdrawalStatsDto'];
export type IbStats = components['schemas']['IbStatsDto'];
/**
 * One withdrawal state with its count and summed amount.
 *
 * `totalAmount` is a STRING and stays one — the same rule as every other amount
 * on this surface (§6.1). A chart may convert it to plot a bar; nothing may
 * convert it to display one.
 */
export type WithdrawalStateTotal = components['schemas']['WithdrawalStateTotalDto'];

export type RegistrationSeries = components['schemas']['RegistrationSeriesDto'];
export type RegistrationPoint = components['schemas']['RegistrationPointDto'];
export type KycTrendSeries = components['schemas']['KycTrendSeriesDto'];
export type KycTrendPoint = components['schemas']['KycTrendPointDto'];
export type WithdrawalVolumeSeries = components['schemas']['WithdrawalVolumeSeriesDto'];
export type WithdrawalVolumePoint = components['schemas']['WithdrawalVolumePointDto'];

/**
 * The window every time series is asked for, in days.
 *
 * A union rather than `number`: the API answers 400 for anything outside 1–365
 * (R-2.5 — never a silent clamp), and the period selector offers exactly three
 * presets. Typing it this way means a fourth preset is a compile error at the
 * selector rather than a 400 at runtime.
 */
export const STATS_WINDOWS = [7, 30, 90] as const;
export type StatsWindow = (typeof STATS_WINDOWS)[number];

export type AuditEntry = components['schemas']['AuditEntryDto'];
export type AuditListResponse = components['schemas']['AuditListResponseDto'];
export type AuditAction = components['schemas']['AuditActionDto'];

/**
 * The columns `GET /admin/audit-log` will sort by, mirroring the backend's
 * `AUDIT_SORT_COLUMNS` (store/audit-log.store.ts).
 *
 * The trail used to accept no `sort` at all — it ordered by `created_at DESC,
 * id DESC` and nothing else — so every column on the screen was correctly
 * marked `sortable: false`. Three of them can now be ordered on the server.
 *
 * Note what is ABSENT: `subjectType`, `subjectId` and `details`. The first is a
 * declared FILTER but not a sort key, and the other two are a free-text id and
 * a JSON blob. R-2.5 makes an unrecognised sort a 400 rather than a silent
 * fallback, so those columns must keep declaring `sortable: false`.
 */
export const AUDIT_SORT_KEYS = ['createdAt', 'action', 'actorEmail'] as const;
export type AuditSortKey = (typeof AUDIT_SORT_KEYS)[number];

/**
 * The columns `GET /admin/ib/applications` will sort by, mirroring the
 * backend's `IB_APPLICATION_SORT_COLUMNS` (store/ib.store.ts).
 *
 * The applicant columns come from the `users` INNER JOIN the queue already does
 * to display a name and email, so ordering by them costs no extra join.
 *
 * There is no `expectedVolume` key — it is a self-reported free-text field
 * rather than an indexed column — so that column stays `sortable: false`.
 */
export const IB_APPLICATION_SORT_KEYS = [
  'submittedAt',
  'status',
  'userEmail',
  'userFirstName',
] as const;
export type IbApplicationSortKey = (typeof IB_APPLICATION_SORT_KEYS)[number];

/**
 * The columns `GET /admin/ib/partners` will sort by, mirroring the backend's
 * `IB_PARTNER_SORT_COLUMNS` (store/ib.store.ts).
 *
 * `level` sorts as the INTEGER it is. That is worth stating because the obvious
 * alternative — ordering by the joined level NAME — would put "Level 10" before
 * "Level 2" as text, which is the kind of ordering that looks plausible enough
 * to ship.
 *
 * There is no `parentIbUserId` key: the partner column renders "Direct" or
 * "Has parent" rather than the id, so a sort on it would order by opaque UUID
 * and answer a question nobody asked.
 */
export const IB_PARTNER_SORT_KEYS = [
  'approvedAt',
  'level',
  'referralCode',
  'userEmail',
  'userFirstName',
] as const;
export type IbPartnerSortKey = (typeof IB_PARTNER_SORT_KEYS)[number];

// Request bodies, aliased too. These were hand-written until the backend moved
// its inline controller DTOs into dto/ files with @ApiProperty — before that they
// generated as `Record<string, never>` and there was nothing to alias, so the
// "never hand-write an interface" rule above only covered responses in practice.
export type CreateRoleRequest = components['schemas']['RoleDto'];
export type UpdateRoleRequest = components['schemas']['UpdateRoleDto'];
export type UpdateAdminRequest = components['schemas']['UpdateAdminDto'];
/** An invite sent and not yet accepted. Never carries the token — see the DTO. */
export type PendingInvite = components['schemas']['PendingInviteDto'];
export type CreateInviteRequest = components['schemas']['InviteDto'];
export type CreateInviteResponse = components['schemas']['InviteResponseDto'];
export type InviteValidation = components['schemas']['InviteValidationDto'];
export type AcceptInviteResponse = components['schemas']['AcceptInviteResponseDto'];

/**
 * One operator-controlled security control — FR-CORE-08's OTP is the first.
 *
 * Aliased from the generated schema, never hand-written (R-1.1): if the backend
 * renames `enabled`, this becomes a compile error rather than a toggle that
 * silently always reads false.
 */
/** One platform's download link. `url` is null until an admin sets it. */
export type PlatformLink = components['schemas']['PlatformLinkDto'];

export type SecuritySwitch = components['schemas']['SecuritySwitchDto'];

/** Brand name, support contacts and the maintenance notice. */
export type GeneralSettings = components['schemas']['GeneralSettingsDto'];
export type UpdateGeneralSettings = components['schemas']['UpdateGeneralSettingsDto'];

/**
 * The mail configuration.
 *
 * There is no `password` on the RESPONSE type, and that is the contract rather
 * than an omission: the API never returns the stored password. `passwordSet`
 * says only whether one exists, which is what lets the form offer "leave blank
 * to keep the current password" truthfully instead of rendering dots that
 * cannot be edited.
 */
export type SmtpSettings = components['schemas']['SmtpSettingsDto'];
export type UpdateSmtpSettings = components['schemas']['UpdateSmtpSettingsDto'];
export type SmtpTestResult = components['schemas']['SmtpTestResultDto'];

export const adminApi = {
  /** Master admin only — the API answers 403 for anyone else. */
  async getSecuritySettings(): Promise<SecuritySwitch[]> {
    const { data } = await apiClient.get<SecuritySwitch[]>('/admin/security-settings');
    return data;
  },

  async setSecuritySwitch(key: string, enabled: boolean): Promise<SecuritySwitch> {
    const { data } = await apiClient.put<SecuritySwitch>(`/admin/security-settings/${key}`, {
      enabled,
    });
    return data;
  },
  /**
   * The trading-terminal download links the client portal shows.
   *
   * Always returns every platform, configured or not - `url: null` means the
   * operator has not set it up, which the portal renders as "not available yet"
   * rather than as a link that goes nowhere.
   */
  async getPlatformLinks(): Promise<PlatformLink[]> {
    const { data } = await apiClient.get<PlatformLink[]>('/admin/platforms');
    return data;
  },

  /**
   * Set or clear one link. An empty string CLEARS it.
   *
   * Clearing matters more than it looks: taking a broken download offline is
   * something an operator does in a hurry, and making them hunt for a separate
   * delete control is how a dead link stays up.
   *
   * The API accepts https only. That is not a formatting preference - this
   * value becomes an `href` in every client's browser, so `javascript:` here
   * would be stored XSS against every client who opens the downloads page, and
   * plain http is a channel anyone on the path can rewrite, for a link whose
   * whole purpose is delivering an executable.
   */
  async setPlatformLink(key: string, url: string): Promise<PlatformLink> {
    const { data } = await apiClient.put<PlatformLink>(`/admin/platforms/${key}`, { url });
    return data;
  },

  /**
   * The currencies this platform supports.
   *
   * Includes DISABLED ones, unlike the portal's `GET /currencies` — managing
   * them is the point of this screen, and a currency you cannot see is one you
   * cannot re-enable.
   */
  async getCurrencies(signal?: AbortSignal): Promise<Currency[]> {
    const { data } = await apiClient.get<Currency[]>('/admin/currencies', { signal });
    return data;
  },

  async createCurrency(body: CreateCurrency): Promise<Currency> {
    const { data } = await apiClient.post<Currency>('/admin/currencies', body);
    return data;
  },

  /**
   * PATCH, and only the supplied fields change.
   *
   * `code` is absent from `UpdateCurrency` by design: it is the primary key and
   * wallets, transactions and transfers reference it, so a rename would be a
   * data migration across four money tables rather than an edit.
   *
   * Setting `isDefault: true` moves the flag off whatever holds it, atomically.
   * The API refuses to leave the platform with NO default, because registration
   * reads it to decide which wallet to open for a new client.
   */
  async updateCurrency(code: string, body: UpdateCurrency): Promise<Currency> {
    const { data } = await apiClient.patch<Currency>(`/admin/currencies/${code}`, body);
    return data;
  },

  /**
   * Only ever succeeds for a currency nobody holds.
   *
   * The API answers 409 when any wallet exists in it, because balances and
   * append-only ledger history depend on the row. Disabling is the operation
   * that means "stop offering this": it blocks new wallets while leaving the
   * existing ones readable and spendable.
   */
  async deleteCurrency(code: string): Promise<void> {
    await apiClient.delete(`/admin/currencies/${code}`);
  },

  /**
   * The IB payout ladder, shallowest level first.
   *
   * Includes DISABLED levels — managing them is the point of the screen, and a
   * level you cannot see is one you cannot re-enable.
   */
  async getIbLevels(signal?: AbortSignal): Promise<IbLevel[]> {
    const { data } = await apiClient.get<IbLevel[]>('/admin/ib-levels', { signal });
    return data;
  },

  /**
   * The partner application queue.
   *
   * Rows AND per-status counts, both scoped to the reviewing admin's client
   * visibility by the API. The counts drive the tab labels, so a count computed
   * separately from the rows would promise twelve pending and show four.
   */
  async getIbApplications(
    params: {
      status?: IbApplicationStatus;
      page?: number;
      limit?: number;
      sort?: IbApplicationSortKey;
      order?: 'asc' | 'desc';
    },
    signal?: AbortSignal,
  ): Promise<IbApplicationPage> {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    // Both halves or neither. `order` alone describes an ordering of no column,
    // and the endpoint is entitled to reject it — the caller withholds `order`
    // when `sort` is absent, and this only has to not reintroduce it.
    if (params.sort) query.set('sort', params.sort);
    if (params.sort && params.order) query.set('order', params.order);
    const { data } = await apiClient.get<IbApplicationPage>(
      `/admin/ib/applications?${query.toString()}`,
      { signal },
    );
    return data;
  },

  async approveIbApplication(
    id: string,
    body: { level?: number; parentIbUserId?: string } = {},
  ): Promise<IbAccount> {
    const { data } = await apiClient.patch<IbAccount>(`/admin/ib/applications/${id}/approve`, body);
    return data;
  },

  /**
   * Reject, with a reason the API composes.
   *
   * `reason` is the configured LABEL rather than an id: the endpoint stores the
   * composed sentence, and it is that sentence the client reads. Sending an id
   * would make the stored text depend on a lookup that an operator can edit
   * afterwards, so a client and an audit record could later disagree.
   */
  async rejectIbApplication(
    id: string,
    body: { reason?: string; note?: string },
  ): Promise<IbApplication> {
    const { data } = await apiClient.patch<IbApplication>(
      `/admin/ib/applications/${id}/reject`,
      body,
    );
    return data;
  },

  /**
   * Renumber the ladder — the drag-and-drop.
   *
   * PATCH on the collection, taking every current level number in its new
   * order. One request rather than several per-level PATCHes: it renumbers
   * primary keys and moves partner placements with them, so a half-applied
   * order must not be reachable.
   */
  // ── Partners, once approved ───────────────────────────────────────────────

  async getIbPartners(
    params: {
      page?: number;
      limit?: number;
      sort?: IbPartnerSortKey;
      order?: 'asc' | 'desc';
    },
    signal?: AbortSignal,
  ): Promise<IbPartnerPage> {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    // Both halves or neither — see `getIbApplications` above.
    if (params.sort) query.set('sort', params.sort);
    if (params.sort && params.order) query.set('order', params.order);
    const { data } = await apiClient.get<IbPartnerPage>(`/admin/ib/partners?${query.toString()}`, {
      signal,
    });
    return data;
  },

  async changeIbPartnerLevel(userId: string, level: number): Promise<IbAccount> {
    const { data } = await apiClient.patch<IbAccount>(`/admin/ib/partners/${userId}/level`, {
      level,
    });
    return data;
  },

  /** `null` makes them a direct partner — it is a value, not an omission. */
  async reassignIbPartnerParent(userId: string, parentIbUserId: string | null): Promise<IbAccount> {
    const { data } = await apiClient.patch<IbAccount>(`/admin/ib/partners/${userId}/parent`, {
      parentIbUserId,
    });
    return data;
  },

  async setIbPartnerActive(userId: string, active: boolean): Promise<IbAccount> {
    const { data } = await apiClient.patch<IbAccount>(`/admin/ib/partners/${userId}/active`, {
      active,
    });
    return data;
  },

  async reorderIbLevels(order: number[]): Promise<IbLevel[]> {
    const { data } = await apiClient.patch<IbLevel[]>('/admin/ib-levels', { order });
    return data;
  },

  async createIbLevel(body: CreateIbLevel): Promise<IbLevel> {
    const { data } = await apiClient.post<IbLevel>('/admin/ib-levels', body);
    return data;
  },

  /**
   * PATCH, and `level` is not in the body: it is the primary key and partner
   * records reference it, so renumbering is a data migration rather than an
   * edit.
   *
   * Under `revenue_share` the API refuses a change that would push the enabled
   * levels past 100% between them, and its message names the current total and
   * the room left. Surface it verbatim — a generic failure throws that away.
   */
  async updateIbLevel(level: number, body: UpdateIbLevel): Promise<IbLevel> {
    const { data } = await apiClient.patch<IbLevel>(`/admin/ib-levels/${level}`, body);
    return data;
  },

  /** Refuses to empty the ladder: with no levels, no partner can be approved. */
  async deleteIbLevel(level: number): Promise<void> {
    await apiClient.delete(`/admin/ib-levels/${level}`);
  },

  async getGeneralSettings(): Promise<GeneralSettings> {
    const { data } = await apiClient.get<GeneralSettings>('/admin/settings/general');
    return data;
  },

  async updateGeneralSettings(body: UpdateGeneralSettings): Promise<GeneralSettings> {
    const { data } = await apiClient.put<GeneralSettings>('/admin/settings/general', body);
    return data;
  },

  /** Master admin only — the API answers 403 for anyone else. */
  async getSmtpSettings(): Promise<SmtpSettings> {
    const { data } = await apiClient.get<SmtpSettings>('/admin/settings/smtp');
    return data;
  },

  /**
   * Master admin only.
   *
   * `password` has three meanings and the caller must pick deliberately: OMIT it
   * (or send null) to keep the stored one, send a string to replace it, send an
   * empty string to remove it. Collapsing the first into the third is how
   * editing a port silently breaks authentication.
   */
  async updateSmtpSettings(body: UpdateSmtpSettings): Promise<SmtpSettings> {
    const { data } = await apiClient.put<SmtpSettings>('/admin/settings/smtp', body);
    return data;
  },

  /**
   * Send a test message to the signed-in admin's own address.
   *
   * There is no recipient parameter by design — a free-text one would make this
   * an authenticated open relay. A delivery failure comes back as an error
   * carrying the mail server's own message, because that is the entire point.
   */
  async sendSmtpTest(): Promise<SmtpTestResult> {
    const { data } = await apiClient.post<SmtpTestResult>('/admin/settings/smtp/test');
    return data;
  },

  async getPermissions(): Promise<Record<string, PermissionModule>> {
    const { data } = await apiClient.get<Record<string, PermissionModule>>('/admin/permissions');
    return data;
  },

  async getRoles(): Promise<Role[]> {
    const { data } = await apiClient.get<Role[]>('/admin/roles');
    return data;
  },

  async createRole(dto: CreateRoleRequest) {
    const { data } = await apiClient.post<Role>('/admin/roles', dto);
    return data;
  },

  async updateRole(id: string, dto: UpdateRoleRequest) {
    const { data } = await apiClient.put<Role>(`/admin/roles/${id}`, dto);
    return data;
  },

  async deleteRole(id: string) {
    const { data } = await apiClient.delete<{ message: string }>(`/admin/roles/${id}`);
    return data;
  },

  async getAdminUsers(): Promise<AdminUser[]> {
    const { data } = await apiClient.get<AdminUser[]>('/admin/users');
    return data;
  },

  async updateAdminUser(id: string, dto: UpdateAdminRequest) {
    const { data } = await apiClient.patch<AdminUser>(`/admin/users/${id}`, dto);
    return data;
  },

  /**
   * FR-RBAC-07's "manage" half. Its own route, not a field on updateAdminUser:
   * the API requires `users.suspend` here and `users.edit` there, deliberately.
   */
  async setAdminStatus(id: string, status: 'active' | 'suspended') {
    const { data } = await apiClient.patch<AdminUser>(`/admin/users/${id}/status`, { status });
    return data;
  },

  /**
   * Email another administrator a single-use password reset link — D-44.
   *
   * There is deliberately no self-service equivalent: self-service would make
   * an admin's mailbox the root of trust for an account that approves payouts.
   * The API refuses anyone reaching a privilege level above their own, so a 403
   * here is a real answer and not a UI bug — the button is gated client-side
   * for ergonomics only.
   */
  async sendAdminPasswordReset(id: string) {
    const { data } = await apiClient.post<{ message: string }>(
      `/admin/users/${id}/password-reset`,
      {},
    );
    return data;
  },

  /**
   * Spend a reset link. UNAUTHENTICATED — the caller cannot sign in, which is
   * the whole reason they are here, so the token IS the credential.
   */
  async completePasswordReset(token: string, password: string) {
    const { data } = await apiClient.post<{ message: string }>('/admin/password-reset/complete', {
      token,
      password,
    });
    return data;
  },

  // ── Invites (RBAC-07) ────────────────────────────────────────────────────
  /*
   * The three invite calls were the last on this surface still made as bare
   * `api.post('/admin/invite', …)` from inside the screens. That works, and it
   * is the one shape in the flow nothing checks: the request and response types
   * were written by hand next to the call, so a backend rename becomes a runtime
   * surprise rather than a compile error (API-CONTRACTS Part C).
   *
   * `validateInvite` and `acceptInvite` could not be aliased until the backend
   * routes gained `@ApiOkResponse` — they generated with no schema at all — so
   * that was fixed at the source rather than hand-declared here.
   */
  async createInvite(dto: CreateInviteRequest): Promise<CreateInviteResponse> {
    const { data } = await apiClient.post<CreateInviteResponse>('/admin/invite', dto);
    return data;
  },

  /** Unauthenticated — the invitee holds a token and nothing else. */
  async validateInvite(token: string): Promise<InviteValidation> {
    // `params`, not interpolation: the token comes off the URL bar, and a value
    // containing `&` or `#` silently arrived truncated when it was interpolated.
    const { data } = await apiClient.get<InviteValidation>('/admin/invite/validate', {
      params: { token },
    });
    return data;
  },

  async acceptInvite(token: string, password: string): Promise<AcceptInviteResponse> {
    const { data } = await apiClient.post<AcceptInviteResponse>('/admin/invite/accept', {
      token,
      password,
    });
    return data;
  },

  async getPendingInvites(): Promise<PendingInvite[]> {
    const { data } = await apiClient.get<PendingInvite[]>('/admin/invites');
    return data;
  },

  async revokeInvite(id: string) {
    const { data } = await apiClient.delete<{ message: string }>(`/admin/invites/${id}`);
    return data;
  },

  // ── Withdrawals (ADM-03 / §8.4) ───────────────────────────────────────────

  /**
   * The withdrawal queue, with per-state counts.
   *
   * `counts` groups over the FULL filtered set rather than the page, so the
   * filter bar stays correct whatever page is on screen — it is a different
   * number from `total`, which is the count of the CURRENT filter and is what
   * the pager divides into pages. `WithdrawalListResponseDto.total` is
   * unconditional here, unlike the client list's, so numbered pages need no
   * `withTotal` flag.
   *
   * Every `amount` in the response is a STRING and must reach the DOM as one —
   * §6.1. Nothing here parses it, and neither should a caller.
   */
  async getWithdrawals(
    params: WithdrawalListParams,
    signal?: AbortSignal,
  ): Promise<WithdrawalListResponse> {
    const query = new URLSearchParams({ limit: String(params.limit) });
    // Omitted rather than sent blank: `?state=` is a different request from no
    // state at all, and the API reads the empty string as a filter.
    if (params.state) query.set('state', params.state);
    if (params.page !== undefined) query.set('page', String(params.page));
    // Both halves or neither. `order` alone describes an ordering of no column,
    // and the API is entitled to reject it.
    if (params.sort) {
      query.set('sort', params.sort);
      if (params.order) query.set('order', params.order);
    }
    const { data } = await apiClient.get<WithdrawalListResponse>(
      `/admin/withdrawals?${query.toString()}`,
      { signal },
    );
    return data;
  },

  /*
   * All three writes take an idempotency KEY from the caller — R-5.2.
   *
   * It is a parameter rather than something generated here because the key must
   * express one intended action on one row: approving withdrawal X is a single
   * intent, so a double-click and a retry after a failed request are the same
   * operation and must collapse to one. A key minted inside these functions
   * would be fresh per call, which presents each click as new — the exact bug
   * the header exists to prevent.
   */
  /**
   * Put money into a client's wallet by hand.
   *
   * ⚠️ The only way funds can ARRIVE without a payment provider. Until this
   * existed a client's manual deposit sat `pending` for ever, because the API
   * had approve/reject/settle for withdrawals and no deposit action at all.
   *
   * Writes a successful DEPOSIT transaction and a ledger entry, so the credit
   * shows on the client's own statement, and emails them the amount and reason.
   *
   * `key` is not only replay protection at the HTTP layer: the server stores it
   * as the transaction's `provider_ref`, where `UNIQUE(provider, provider_ref)`
   * enforces it — so a double-submitted form converges on ONE credit in the
   * database. Pass a value that identifies the INTENT, not the attempt.
   */
  async creditWallet(
    body: { userId: string; amount: string; currency: string; reason: string },
    key: string,
  ): Promise<{ transaction: Transaction; replayed: boolean }> {
    const { data } = await apiClient.post<{ transaction: Transaction; replayed: boolean }>(
      '/admin/wallets/credit',
      body,
      idempotent(key),
    );
    return data;
  },

  /**
   * Open a wallet for a client in a currency they do not hold one in.
   *
   * Idempotent server-side — opening one that exists returns it — so a
   * double-press is a no-op rather than an error. `wallets.manage`, which is a
   * different key from `wallets.credit`: this creates an empty container and
   * moves no money.
   */
  /**
   * The commission ledger — every accrual, filterable.
   *
   * ⚠️ Nothing read `ib_accruals` before this: the engine wrote a row on every
   * settled deposit and no screen, endpoint or export ever read one back, so
   * "what do we owe our partners" could only be answered from the database.
   *
   * `totals` is summed by the SERVER across the whole filtered set. Adding a
   * page of decimal strings in the browser would be both the wrong number (one
   * page) and the wrong arithmetic (floats).
   */
  async getIbAccruals(
    params: {
      page?: number;
      limit?: number;
      ibUserId?: string;
      clientUserId?: string;
      status?: string;
      sort?: IbAccrualSortKey;
      order?: 'asc' | 'desc';
    },
    signal?: AbortSignal,
  ): Promise<IbAccrualPage> {
    const { data } = await apiClient.get<IbAccrualPage>('/admin/ib/accruals', { params, signal });
    return data;
  },

  async openWallet(body: { userId: string; currency: string }): Promise<WalletRow> {
    const { data } = await apiClient.post<WalletRow>('/admin/wallets', body);
    return data;
  },

  /**
   * Close an EMPTY, UNUSED wallet.
   *
   * Refused with a readable reason if it holds a balance, has funds on hold, or
   * has any ledger entry, transaction or transfer against it — a wallet is the
   * anchor its history points at. Callers should surface the API's own message
   * rather than a generic one: it names the figure or the count, which is the
   * part the operator can act on.
   */
  async closeWallet(id: string): Promise<void> {
    await apiClient.delete(`/admin/wallets/${id}`);
  },

  async approveWithdrawal(id: string, key: string): Promise<WithdrawalRow> {
    const { data } = await apiClient.patch<WithdrawalRow>(
      `/admin/withdrawals/${id}/approve`,
      {},
      idempotent(key),
    );
    return data;
  },

  /**
   * Reject, releasing the hold and emailing the client.
   *
   * `reasonId` names a configured reason and `reason` is a free-text note; the
   * API accepts either or both, and the screen requires at least one — a
   * rejection the client cannot understand is one they will simply resubmit.
   */
  async rejectWithdrawal(
    id: string,
    body: { reasonId?: string; reason?: string },
    key: string,
  ): Promise<WithdrawalRow> {
    const { data } = await apiClient.patch<WithdrawalRow>(
      `/admin/withdrawals/${id}/reject`,
      body,
      idempotent(key),
    );
    return data;
  },

  /**
   * Mark an approved withdrawal paid — posts the debit and clears the hold.
   *
   * `withdrawals.settle`, deliberately separate from `withdrawals.approve` so
   * the two steps can be granted to different people (separation of duties,
   * R-5.4). `providerRef` is required: it is the only link between our ledger
   * entry and the payment the provider actually made, and reconciliation has
   * nothing to match on without it.
   */
  async settleWithdrawal(id: string, providerRef: string, key: string): Promise<WithdrawalRow> {
    const { data } = await apiClient.patch<WithdrawalRow>(
      `/admin/withdrawals/${id}/settle`,
      { providerRef },
      idempotent(key),
    );
    return data;
  },

  /**
   * The append-only ledger, filterable for reconciliation.
   *
   * Requires `withdrawals.view`. Amounts and running balances are strings, and
   * a correction is a new compensating entry — there is no update or delete
   * here because there is none in the database either (§6.4).
   */
  async getLedger(
    params: {
      userId?: string;
      walletId?: string;
      entryType?: string;
      page?: number;
      limit?: number;
      cursor?: string;
    },
    signal?: AbortSignal,
  ): Promise<LedgerListResponse> {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') query.set(key, String(value));
    }
    const { data } = await apiClient.get<LedgerListResponse>(`/admin/ledger?${query.toString()}`, {
      signal,
    });
    return data;
  },

  /**
   * Run the §12.2 reconciliation now and return its report.
   *
   * MASTER ADMIN ONLY, and deliberately not filterable: a reconciliation that
   * reports "balanced" over a subset of clients is the opposite of what a
   * reconciliation is for. See the backend controller.
   *
   * Read-only. A discrepancy is REPORTED, never repaired — an automatic
   * correction would write a compensating entry for a cause nobody diagnosed,
   * turning a detectable problem into a permanent one that looks deliberate.
   */
  async getReconciliation(signal?: AbortSignal): Promise<ReconciliationReport> {
    const { data } = await apiClient.get<ReconciliationReport>('/admin/reconciliation', { signal });
    return data;
  },

  // ── API keys (master admin only) ──────────────────────────────────────────

  async listApiKeys(signal?: AbortSignal): Promise<ApiKey[]> {
    const { data } = await apiClient.get<ApiKey[]>('/admin/api-keys', { signal });
    return data;
  },

  /**
   * Issue a key. The `plaintext` in the response is the ONLY copy that will
   * ever exist — only a hash is stored, so it cannot be shown again.
   *
   * The caller MUST surface it immediately. Dropping it on the floor means the
   * operator has to revoke the key and issue another.
   */
  async createApiKey(body: {
    name: string;
    permissions: string[];
    expiresAt: string | null;
  }): Promise<IssuedApiKey> {
    const { data } = await apiClient.post<IssuedApiKey>('/admin/api-keys', body);
    return data;
  },

  /** Revoke. Immediate — the guard reads `revoked_at` on every request. */
  async revokeApiKey(id: string): Promise<ApiKey> {
    const { data } = await apiClient.delete<ApiKey>(`/admin/api-keys/${id}`);
    return data;
  },

  // ── Holdings: wallets and trading accounts ────────────────────────────────

  /**
   * Every client wallet, with its owner.
   *
   * `balance` and `onHold` are NUMERIC(28,8) and cross the boundary as STRINGS.
   * Nothing here coerces them and nothing downstream should: `Number()` on a
   * value of that width loses precision before formatting even starts (§6.1).
   * That is also why `sort=balance` is worth having — the ordering happens on
   * the SQL column, so "the largest balance" is the largest of all of them
   * rather than the largest of the twenty-five on screen.
   *
   * `withTotal` is sent unconditionally, because numbered pages cannot be drawn
   * without a count. The endpoint also serves `?cursor=` and R-2.4's
   * concurrent-insert hazard is real on any growing list — but a cursor cannot
   * express "page 7", and it encodes the ordering that minted it, so offering
   * both the sort and a cursor is not possible. Same trade as the client list.
   */
  async getWallets(params: WalletListParams, signal?: AbortSignal): Promise<WalletListResponse> {
    const query = new URLSearchParams({ limit: String(params.limit), withTotal: 'true' });
    if (params.page !== undefined) query.set('page', String(params.page));
    // Omitted rather than sent blank: `?currency=` is a different request from
    // no currency at all, and the API reads the empty string as a filter.
    if (params.userId) query.set('userId', params.userId);
    if (params.currency) query.set('currency', params.currency);
    // Both halves or neither. `order` alone describes an ordering of no column.
    if (params.sort) {
      query.set('sort', params.sort);
      if (params.order) query.set('order', params.order);
    }
    const { data } = await apiClient.get<WalletListResponse>(`/admin/wallets?${query.toString()}`, {
      signal,
    });
    return data;
  },

  /**
   * Every client trading account, with its owner.
   *
   * `balance` is a STRING for the same reason as a wallet's, and is CRM-owned
   * until the MT5 bridge lands. `login` is NULL until MetaTrader issues one and
   * is a string rather than a number because leading zeros are significant to
   * the bridge — so it is rendered, never parsed.
   */
  async getTradingAccounts(
    params: TradingAccountListParams,
    signal?: AbortSignal,
  ): Promise<TradingAccountListResponse> {
    const query = new URLSearchParams({ limit: String(params.limit), withTotal: 'true' });
    if (params.page !== undefined) query.set('page', String(params.page));
    if (params.userId) query.set('userId', params.userId);
    if (params.environment) query.set('environment', params.environment);
    if (params.status) query.set('status', params.status);
    if (params.sort) {
      query.set('sort', params.sort);
      if (params.order) query.set('order', params.order);
    }
    const { data } = await apiClient.get<TradingAccountListResponse>(
      `/admin/trading-accounts?${query.toString()}`,
      { signal },
    );
    return data;
  },

  // ── Payment methods ───────────────────────────────────────────────────────

  /**
   * Every configured method, including disabled and half-configured ones.
   *
   * Unlike the portal's list, which returns only what a client may actually
   * use: managing them is the point of this screen, and a method you cannot see
   * is one you cannot finish setting up. A method with no `payTo` is NOT
   * offered to clients — the screen flags that, because it is otherwise
   * invisible until somebody asks why nobody is depositing.
   */
  async getPaymentMethods(signal?: AbortSignal): Promise<PaymentMethod[]> {
    const { data } = await apiClient.get<PaymentMethod[]>('/admin/payment-methods', { signal });
    return data;
  },

  async createPaymentMethod(body: CreatePaymentMethod): Promise<PaymentMethod> {
    const { data } = await apiClient.post<PaymentMethod>('/admin/payment-methods', body);
    return data;
  },

  /**
   * PATCH, and `key` is absent from the body: it is the stable machine key that
   * stored transactions reference, so renaming it would orphan their provider
   * history rather than edit a label. `name` is the field an operator changes.
   */
  /**
   * Upload a logo and get back a URL to save on the method.
   *
   * Returns the URL only — it does NOT write it to the method. The operator is
   * still editing a form they may cancel, and an upload that mutated the row
   * would change what every client sees before Save was pressed.
   *
   * ## `Content-Type` must be UNSET, and unsetting it takes an explicit
   * `undefined`
   *
   * `apiClient` is created with a blanket `headers: { 'Content-Type':
   * 'application/json' }` — right for every other call in this file, and fatal
   * for this one. A multipart body needs a `boundary` token in its content type
   * and only the browser can generate it, so with the JSON header inherited the
   * request arrives with no boundary, Multer parses no parts, and the endpoint
   * answers "No file was uploaded" for a request that plainly carried one.
   *
   * Passing `undefined` DELETES the inherited header rather than overriding it
   * with an empty string; axios then inspects the `FormData` body and fills in
   * `multipart/form-data; boundary=…` itself.
   */
  async uploadPaymentMethodLogo(file: File): Promise<{ logoUrl: string }> {
    const form = new FormData();
    form.append('file', file);
    const { data } = await apiClient.post<{ logoUrl: string }>(
      '/admin/payment-methods/logo',
      form,
      { headers: { 'Content-Type': undefined } },
    );
    return data;
  },

  async updatePaymentMethod(key: string, body: UpdatePaymentMethod): Promise<PaymentMethod> {
    const { data } = await apiClient.patch<PaymentMethod>(`/admin/payment-methods/${key}`, body);
    return data;
  },

  /*
   * `deletePaymentMethod` is GONE, along with the endpoint behind it.
   *
   * `transactions.method_key` is a RESTRICT foreign key, so deleting only ever
   * succeeded for a method nobody had used and threw a conflict on every method
   * that mattered — a control whose working case was the uninteresting one.
   *
   * Disabling is what it was reached for: `updatePaymentMethod(key, { enabled:
   * false })` removes the method from the client portal immediately and the API
   * refuses new deposits through it, while every historical transaction keeps a
   * readable method name instead of pointing at a row that no longer exists.
   */

  async getRejectionReasons(context: RejectionContext): Promise<RejectionReason[]> {
    const { data } = await apiClient.get<RejectionReason[]>(
      `/admin/rejection-reasons?context=${context}`,
    );
    return data;
  },

  // ── Clients (ADM-01) ──────────────────────────────────────────────────────
  //
  // These moved out of `clients/page.tsx`, which called `api.get()` inline and
  // built its own query string — alone among the features here. With four new
  // parameters and a sort contract to keep in step with the backend allowlist,
  // an inline call means the page pays for it in its own line budget and no
  // type alias governs the params (R-1.1).

  async getClients(params: ClientListParams, signal?: AbortSignal): Promise<ClientListResponse> {
    const { data } = await apiClient.get<ClientListResponse>(
      `/admin/clients?${clientListSearchParams(params).toString()}`,
      { signal },
    );
    return data;
  },

  async getClient(id: string, signal?: AbortSignal): Promise<ClientProfile> {
    const { data } = await apiClient.get<ClientProfile>(`/admin/clients/${id}`, { signal });
    return data;
  },

  async setClientStatus(id: string, status: 'active' | 'suspended') {
    const { data } = await apiClient.patch<ClientRow>(`/admin/clients/${id}/status`, { status });
    return data;
  },

  // ── Client tags (ADM-14) ──────────────────────────────────────────────────

  async getTags(signal?: AbortSignal): Promise<ClientTagWithCount[]> {
    const { data } = await apiClient.get<ClientTagWithCount[]>('/admin/tags', { signal });
    return data;
  },

  async createTag(dto: { label: string; color?: string; description?: string }) {
    const { data } = await apiClient.post<ClientTag>('/admin/tags', dto);
    return data;
  },

  async updateTag(id: string, dto: { label?: string; color?: string; description?: string }) {
    const { data } = await apiClient.patch<ClientTag>(`/admin/tags/${id}`, dto);
    return data;
  },

  async deleteTag(id: string) {
    const { data } = await apiClient.delete<{ message: string }>(`/admin/tags/${id}`);
    return data;
  },

  async getClientTags(clientId: string, signal?: AbortSignal): Promise<ClientTag[]> {
    const { data } = await apiClient.get<ClientTag[]>(`/admin/clients/${clientId}/tags`, {
      signal,
    });
    return data;
  },

  /*
   * Single-tag add and remove, NOT a whole-set replace.
   *
   * A replace is last-writer-wins: two administrators tagging the same client
   * seconds apart silently discard one another's work, and the composite
   * primary key cannot catch it because the second request is a legitimately
   * different write. Both of these are idempotent by construction.
   */
  async assignTag(clientId: string, tagId: string): Promise<ClientTag[]> {
    const { data } = await apiClient.post<ClientTag[]>(`/admin/clients/${clientId}/tags/${tagId}`);
    return data;
  },

  async unassignTag(clientId: string, tagId: string): Promise<ClientTag[]> {
    const { data } = await apiClient.delete<ClientTag[]>(
      `/admin/clients/${clientId}/tags/${tagId}`,
    );
    return data;
  },

  /**
   * The action vocabulary the audit filter is built from.
   *
   * Fetched, never hardcoded. The screen carried a list of EIGHT while the
   * system recorded thirty-four, so every action added because it had
   * previously gone unrecorded was ALSO unfilterable — which is to say exactly
   * the ones somebody would come looking for. Same rule as the permission and
   * client-field catalogs (R-4.5): the frontend never invents a key.
   */
  // ── Dashboard statistics ──────────────────────────────────────────────────

  /**
   * The headline counters, in ONE request covering four permission domains.
   *
   * Every section is optional and comes back only for an admin who holds its
   * key — `sections` lists what actually arrived, so the dashboard reads that
   * list rather than probing for `undefined`. A caller with none of the four
   * still gets a 200 with an empty `sections`, not a 403: the endpoint itself
   * is open to any admin, and it is the CONTENT that is gated. That is what
   * lets one screen serve every role without a card that always fails.
   *
   * `scoped` says the numbers cover only this admin's own clients. A headline
   * total shown to a scoped admin without saying so invites it to be read as a
   * platform total, so the screen must surface it.
   */
  async getStatsOverview(signal?: AbortSignal): Promise<StatsOverview> {
    const { data } = await apiClient.get<StatsOverview>('/admin/stats/overview', { signal });
    return data;
  },

  /**
   * Registrations per day, zero-filled across the whole window.
   *
   * The zero-fill is the point: a series carrying only the days that had
   * registrations draws the gaps closed, so an outage renders as steady growth.
   */
  async getRegistrationSeries(
    days: StatsWindow,
    signal?: AbortSignal,
  ): Promise<RegistrationSeries> {
    const query = new URLSearchParams({ days: String(days) });
    const { data } = await apiClient.get<RegistrationSeries>(
      `/admin/stats/registrations?${query.toString()}`,
      { signal },
    );
    return data;
  },

  /**
   * KYC submissions and approvals per day.
   *
   * The two series bucket on DIFFERENT columns — `submitted_at` and
   * `reviewed_at` — so a submission made Monday and approved Thursday counts
   * once in each, on its own day. They are therefore not a funnel over one
   * cohort and must not be stacked; two lines on one axis is the honest form.
   */
  async getKycTrend(days: StatsWindow, signal?: AbortSignal): Promise<KycTrendSeries> {
    const query = new URLSearchParams({ days: String(days) });
    const { data } = await apiClient.get<KycTrendSeries>(
      `/admin/stats/kyc-trend?${query.toString()}`,
      { signal },
    );
    return data;
  },

  /**
   * Withdrawal amount and count per day, bucketed on when each was REQUESTED.
   *
   * `totalAmount` is a string summed by Postgres over NUMERIC(28,8) — never
   * parsed on the way here, and only ever parsed at a chart's plotting
   * boundary. Requested rather than settled, because that is the only date a
   * pending or rejected withdrawal has.
   */
  async getWithdrawalVolume(
    days: StatsWindow,
    signal?: AbortSignal,
  ): Promise<WithdrawalVolumeSeries> {
    const query = new URLSearchParams({ days: String(days) });
    const { data } = await apiClient.get<WithdrawalVolumeSeries>(
      `/admin/stats/withdrawal-volume?${query.toString()}`,
      { signal },
    );
    return data;
  },

  async getAuditActions(signal?: AbortSignal): Promise<AuditAction[]> {
    const { data } = await apiClient.get<AuditAction[]>('/admin/audit-log/actions', { signal });
    return data;
  },

  /**
   * The RBAC-03 field catalog.
   *
   * Fetched, never a frontend constant — the same rule as the permission
   * catalog (R-4.5). A mask key with no backend counterpart is not a cosmetic
   * bug: it is a field an operator ticked a box for and believes they hid.
   */
  async getClientFields(signal?: AbortSignal): Promise<Record<string, ClientFieldGroup>> {
    const { data } = await apiClient.get<Record<string, ClientFieldGroup>>('/admin/client-fields', {
      signal,
    });
    return data;
  },
};
