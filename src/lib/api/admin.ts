import { apiClient, idempotent } from './client';
import type { components, operations } from './types.gen';

/**
 * The sort keys an endpoint ACTUALLY accepts, read off the generated contract.
 *
 * Every list controller publishes its allowlist to OpenAPI
 * (`@ApiQuery({ name: 'sort', enum: Object.keys(X_SORT_COLUMNS) })`), so the
 * truth has always been in `types.gen.ts`. The `*_SORT_KEYS` arrays below were
 * hand-written beside it anyway, and one of them drifted:
 * `CLIENT_SORT_KEYS` gained `'type'`, which no backend allowlist has ever
 * contained. `sortableBy` is typed against that hand-written list, so the
 * console offered a sortable "Type" header, the API answered R-2.5's 400
 * ("Cannot sort clients by \"type\". Allowed: …"), and the whole table was
 * replaced by an error card. Reported from the running app.
 *
 * `IB_PARTNER_SORT_KEYS` had the same drift, latent — and then drifted BACK,
 * which is the better argument for this mechanism than the first pass was.
 * 0102 replaced the rung with a named programme, so `level` was wrong; 0112
 * replaced programmes with levels again, so `programName` became wrong in its
 * turn. A hand-kept list loses that race every time; a list bound to the
 * generated contract is simply a compile error on the day the schema moves.
 *
 * Each array is now `satisfies readonly SortKeysOf<Operation>[]`, which
 * catches the DANGEROUS direction — offering a key the API refuses — while
 * still allowing a list to omit one the API would accept, because a table is
 * entitled not to offer a sort it has no column for.
 */
type SortKeysOf<Op extends keyof operations> = operations[Op] extends {
  parameters: { query?: infer Q };
}
  ? Q extends { sort?: infer S }
    ? NonNullable<S>
    : never
  : never;

// Types are ALIASES of the schemas generated from the backend's Swagger
// (npm run gen:api-types, with the backend running). Never hand-write an
// interface for an API request OR response — regenerate instead; drift then
// becomes a compile error (docs/API-CONTRACTS.md Part C).
/**
 * A client, by Portal ID — their one id since backend 0159. A number from the
 * API, or its digits from a URL (`/clients/1000245`). A URL or query string
 * takes either; a JSON body takes a NUMBER (the DTOs validate `@IsInt()`), so
 * every function below that puts a client into a body sends `Number(ref)`.
 */
export type ClientRef = number | string;

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
/** A client's identity record: document versions with their status, and every decision. */
export type ClientIdentityRecord = components['schemas']['ClientIdentityRecordDto'];
/**
 * What an edit answers with: the account fields, without the profile screen's
 * tags, KYC and trading accounts. A separate DTO on the API for exactly that
 * reason — see `ClientAccountDto` there.
 */
export type ClientAccount = components['schemas']['ClientAccountDto'];
export type ClientTag = components['schemas']['ClientTagDto'];
/** What adding or removing a tag answers — the tags afterwards, and whether you still see the client. */
export type ClientTagChangeResult = components['schemas']['ClientTagChangeResultDto'];
export type ClientTagWithCount = components['schemas']['ClientTagWithCountDto'];
export type ClientFieldGroup = components['schemas']['ClientFieldGroupDto'];
export type Currency = components['schemas']['CurrencyDto'];

/**
 * A rung on the leverage ladder — `ratio` is the identity, 500 meaning 500:1.
 *
 * Operator data with its own table since backend migration 0067; it was a CSV
 * on the trading-settings row before that, which had nowhere to say a rung had
 * been WITHDRAWN as distinct from never offered.
 */
export type Leverage = components['schemas']['LeverageDto'];
export type CreateLeverage = components['schemas']['CreateLeverageDto'];
export type UpdateLeverage = components['schemas']['UpdateLeverageDto'];

/**
 * A link the operator puts on the client portal's sidebar — an economic
 * calendar, a help centre, a Telegram channel.
 *
 * `id` is a SURROGATE, unlike `Leverage.ratio` and `Currency.code`. A link has
 * no natural key: two entries may legitimately share a title, and the URL is
 * the field edited most often — keying on either would turn a typo correction
 * into a delete-and-recreate, taking the row's position with it.
 *
 * This is the ADMIN shape and it carries `enabled`. The portal receives
 * `ClientExternalLinkDto`, which does not: every row it gets is enabled, and a
 * client has no use for knowing which links are switched off.
 */
export type ExternalLink = components['schemas']['ExternalLinkDto'];
export type CreateExternalLink = components['schemas']['CreateExternalLinkDto'];
export type UpdateExternalLink = components['schemas']['UpdateExternalLinkDto'];
/**
 * One RUNG of the partner tree, and the terms of everybody standing on it.
 *
 * `IbProgram` used to sit here: a named card assigned to a partner, keyed on
 * DEPTH — how many hops the trade sat below the earner — so the same partner
 * was paid differently on their own clients than on a sub-partner's. 0112
 * replaced it with this, which is keyed on the earner's own POSITION: level 1
 * deals with the broker directly, and a partner they recruit is level 2.
 *
 * The three programme "modes" went with it. They were a label describing which
 * of two numbers were set, and the numbers say that themselves: a rung with a
 * zero commission pays no partner, one with a zero rebate returns nothing to
 * the client, one with both pays both.
 */
export type IbLevel = components['schemas']['IbLevelDto'];

/**
 * The bounds a level must fit inside — `GET /admin/ib-levels/limits`.
 *
 * READ rather than assumed. `maxLevels` is `IB_MAX_LEVELS`, a deployment
 * setting defaulting to 2 (the committed two-level structure, Feature List Rev
 * 9 IB-17). A hardcoded copy here would drift the day a broker negotiates a
 * third level: the form would keep refusing at two while the API accepted
 * three, which is the console-versus-engine disagreement the setting exists to
 * end.
 */
export type IbLevelLimits = components['schemas']['IbLevelLimitsDto'];

/**
 * A COMMISSION TYPE — the rate card a product is sold on (0140).
 *
 * Money per standard lot for the partners' commission and for the client's
 * rebate. A product points at one; each level of the ladder takes a percentage
 * of it. `productNames` is on the row so a delete or a disable can be refused
 * on the screen before the API refuses it.
 */
/**
 * One MT5 group as the sync job last mirrored it — `GET /admin/mt5-groups`.
 * Read from the local mirror, not the bridge, so it answers when MT5 is down;
 * `lastSeenAt` is how recently the server confirmed it.
 */
export type Mt5GroupRow = components['schemas']['Mt5GroupDto'];
/** An MT5 login as the link screen reads it — MT5's account, holder, options. */
export type Mt5AccountLookup = components['schemas']['Mt5AccountLookupDto'];
export type LinkedMt5Account = components['schemas']['LinkedMt5AccountDto'];

export type IbCommissionType = components['schemas']['IbCommissionTypeDto'];
export type CreateIbCommissionType = components['schemas']['CreateIbCommissionTypeDto'];
export type UpdateIbCommissionType = components['schemas']['UpdateIbCommissionTypeDto'];
export type CreateIbLevel = components['schemas']['CreateIbLevelDto'];
export type UpdateIbLevel = components['schemas']['UpdateIbLevelDto'];
export type IbApplication = components['schemas']['IbApplicationDto'];
export type IbApplicationStatus = IbApplication['status'];
export type IbAccount = components['schemas']['IbAccountDto'];

/**
 * One partner's standing — `GET /admin/ib/partners/:userId`.
 *
 * ⚠️ The API answers `null` for a client who is not a partner, and the generated
 * type CANNOT say so: Nest describes the response by its DTO regardless of the
 * nullable return. Every caller must null-check, and `getPartnerDetail` widens
 * the type to make that unavoidable rather than merely advisable.
 */
export type IbPartnerDetail = components['schemas']['IbPartnerDetailDto'];
/** One currency's commission — a partner's earnings are a LIST of these. */
export type IbPartnerEarnings = components['schemas']['IbPartnerEarningsDto'];
export type IbSubPartnerRow = components['schemas']['IbSubPartnerRowDto'];

export type ClientClosedPositionsPage = components['schemas']['ClientClosedPositionsPageDto'];
export type ClientClosedPositionRow = components['schemas']['ClientClosedPositionRowDto'];

/**
 * The queue page. Hand-declared: the endpoint returns rows joined to their
 * applicant plus per-status counts, and Nest describes that shape as a bare
 * object because the handler returns a store result rather than a DTO class.
 *
 * REPLACE THIS with an alias once `AdminIbController.list` declares an
 * `@ApiOkResponse` DTO — this is the gap, named so it gets closed.
 */
/**
 * The partner DIRECTORY — `GET /admin/ib/partners`. An alias since the route
 * declared `IbPartnerListResponseDto` (25 Sep 2026).
 *
 * It was hand-declared, and the hand-written copy was wrong in three places at
 * once: it claimed a top-level `level` the response never carried, typed
 * `account` as the portal's `IbAccountDto` (with `agencyName` and `products`,
 * which this route does not send), and had no `parentPortalId` at all. That is
 * the failure the generated types exist to remove — a hand copy compiles
 * against what somebody believed, not against what arrives.
 *
 * `earnings` is one entry PER CURRENCY, never a total.
 */
export type IbPartnerPage = components['schemas']['IbPartnerListResponseDto'];
export type IbPartnerRow = components['schemas']['IbPartnerRowDto'];

export interface IbApplicationPage {
  rows: Array<{
    application: IbApplication;
    user: {
      id: string;
      /** The applicant's Portal ID — the identifier the console prints. */
      portalId: number;
      email: string;
      firstName: string;
      lastName: string;
      verificationLevel: number;
    };
    /**
     * The programme applied for, by name. Null when the applicant named none.
     *
     * The reviewer needs it before deciding: approving GRANTS this agency, and
     * an approval made without seeing which one is made blind.
     */
    agencyName: string | null;
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

/*
 * ── The Financial page: every money movement, platform-wide ────────────────
 *
 * NOT named `Transaction` — that alias (further down) is the client-profile
 * transaction row from `TransactionDto`, a different shape from a different
 * endpoint. These are `GET /admin/transactions`, the union of payments,
 * wallet ⇄ account transfers and commission transfers.
 */
export type TransactionRow = components['schemas']['AdminTransactionRowDto'];
/** The profile's Documents tab — KYC versions and deposit receipts, each with its status. */
export type ClientDocument = components['schemas']['ClientDocumentDto'];
export type ClientDocumentList = components['schemas']['ClientDocumentListDto'];
/** What a deposit decision answers with — the row as it now stands. */
export type DepositDecision = components['schemas']['DepositDecisionDto'];
export type TransferRow = components['schemas']['TransferDto'];
/** "Mark resolved" on a payment only a person could settle — the flag, cleared. */
export type AttentionResolved = components['schemas']['AttentionResolvedDto'];
export type StuckTransfers = components['schemas']['StuckTransfersDto'];
export type TransactionListResponse = components['schemas']['AdminTransactionListResponseDto'];
export type TransactionsSummary = components['schemas']['AdminTransactionsSummaryDto'];
export type TransactionSummaryRow = components['schemas']['AdminTransactionSummaryRowDto'];
/**
 * All three read off the row, not written out — a value added on the backend
 * reaches the badge maps as a missing-key compile error rather than rendering
 * as a raw enum string (the `WithdrawalState` rule).
 */
export type TransactionDirection = TransactionRow['direction'];
export type TransactionKind = TransactionRow['kind'];
export type TransactionState = TransactionRow['state'];

/*
 * The MT5 bridge's own internals. Aliased from the generated schema like
 * everything else, so a field renamed in the backend DTO breaks the build here
 * rather than rendering `undefined` on a diagnostics screen — which is the one
 * screen where a silently wrong value is worst, because it is consulted
 * precisely when something is already wrong.
 */
export type BridgeOutbox = components['schemas']['BridgeOutboxDto'];
export type BridgeOperations = components['schemas']['BridgeOperationsDto'];
export type BridgeLogs = components['schemas']['BridgeLogsDto'];
export type WalletDiscrepancy = components['schemas']['WalletDiscrepancyDto'];
export type ApiKey = components['schemas']['ApiKeyDto'];
/** The create response — the ONLY moment `plaintext` is ever populated. */
export type IssuedApiKey = components['schemas']['IssuedApiKeyDto'];
/** The console's shape: the method plus `keyRenamable` and `inUse`. */
export type PaymentMethod = components['schemas']['AdminPaymentMethodDto'];
/** One detail an offline method asks the client for — hidden ones included (backend 0163). */
export type PaymentMethodProofField = components['schemas']['ProofFieldDto'];
/** One answer a client filed with an offline deposit, with the question as asked. */
export type ProofDetail = components['schemas']['ProofDetailDto'];
export type CreatePaymentMethod = components['schemas']['CreatePaymentMethodDto'];
export type UpdatePaymentMethod = components['schemas']['UpdatePaymentMethodDto'];
/**
 * A payout rail clients may withdraw through — `withdrawal_payment_methods`,
 * disabled ones included. The deposit list's twin, managed separately because a
 * rail can take money in and not pay out, or the reverse.
 */
export type WithdrawalMethod = components['schemas']['AdminWithdrawalMethodDto'];
export type CreateWithdrawalMethod = components['schemas']['CreateWithdrawalMethodDto'];
/**
 * A payment provider (backend 0168): the desk (`manual`, built in), Rival, and
 * each one after them — its state, declared settings, channels and the methods
 * on them. Secrets never come back; a setting says only `isSet`.
 */
export type PaymentProvider = components['schemas']['PaymentProviderDto'];
export type PaymentProviderSetting = components['schemas']['ProviderSettingDto'];
export type PaymentProviderChannel = components['schemas']['ProviderChannelDto'];
export type PaymentProviderMethod = components['schemas']['ProviderMethodDto'];
export type UpdatePaymentProvider = components['schemas']['UpdatePaymentProviderDto'];
export type PaymentProviderEvent = components['schemas']['ProviderEventDto'];
export type PaymentProviderTestResult = components['schemas']['ProviderTestResultDto'];
/** The one response that carries a generated secret in plaintext. */
export type RotatedProviderSecret = components['schemas']['RotatedProviderSecretDto'];
export type UpdateWithdrawalMethod = components['schemas']['UpdateWithdrawalMethodDto'];
/*
 * `PaymentMethodKind` is GONE, with the column behind it (migration 0043).
 *
 * It read `manual | gateway | crypto` and claimed to be the deposit FLOW. It was
 * really a fact about the backend's own integrations, and this console asked an
 * operator to pick it from a dropdown — a question about our code, put to
 * somebody who cannot answer it and whose wrong answer routed clients down the
 * wrong deposit path. The server derives the flow from the key now.
 */

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
  /*
   * NOT 'type'. It was here, and the API has never accepted it: a client's
   * type is DERIVED (`DERIVED_CLIENT_TYPE` — a CASE over `ib_accounts` and
   * `referred_by_ib_user_id`), because `users.type` is a label nothing
   * maintains. An expression reading another table cannot be indexed, so the
   * backend does not offer it as an ordering, and clicking the Type header
   * replaced the whole table with R-2.5's 400. Filtering by type is offered
   * and answers the same question.
   */
  'verificationLevel',
  'country',
] as const satisfies readonly SortKeysOf<'AdminClientsController_listClients'>[];
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
  /**
   * Everyone one partner introduced — the client id of the REFERRER.
   *
   * An id rather than a slug, unlike `tag`, because a client has no stable
   * human-readable handle to name them by; the id is the only thing that
   * cannot change under a saved link.
   *
   * This exists because the profile's Network tab is CAPPED at 50 and the
   * constant's own justification says "the full book stays reachable through
   * the client list filtered by referrer" — a filter that did not exist until
   * now, which made a partner's other clients unreachable anywhere in the
   * product. Same shape as `tag`, which has had its click-into-the-filtered-list
   * path since ADM-14.
   *
   * ⚠️ SCOPED, and deliberately unlike the COUNT beside it. This list obeys the
   * reader's territory like every other filter, while `referredTotal` on the
   * profile is counted unscoped on purpose — so a scoped admin can legitimately
   * see "50 of 213" and then a filtered list holding 60. That is correct and
   * looks like a bug; `UsersStore.countReferredBy` records why.
   */
  referredBy?: string;
  /**
   * `'true'`: only clients a partner introduced — the Referrals page, which is
   * this list with that one filter fixed. `'false'`: only clients nobody did.
   * The API refuses any other value with a 400.
   */
  referred?: 'true' | 'false';
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
] as const satisfies readonly SortKeysOf<'AdminMoneyController_listWithdrawals'>[];
export type WithdrawalSortKey = (typeof WITHDRAWAL_SORT_KEYS)[number];

export interface WithdrawalListParams {
  /** One withdrawal, in any state — what a notification opens. */
  id?: string;
  state?: string;
  /** Client email or name. Server-side — see `listForAdmin`'s note on scope. */
  q?: string;
  limit: number;
  page?: number;
  sort?: WithdrawalSortKey;
  order?: 'asc' | 'desc';
}

/**
 * The runtime value lists for the Financial page's filters, derived-checked
 * against the generated unions by `satisfies` (the `CLIENT_KYC_STATUSES`
 * pattern) — a value added on the backend fails to compile here rather than
 * quietly missing from a dropdown.
 */
export const TRANSACTION_DIRECTIONS = [
  'deposit',
  'withdrawal',
] as const satisfies readonly TransactionDirection[];

export const TRANSACTION_KINDS = [
  'payment',
  'transfer',
  'commission_transfer',
] as const satisfies readonly TransactionKind[];

/**
 * In lifecycle order, like the withdrawal desk's tabs. `approved` and
 * `rejected` only ever occur on payment-kind withdrawals — transfers map to
 * pending/success/failure — so labels must not promise them for transfers.
 */
export const TRANSACTION_STATES = [
  'pending',
  'approved',
  'success',
  'failure',
  'rejected',
] as const satisfies readonly TransactionState[];

/**
 * The columns `GET /admin/transactions` will sort by, mirroring the backend's
 * `ADMIN_TRANSACTION_SORT_COLUMNS`. Deliberately fewer than the withdrawal
 * queue's: the union cannot serve a joined-column sort from its per-arm
 * indexes, so `userEmail` is not offered (R-2.5 — the allowlist may not
 * exceed the indexes, and an undeclared key would be a 400, not a fallback).
 */
export const TRANSACTION_SORT_KEYS = [
  'createdAt',
  'amount',
  'state',
] as const satisfies readonly SortKeysOf<'AdminFinancialController_listTransactions'>[];
export type TransactionSortKey = (typeof TRANSACTION_SORT_KEYS)[number];

export interface TransactionListParams {
  /** One movement (a transaction's or a transfer's id), in any state — what a notification opens. */
  id?: string;
  direction?: TransactionDirection;
  kind?: TransactionKind;
  state?: TransactionState;
  /** Narrow to one client, by Portal ID. */
  userId?: ClientRef;
  currency?: string;
  /** Client email or name. Server-side, same columns as every other queue. */
  q?: string;
  /** Inclusive date bounds, `YYYY-MM-DD`. */
  from?: string;
  to?: string;
  /** Only payments flagged for a person to reconcile — the API's one value. */
  attention?: 'true';
  /**
   * Only movements a person decides (backend 0168): deposits paid outside the
   * platform, and every withdrawal. The deposits desk's list.
   */
  decidedBy?: 'desk';
  limit: number;
  page?: number;
  sort?: TransactionSortKey;
  order?: 'asc' | 'desc';
}

/** The summary shares the list's filters minus paging and sort. */
export type TransactionsSummaryParams = Omit<
  TransactionListParams,
  'limit' | 'page' | 'sort' | 'order'
>;

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
 * `baseAmount` the BROKER'S REVENUE on the closed position it was calculated
 * from — its commission and swap, never the client's deposit, volume or profit
 * — and `rateValue` the percentage applied. All three are shown, because a
 * commission nobody can recompute is one nobody can dispute.
 */
export interface IbAccrual {
  accrual: {
    id: string;
    status: 'pending' | 'confirmed' | 'reversed';
    /*
     * WHICH LEG — and the two are paid to DIFFERENT PEOPLE from one trade.
     * A commission goes to the partner on the row; a rebate goes to the
     * client on it. Reading one as the other is how an introducer gets paid
     * their own client's rebate.
     */
    kind: 'commission' | 'rebate';
    amount: string;
    baseAmount: string;
    rateValue: string;
    currency: string;
    /**
     * How many hops above the trading client this partner stood on THIS trade.
     *
     * `level` sat beside it until 0102 — the rung they occupied, which had
     * decided no rate since the programmes landed. Two numbers that looked
     * interchangeable and were not; `depth` is the one the money used.
     */
    depth: number;
    /**
     * The terms that produced it, by name — from whichever column carries them.
     *
     * A row records EXACTLY ONE: the LEVEL that priced it since 0112, the
     * programme before it. The server coalesces the two so one column can
     * explain a payout from either era. Null on a row so old it recorded
     * neither.
     */
    termsName: string | null;
    sourceType: string;
    /** Null when the client is outside the reader's territory — it is their trade. */
    sourceId: string | null;
    createdAt: string;
    confirmedAt: string | null;
  };
  /**
   * The partner the commission was earned BY — attribution on a rebate row,
   * where the money is the client's.
   *
   * `email` is nullable because the server NULLS it when this person sits
   * outside the reader's territory. See `partnerMasked`.
   */
  partner: IbAccrualPerson;
  /** The client whose trading GENERATED it — and who is PAID on a rebate row. */
  client: IbAccrualPerson;
  /**
   * TERRITORY, not permissions — and either person can be the hidden one.
   *
   * A row is visible when its BENEFICIARY is in the reader's territory: the
   * partner on a commission, the client on a rebate. The OTHER party on that
   * row may be someone the reader holds no territory over, and their identity
   * is nulled server-side.
   *
   * The flag exists so the screen can say "outside your territory" instead of
   * rendering a blank, which reads as missing data and sends an operator
   * looking for a bug that is not there.
   */
  clientMasked: boolean;
  partnerMasked: boolean;
}

/**
 * A person on an accrual row. Every identifying field — the Portal ID included
 * — is NULL when they sit outside the reader's territory: the Portal ID is the
 * number every other screen's search takes, so it goes with the name.
 */
export interface IbAccrualPerson {
  /** Null, like every identifier here, when the person is outside the reader's territory. */
  id: string | null;
  portalId: number | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
}

export interface IbAccrualPage {
  rows: IbAccrual[];
  total: number;
  /** Summed in SQL across the whole filtered set, not the page. */
  totals: { status: string; amount: string }[];
}

/** The sort keys `GET /admin/ib/accruals` accepts — mirrors the API allow-list. */
export const IB_ACCRUAL_SORT_KEYS = [
  'createdAt',
  'amount',
  'status',
  'depth',
] as const satisfies readonly SortKeysOf<'AdminIbController_listAccruals'>[];
export type IbAccrualSortKey = (typeof IB_ACCRUAL_SORT_KEYS)[number];
/** One movement of a client's money — what `creditWallet` answers with. */
export type Transaction = components['schemas']['TransactionDto'];
/** What a hand credit answers — the transaction written and whether it was a replay. */
export type WalletCreditResult = components['schemas']['WalletCreditResultDto'];
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
/** One background job's timing and last run — Settings → Scheduled jobs. */
export type ScheduledJob = components['schemas']['ScheduledJobDto'];
export type ScheduledJobList = components['schemas']['ScheduledJobListDto'];
/** What "Sync from MT5" did — accounts recorded with no client, and what is left. */
export type Mt5AccountsSyncRun = components['schemas']['Mt5AccountsSyncRunDto'];
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
] as const satisfies readonly SortKeysOf<'AdminHoldingsController_listWallets'>[];
export type WalletSortKey = (typeof WALLET_SORT_KEYS)[number];

export interface WalletListParams {
  limit: number;
  page?: number;
  userId?: ClientRef;
  /**
   * Free text over the OWNER's email and name — what the Client column shows.
   *
   * ⚠️ Adding a field here is only half of it: `getWallets` builds its query
   * string from an ALLOWLIST, so a parameter that is not written into that
   * builder is silently dropped. It was missing there for a day and the search
   * box did nothing in production — see the note on the builder.
   */
  q?: string;
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
/** `POST /admin/trading-accounts` — the body. */
export type CreateMt5AccountDto = components['schemas']['CreateMt5AccountDto'];

/**
 * One MT5 group an account may be opened in.
 *
 * Hand-declared, and the gap is named per the repo rule: `GET /admin/mt5/groups`
 * carries no `@ApiOkResponse`, so the generated schema for it is
 * `content?: never`. Aliasing that would type the response as nothing.
 */
export interface Mt5Group {
  name: string;
  currency: string;
  leverageDefault: number;
}

/**
 * A freshly opened account. NO PASSWORDS, deliberately.
 *
 * MT5 issues the master and investor passwords once and nothing stores them,
 * and they are emailed to the CLIENT rather than returned here. The account's
 * owner is the only person who should ever hold its trading password, and this
 * response is read by a member of staff.
 *
 * `credentialsSentTo` exists so the console can say where they went. Silence
 * after a successful create reads as though something was forgotten.
 */
export interface CreatedMt5Account {
  id: string;
  login: string;
  group: string;
  currency: string;
  leverage: number;
  environment: 'live' | 'demo';
  credentialsSentTo: string;
}

/**
 * The outcome of moving money on a trading account by hand.
 *
 * ## The two directions return DIFFERENT shapes, and the nulls say which
 *
 * A DEPOSIT is a wallet credit then a transfer, so `transaction` carries the
 * credit — the leg that has definitely happened by the time this returns — and
 * `transferError` is set when the onward move did not go through. The deposit is
 * NOT unwound to punish that, so the money is sitting in the client's wallet and
 * the operator has to be told rather than shown a plain success.
 *
 * A WITHDRAWAL is one transfer off the account, whose own settlement credits the
 * wallet. Nothing is minted, so there is no transaction row and `transaction` is
 * null — and there is no half-done state, so a failure throws rather than
 * returning, which is why `transferError` is always null in that direction.
 */
export type FundTradingAccountResult = components['schemas']['TradingAccountFundResultDto'];

/** What MT5 says an account holds right now — distinct from the cached column. */
export interface Mt5LiveSnapshot {
  login: number;
  group: string;
  currency: string;
  leverage: number;
  balance: string;
  equity: string;
  credit: string;
  margin: string;
  marginFree: string;
  marginLevel: string | null;
}

export const TRADING_ACCOUNT_SORT_KEYS = [
  'createdAt',
  'balance',
  'login',
  'currency',
  'status',
  'environment',
  'userEmail',
  'userFirstName',
] as const satisfies readonly SortKeysOf<'AdminHoldingsController_listTradingAccounts'>[];
export type TradingAccountSortKey = (typeof TRADING_ACCOUNT_SORT_KEYS)[number];

/**
 * Query string for the wallet list. Exported for its own unit test, and that is
 * the whole reason it exists as a function.
 *
 * ## ⚠️ IT IS AN ALLOWLIST, AND A MISSING LINE IS SILENT IN THREE PLACES
 *
 * `q` was absent from this builder for a day. The page computed the term, put it
 * in the params object and passed it in; the request went out without it, the
 * API returned the unfiltered list, and the search box on `/wallets` and
 * `/trading-accounts` did nothing at all in production. Nothing caught it:
 *
 *   the COMPILER  — `params` is a variable at the call site, not an object
 *                   literal, so excess-property checking never runs and an
 *                   unknown-to-the-builder field is accepted and discarded.
 *   the PAGE TEST — it mocks `api.admin.getWallets` and asserts the params
 *                   OBJECT, which is the page's intent, not the request.
 *   the BACKEND   — Nest ignores a query parameter no handler declares, so an
 *                   unfiltered answer is indistinguishable from a working one.
 *
 * So the request is built HERE, as a pure function over the params, and
 * `admin-request-params.test.ts` asserts on the resulting query string — the one
 * place the defect is visible. `list-params-census.test.ts` additionally refuses
 * a params field that this function never reads.
 *
 * Empty values are OMITTED rather than sent blank, for the reason
 * `clientListSearchParams` records: `?currency=` reaches the API as an empty
 * string, and a present-but-empty filter is a different request from an absent
 * one.
 */
export function walletListSearchParams(params: WalletListParams): URLSearchParams {
  const query = new URLSearchParams({ limit: String(params.limit), withTotal: 'true' });
  if (params.page !== undefined) query.set('page', String(params.page));
  if (params.userId) query.set('userId', String(params.userId));
  if (params.q) query.set('q', params.q);
  if (params.currency) query.set('currency', params.currency);
  // Both halves or neither. `order` alone describes an ordering of no column.
  if (params.sort) {
    query.set('sort', params.sort);
    if (params.order) query.set('order', params.order);
  }
  return query;
}

export interface TradingAccountListParams {
  limit: number;
  page?: number;
  userId?: ClientRef;
  /** Accounts of every client this partner introduced — by the partner's Portal ID. */
  referredBy?: string;
  /** Free text over the owner's email and name — see `WalletListParams.q`. */
  q?: string;
  environment?: TradingAccountEnvironment;
  status?: TradingAccountStatus;
  /**
   * `unassigned`: accounts the MT5 sync found that no client owns yet (`user`
   * null); `assigned`: the rest. The server shows unassigned ones only to an
   * admin who sees every client.
   */
  client?: 'assigned' | 'unassigned';
  sort?: TradingAccountSortKey;
  order?: 'asc' | 'desc';
}

/** Query string for the trading-account list — see `walletListSearchParams`. */
export function tradingAccountListSearchParams(params: TradingAccountListParams): URLSearchParams {
  const query = new URLSearchParams({ limit: String(params.limit), withTotal: 'true' });
  if (params.page !== undefined) query.set('page', String(params.page));
  if (params.userId) query.set('userId', String(params.userId));
  if (params.referredBy) query.set('referredBy', params.referredBy);
  if (params.q) query.set('q', params.q);
  if (params.environment) query.set('environment', params.environment);
  if (params.status) query.set('status', params.status);
  if (params.client) query.set('client', params.client);
  if (params.sort) {
    query.set('sort', params.sort);
    if (params.order) query.set('order', params.order);
  }
  return query;
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
] as const satisfies readonly SortKeysOf<'AdminComplianceController_listKyc'>[];
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
export const AUDIT_SORT_KEYS = [
  'createdAt',
  'action',
  'actorEmail',
] as const satisfies readonly SortKeysOf<'AdminAuditController_listAuditLog'>[];
export type AuditSortKey = (typeof AUDIT_SORT_KEYS)[number];

/**
 * The columns `GET /admin/ib/applications` will sort by, mirroring the
 * backend's `IB_APPLICATION_SORT_COLUMNS` (store/ib.store.ts).
 *
 * The applicant columns come from the `users` INNER JOIN the queue already does
 * to display a name and email, so ordering by them costs no extra join.
 *
 * `agencyName` is absent for a different reason than a missing index: it is
 * resolved AFTER the paged query, so there is no column for the database to
 * order by and its screen control stays `sortable: false`.
 */
export const IB_APPLICATION_SORT_KEYS = [
  'submittedAt',
  'status',
  'userEmail',
  'userFirstName',
] as const satisfies readonly SortKeysOf<'AdminIbController_list'>[];
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
 * There is no `parentIbUserId` key: the directory names a parent by Portal ID
 * (or says there is none), and a sort on it would order by opaque UUID and
 * answer a question nobody asked.
 */
export const IB_PARTNER_SORT_KEYS = [
  'approvedAt',
  // `level`, and it sorts as an INTEGER on the server — which is the whole
  // reason it is the column rather than the level's name. A rung's identity is
  // its number, and ordering by text puts "Level 10" before "Level 2".
  'level',
  'referralCode',
  'userEmail',
  'userFirstName',
] as const satisfies readonly SortKeysOf<'AdminIbController_listPartners'>[];
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

/** RBAC-08 — the allowlist, whether it is enforcing, and your own address. */
export type IpAllowlistStatus = components['schemas']['IpAllowlistStatusDto'];
export type IpAllowlistRule = components['schemas']['IpAllowlistRuleDto'];

/**
 * The catalogue: a product, and the MT5 groups behind it.
 *
 * A group is a LEAF — an account points at exactly one, and a group fixes one
 * currency and one environment — so a product spans several: one per currency
 * per environment. That is why `groups` is a list and not a field.
 */
export type Product = components['schemas']['ProductDto'];
export type UpsertProduct = components['schemas']['UpsertProductDto'];
export type ProductGroup = components['schemas']['ProductGroupDto'];
export type AvailableGroup = components['schemas']['AvailableGroupDto'];

/** An agency (وكالة) — the package a partner is appointed under. */
export type Agency = components['schemas']['AgencyDto'];
export type UpsertAgency = components['schemas']['UpsertAgencyDto'];

/**
 * The terms clients may open trading accounts on.
 *
 * `leverages` comes back as `number[]` and goes up as the comma-separated
 * STRING the operator typed — the asymmetry is deliberate on the server: the
 * form is a text box, and a malformed entry is refused with a message naming
 * it rather than silently dropped.
 */
export type TradingSettings = components['schemas']['TradingSettingsDto'];
export type UpdateTradingSettings = components['schemas']['UpdateTradingSettingsDto'];

/*
 * `RevenueBasis` IS GONE (0104), with the "Partners are paid on" control it
 * typed. The basis is a constant in the API now — the commission + swap this
 * platform has always paid on — because commission is configured on the
 * Commission Programmes page and a Trading-settings control that re-prices
 * every partner is a second place for two answers to disagree.
 */

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

// ── Notifications — the bell ───────────────────────────────────────────────
export type AdminNotification = components['schemas']['NotificationDto'];
export type AdminNotificationPage = components['schemas']['NotificationListResponseDto'];
export type NotificationUnreadCount = components['schemas']['NotificationUnreadCountDto'];
export type NotificationsMarkAllRead = components['schemas']['NotificationsMarkAllReadResponseDto'];

export const adminApi = {
  // ── RBAC-08, the admin IP allowlist ──────────────────────────────────────
  /**
   * Requires `settings.security.view`.
   *
   * `yourIp` is the address THE SERVER SEES, which in local development is the
   * Next.js rewrite rather than the browser — the panel says so, because a rule
   * written for the address an operator can see is one the server can never
   * match, and that is what made this feature painful enough to be deleted once.
   */
  async getIpAllowlist(signal?: AbortSignal): Promise<IpAllowlistStatus> {
    const { data } = await apiClient.get<IpAllowlistStatus>('/admin/ip-allowlist', { signal });
    return data;
  },

  /** Requires `settings.security.edit`. The API refuses a rule that would lock the author out. */
  async addIpAllowlistRule(input: { cidr: string; label: string }): Promise<IpAllowlistRule> {
    const { data } = await apiClient.post<IpAllowlistRule>('/admin/ip-allowlist', input);
    return data;
  },

  /** Requires `settings.security.edit`. Refused when it is the last rule covering you. */
  async removeIpAllowlistRule(id: string): Promise<{ message: string }> {
    const { data } = await apiClient.delete<{ message: string }>(`/admin/ip-allowlist/${id}`);
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

  async getLeverages(signal?: AbortSignal): Promise<Leverage[]> {
    // The ADMIN list — includes disabled rungs, unlike the client-facing offer,
    // because somebody has to see what they withdrew in order to put it back.
    const { data } = await apiClient.get<Leverage[]>('/admin/leverages', { signal });
    return data;
  },

  async createLeverage(body: CreateLeverage): Promise<Leverage> {
    const { data } = await apiClient.post<Leverage>('/admin/leverages', body);
    return data;
  },

  /** The RATIO is the key and cannot be changed — see `UpdateLeverageDto`. */
  async updateLeverage(ratio: number, body: UpdateLeverage): Promise<Leverage> {
    const { data } = await apiClient.patch<Leverage>(`/admin/leverages/${ratio}`, body);
    return data;
  },

  async deleteLeverage(ratio: number): Promise<void> {
    await apiClient.delete(`/admin/leverages/${ratio}`);
  },

  /**
   * The links on the client portal's sidebar.
   *
   * The ADMIN list — includes HIDDEN links, unlike the portal's
   * `GET /external-links`, because somebody has to see what they took down in
   * order to put it back.
   */
  async getExternalLinks(signal?: AbortSignal): Promise<ExternalLink[]> {
    const { data } = await apiClient.get<ExternalLink[]>('/admin/external-links', { signal });
    return data;
  },

  async createExternalLink(body: CreateExternalLink): Promise<ExternalLink> {
    const { data } = await apiClient.post<ExternalLink>('/admin/external-links', body);
    return data;
  },

  /** PATCH, and only the supplied fields change. An empty `description` clears it. */
  async updateExternalLink(id: string, body: UpdateExternalLink): Promise<ExternalLink> {
    const { data } = await apiClient.patch<ExternalLink>(`/admin/external-links/${id}`, body);
    return data;
  },

  async deleteExternalLink(id: string): Promise<void> {
    await apiClient.delete(`/admin/external-links/${id}`);
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
   * The partner application queue.
   *
   * Rows AND per-status counts, both scoped to the reviewing admin's client
   * visibility by the API. The counts drive the tab labels, so a count computed
   * separately from the rows would promise twelve pending and show four.
   */
  async getIbApplications(
    params: {
      status?: IbApplicationStatus;
      /** Applicant email or name. Server-side — see the store's note. */
      q?: string;
      /** One application, in any status — what a notification opens. */
      id?: string;
      page?: number;
      limit?: number;
      sort?: IbApplicationSortKey;
      order?: 'asc' | 'desc';
    },
    signal?: AbortSignal,
  ): Promise<IbApplicationPage> {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.q) query.set('q', params.q);
    if (params.id) query.set('id', params.id);
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

  /**
   * Approve, optionally overriding what the applicant asked for.
   *
   * `agencyId` OMITTED grants the agency they applied for, which is the normal
   * case and the safe default — approving a request while silently substituting
   * a different programme is how you produce an angry partner. Send one only to
   * appoint them somewhere else.
   */
  async approveIbApplication(
    id: string,
    body: { level?: number; parentIbUserId?: ClientRef; agencyId?: string } = {},
  ): Promise<IbAccount> {
    const { parentIbUserId, ...rest } = body;
    const { data } = await apiClient.patch<IbAccount>(`/admin/ib/applications/${id}/approve`, {
      ...rest,
      ...(parentIbUserId === undefined ? {} : { parentIbUserId: Number(parentIbUserId) }),
    });
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
      /** A Portal ID, a name or email, or a referral code. */
      q?: string;
      status?: 'active' | 'suspended';
    },
    signal?: AbortSignal,
  ): Promise<IbPartnerPage> {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    if (params.q) query.set('q', params.q);
    if (params.status) query.set('status', params.status);
    // Both halves or neither — see `getIbApplications` above.
    if (params.sort) query.set('sort', params.sort);
    if (params.sort && params.order) query.set('order', params.order);
    const { data } = await apiClient.get<IbPartnerPage>(`/admin/ib/partners?${query.toString()}`, {
      signal,
    });
    return data;
  },

  /**
   * One partner's standing, or NULL when the client is not a partner.
   *
   * The return type is widened deliberately. `IbPartnerDetailDto` is what the
   * generated contract says, because Nest describes a route by its DTO and has
   * no way to express "or null" — so the honest type is written here, at the one
   * place every caller passes through, rather than left to each of them to
   * remember. Most clients are not partners; a caller that skipped the check
   * would read `.level` off null on the majority of profiles.
   */
  async getPartnerDetail(userId: ClientRef, signal?: AbortSignal): Promise<IbPartnerDetail | null> {
    const { data } = await apiClient.get<IbPartnerDetail | null>(`/admin/ib/partners/${userId}`, {
      signal,
    });
    return data ?? null;
  },

  /**
   * Move a partner to a different RUNG — what they are paid, as opposed to
   * where they sit in the tree.
   *
   * The two are separate calls even though a partner's level is normally
   * DERIVED from their parent's: reassigning a parent is a statement about the
   * tree and must not silently re-price anybody, and granting main-partner
   * terms to somebody sitting under another partner must not require lying
   * about the tree.
   *
   * Applies to the next trade only — accruals record the rate AND the level
   * they were calculated under, so nothing already credited is restated. The
   * API refuses a level that is disabled or not configured at all: either pays
   * nothing, so moving somebody onto one would stop their earnings silently.
   *
   * Partners BENEATH them are NOT moved. Cascading would re-price an unbounded
   * number of people from one edit of somebody else's row.
   */
  async changeIbPartnerLevel(userId: ClientRef, level: number): Promise<IbAccount> {
    const { data } = await apiClient.patch<IbAccount>(`/admin/ib/partners/${userId}/level`, {
      level,
    });
    return data;
  },

  /** `null` makes them a direct partner — it is a value, not an omission. */
  async reassignIbPartnerParent(
    userId: ClientRef,
    parentIbUserId: ClientRef | null,
  ): Promise<IbAccount> {
    const { data } = await apiClient.patch<IbAccount>(`/admin/ib/partners/${userId}/parent`, {
      parentIbUserId: parentIbUserId === null ? null : Number(parentIbUserId),
    });
    return data;
  },

  async setIbPartnerActive(userId: ClientRef, active: boolean): Promise<IbAccount> {
    const { data } = await apiClient.patch<IbAccount>(`/admin/ib/partners/${userId}/active`, {
      active,
    });
    return data;
  },

  /* ── Commission programmes (FR-ADM-10) ──────────────────────────────── */

  /**
   * Every rung, disabled ones included — managing them is the point of the
   * screen, and terms you cannot see are terms you cannot re-enable.
   *
   * Each row carries `partnerCount`, so the screen can refuse a delete before
   * the API does and say how many people a rate change affects.
   */
  async getIbLevels(signal?: AbortSignal): Promise<IbLevel[]> {
    const { data } = await apiClient.get<IbLevel[]>('/admin/ib-levels', { signal });
    return data;
  },

  /** How deep the ladder may go, so the form can stop offering levels in time. */
  async getIbLevelLimits(signal?: AbortSignal): Promise<IbLevelLimits> {
    const { data } = await apiClient.get<IbLevelLimits>('/admin/ib-levels/limits', { signal });
    return data;
  },

  /**
   * The API refuses a level past the configured ceiling and one whose two
   * PERCENTAGES total more than 100% of the broker's revenue. Every message
   * names the numbers involved — surface them verbatim, because a generic
   * failure throws away the only part an operator can act on.
   */
  async createIbLevel(body: CreateIbLevel): Promise<IbLevel> {
    const { data } = await apiClient.post<IbLevel>('/admin/ib-levels', body);
    return data;
  },

  /**
   * PATCH, keyed on the level NUMBER rather than an id — a level is its number.
   *
   * A rate change applies to the NEXT trade, never to what has already been
   * earned: accruals record the rate AND the level they were calculated under.
   *
   * Disabling one that partners stand on is refused by the API, because a
   * disabled level stops paying while their referral links keep working.
   */
  async updateIbLevel(level: number, body: UpdateIbLevel): Promise<IbLevel> {
    const { data } = await apiClient.patch<IbLevel>(`/admin/ib-levels/${level}`, body);
    return data;
  },

  /**
   * Refused while partners stand on it, refused for level 1 — every chain
   * starts there — and refused while deeper levels sit below it.
   */
  async deleteIbLevel(level: number): Promise<void> {
    await apiClient.delete(`/admin/ib-levels/${level}`);
  },

  /* ── MT5 groups ───────────────────────────────────────────────────────── */

  /** Every mirrored group, removed ones included, with its product and account count. */
  async getMt5GroupMirror(signal?: AbortSignal): Promise<Mt5GroupRow[]> {
    const { data } = await apiClient.get<Mt5GroupRow[]>('/admin/mt5-groups', { signal });
    return data;
  },

  /* ── Commission types (0140) ─────────────────────────────────────────── */

  /** Every rate card, disabled ones included, each naming the products sold on it. */
  async getIbCommissionTypes(signal?: AbortSignal): Promise<IbCommissionType[]> {
    const { data } = await apiClient.get<IbCommissionType[]>('/admin/ib-commission-types', {
      signal,
    });
    return data;
  },

  async createIbCommissionType(body: CreateIbCommissionType): Promise<IbCommissionType> {
    const { data } = await apiClient.post<IbCommissionType>('/admin/ib-commission-types', body);
    return data;
  },

  /**
   * The API refuses to disable a type products are sold on, naming them.
   * Surfaced verbatim — the names are the only part an operator can act on.
   */
  async updateIbCommissionType(
    id: string,
    body: UpdateIbCommissionType,
  ): Promise<IbCommissionType> {
    const { data } = await apiClient.patch<IbCommissionType>(
      `/admin/ib-commission-types/${id}`,
      body,
    );
    return data;
  },

  /** Refused while products are sold on it, and once it has priced a payout. */
  async deleteIbCommissionType(id: string): Promise<void> {
    await apiClient.delete(`/admin/ib-commission-types/${id}`);
  },

  /* ── The catalogue ──────────────────────────────────────────────────── */

  async getProducts(): Promise<Product[]> {
    const { data } = await apiClient.get<Product[]>('/admin/products');
    return data;
  },

  /** Groups the MT5 server reports, flagged with which are already claimed. */
  async getAvailableGroups(): Promise<AvailableGroup[]> {
    const { data } = await apiClient.get<AvailableGroup[]>('/admin/products/mt5-groups');
    return data;
  },

  async createProduct(body: UpsertProduct): Promise<Product> {
    const { data } = await apiClient.post<Product>('/admin/products', body);
    return data;
  },

  async updateProduct(id: string, body: UpsertProduct): Promise<Product> {
    const { data } = await apiClient.put<Product>(`/admin/products/${id}`, body);
    return data;
  },

  async deleteProduct(id: string): Promise<void> {
    await apiClient.delete(`/admin/products/${id}`);
  },

  async attachProductGroup(
    id: string,
    body: { environment: 'live' | 'demo'; mt5Group: string },
  ): Promise<Product> {
    const { data } = await apiClient.post<Product>(`/admin/products/${id}/groups`, body);
    return data;
  },

  async detachProductGroup(id: string, groupId: string): Promise<Product> {
    const { data } = await apiClient.delete<Product>(`/admin/products/${id}/groups/${groupId}`);
    return data;
  },

  // Takes the AbortSignal so a superseded read cancels — the approve dialog
  // fetches this on open, and opening two in quick succession would otherwise
  // race two responses into one cache key.
  async getAgencies(signal?: AbortSignal): Promise<Agency[]> {
    const { data } = await apiClient.get<Agency[]>('/admin/agencies', { signal });
    return data;
  },

  async createAgency(body: UpsertAgency): Promise<Agency> {
    const { data } = await apiClient.post<Agency>('/admin/agencies', body);
    return data;
  },

  async updateAgency(id: string, body: UpsertAgency): Promise<Agency> {
    const { data } = await apiClient.put<Agency>(`/admin/agencies/${id}`, body);
    return data;
  },

  async deleteAgency(id: string): Promise<void> {
    await apiClient.delete(`/admin/agencies/${id}`);
  },

  /** The COMPLETE set, not a delta — see SetAgencyProductsDto. */
  async setAgencyProducts(id: string, productIds: string[]): Promise<Agency> {
    const { data } = await apiClient.put<Agency>(`/admin/agencies/${id}/products`, { productIds });
    return data;
  },

  async getTradingSettings(): Promise<TradingSettings> {
    const { data } = await apiClient.get<TradingSettings>('/admin/settings/trading');
    return data;
  },

  async updateTradingSettings(body: UpdateTradingSettings): Promise<TradingSettings> {
    const { data } = await apiClient.put<TradingSettings>('/admin/settings/trading', body);
    return data;
  },

  // ── Scheduled jobs (Settings → Scheduled jobs, 29 Sep 2026) ───────────────

  async getScheduledJobs(signal?: AbortSignal): Promise<ScheduledJobList> {
    const { data } = await apiClient.get<ScheduledJobList>('/admin/settings/scheduled-jobs', {
      signal,
    });
    return data;
  },

  /** Change how often a job runs; the answer is the whole list again. */
  async updateScheduledJob(key: string, intervalSeconds: number): Promise<ScheduledJobList> {
    const { data } = await apiClient.put<ScheduledJobList>(
      `/admin/settings/scheduled-jobs/${encodeURIComponent(key)}`,
      { intervalSeconds },
    );
    return data;
  },

  /** Start a CRM job at the runner's next tick (within 15 seconds). */
  async runScheduledJob(key: string): Promise<ScheduledJobList> {
    const { data } = await apiClient.post<ScheduledJobList>(
      `/admin/settings/scheduled-jobs/${encodeURIComponent(key)}/run`,
    );
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
    if (params.q) query.set('q', params.q);
    if (params.id) query.set('id', params.id);
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

  // ── The Financial page (GET /admin/transactions) ──────────────────────────

  /**
   * Every money movement, platform-wide — deposits, withdrawals and both
   * transfer kinds in one list, with the client joined onto each row.
   *
   * `counts` (per state) and `directionCounts` (per direction) group over the
   * FULL filtered set ignoring their own axis, so the tabs stay correct
   * whichever tab is active — the withdrawal desk's two-axis rule. `total`
   * describes the current filter and is what the pager divides.
   *
   * Every `amount` is a STRING and must reach the DOM as one — §6.1.
   */
  async getTransactions(
    params: TransactionListParams,
    signal?: AbortSignal,
  ): Promise<TransactionListResponse> {
    const query = new URLSearchParams({ limit: String(params.limit) });
    // Omitted rather than sent blank — the getWithdrawals rule.
    if (params.direction) query.set('direction', params.direction);
    if (params.kind) query.set('kind', params.kind);
    if (params.state) query.set('state', params.state);
    if (params.userId) query.set('userId', String(params.userId));
    if (params.currency) query.set('currency', params.currency);
    if (params.q) query.set('q', params.q);
    if (params.from) query.set('from', params.from);
    if (params.to) query.set('to', params.to);
    if (params.attention) query.set('attention', params.attention);
    if (params.decidedBy) query.set('decidedBy', params.decidedBy);
    if (params.id) query.set('id', params.id);
    if (params.page !== undefined) query.set('page', String(params.page));
    // Both halves or neither — `order` alone orders no column.
    if (params.sort) {
      query.set('sort', params.sort);
      if (params.order) query.set('order', params.order);
    }
    const { data } = await apiClient.get<TransactionListResponse>(
      `/admin/transactions?${query.toString()}`,
      { signal },
    );
    return data;
  },

  /**
   * Server-computed totals for the Financial page's tiles, grouped per
   * direction, kind, state AND currency — a sum across currencies is not a
   * number, so the server never produces one and this page never computes
   * one. `total` on each row is a string; render it or drop it, never add it.
   */
  async getTransactionsSummary(
    params: TransactionsSummaryParams,
    signal?: AbortSignal,
  ): Promise<TransactionsSummary> {
    const query = new URLSearchParams();
    if (params.direction) query.set('direction', params.direction);
    if (params.kind) query.set('kind', params.kind);
    if (params.state) query.set('state', params.state);
    if (params.userId) query.set('userId', String(params.userId));
    if (params.currency) query.set('currency', params.currency);
    if (params.q) query.set('q', params.q);
    if (params.from) query.set('from', params.from);
    if (params.to) query.set('to', params.to);
    if (params.attention) query.set('attention', params.attention);
    const qs = query.toString();
    const { data } = await apiClient.get<TransactionsSummary>(
      `/admin/transactions/summary${qs ? `?${qs}` : ''}`,
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
    body: { userId: ClientRef; amount: string; currency: string; reason: string },
    key: string,
  ): Promise<WalletCreditResult> {
    const { data } = await apiClient.post<WalletCreditResult>(
      '/admin/wallets/credit',
      { ...body, userId: Number(body.userId) },
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
      ibUserId?: ClientRef;
      clientUserId?: ClientRef;
      /**
       * Free text over the PARTNER's email and name — never the client's. The
       * store masks an out-of-scope client's identity, and a filter that
       * matched it would hand that masking back as a row count.
       */
      q?: string;
      status?: string;
      /** One accrual, in any status — what a notification opens. */
      id?: string;
      sort?: IbAccrualSortKey;
      order?: 'asc' | 'desc';
    },
    signal?: AbortSignal,
  ): Promise<IbAccrualPage> {
    const { data } = await apiClient.get<IbAccrualPage>('/admin/ib/accruals', { params, signal });
    return data;
  },

  async openWallet(body: { userId: ClientRef; currency: string }): Promise<WalletRow> {
    const { data } = await apiClient.post<WalletRow>('/admin/wallets', {
      ...body,
      userId: Number(body.userId),
    });
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

  /**
   * Approve an offline deposit — this CREDITS the client's wallet.
   *
   * `key` is derived from the row (`approve:<id>`), never random: a
   * double-clicked button and a retry after a dropped response must collapse to
   * one credit. The server refuses a second decision anyway (the state is the
   * guard), but the idempotency key is what makes the retry return the first
   * answer instead of an error the operator has to interpret.
   */
  async approveDeposit(id: string, key: string): Promise<DepositDecision> {
    const { data } = await apiClient.patch<DepositDecision>(
      `/admin/deposits/${id}/approve`,
      {},
      idempotent(key),
    );
    return data;
  },

  /**
   * Reject an offline deposit, with a reason the client is shown.
   *
   * NOTHING IS REFUNDED — a deposit debits nothing when it is filed, so there is
   * no money to give back. The copy on the screen has to say so, or an operator
   * assumes a reversal happened and the client waits for one.
   */
  async rejectDeposit(
    id: string,
    body: { reason?: string; reasonId?: string },
    key: string,
  ): Promise<DepositDecision> {
    const { data } = await apiClient.patch<DepositDecision>(
      `/admin/deposits/${id}/reject`,
      body,
      idempotent(key),
    );
    return data;
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
   * How many transfers are stuck, for the Financial banner.
   *
   * The condition is already detected server-side and raises a `page`-severity
   * alert — into a LOG LINE, because no paging provider is wired. This is how
   * the console finds out instead.
   *
   * A count, not a list: the rows are already on the table below the banner.
   */
  async getStuckTransfers(signal?: AbortSignal): Promise<StuckTransfers> {
    const { data } = await apiClient.get<StuckTransfers>('/admin/transfers/stuck', { signal });
    return data;
  },

  /**
   * Release a transfer the MT5 bridge left in flight.
   *
   * A `wallet_to_account` transfer HOLDS the money at request time and debits it
   * on settle. When the bridge loses its session mid-call the transfer stays
   * pending — correctly, because the executor cannot tell "MT5 refused" from
   * "MT5 never answered" — and nothing ever expires that hold. The client sees
   * "Processing" and cannot spend their own money, for as long as nobody looks.
   *
   * ⚠️ Only after reading the broker's own record. If MT5 DID apply the
   * movement, releasing the hold lets the client spend money that has already
   * left. That is the one thing the executor refuses to guess at, and the whole
   * reason this is a person's decision rather than a timeout.
   *
   * `reason` is required and reaches the client on the failed row.
   */
  async abandonTransfer(id: string, reason: string, key: string): Promise<TransferRow> {
    const { data } = await apiClient.post<TransferRow>(
      `/admin/transfers/${id}/abandon`,
      { reason },
      idempotent(key),
    );
    return data;
  },

  /**
   * "Mark resolved" — a person reconciled a deposit or payout only a person
   * could: an amount the platform reported differently, a reversal, money paid
   * against a failed row, the two platforms disagreeing.
   *
   * Moves NO money; whatever the reconciliation required is its own action.
   * The note (10–500 characters, the DTO's bounds) is the audit record of what
   * they found, and clearing the flag ends the admin task about it for every
   * admin (backend 0140). Refused once the payment is no longer flagged.
   */
  async resolveAttention(id: string, note: string): Promise<AttentionResolved> {
    const { data } = await apiClient.patch<AttentionResolved>(
      `/admin/transactions/${id}/attention/resolve`,
      { note },
    );
    return data;
  },

  /**
   * Cancel an APPROVED withdrawal — "approved, then thought better of it".
   *
   * A payout already submitted to Rival is cancelled THERE first; if Rival is
   * already paying it the API refuses with nothing changed, and the message
   * says to act on the outcome instead. Reason rules mirror reject: a client
   * whose payout was pulled back after "approved" is owed a sentence.
   */
  async cancelWithdrawal(
    id: string,
    body: { reasonId?: string; reason?: string },
    key: string,
  ): Promise<WithdrawalRow> {
    const { data } = await apiClient.patch<WithdrawalRow>(
      `/admin/withdrawals/${id}/cancel`,
      body,
      idempotent(key),
    );
    return data;
  },

  /**
   * Retry a payout submission whose first attempt definitively failed (the
   * row shows "needs attention"). A submission whose outcome is still UNKNOWN
   * is deliberately not retried by the API — Rival's payout create has no
   * idempotency key, so a blind retry is a double payment.
   */
  async retryRivalSubmission(id: string, key: string): Promise<WithdrawalRow> {
    const { data } = await apiClient.post<WithdrawalRow>(
      `/admin/withdrawals/${id}/rival-submit`,
      {},
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
      /**
       * Free text over the OWNER's email and name, not over the entries. The
       * ledger screen names its client in words, so its filter has to accept
       * the same words — `userId` alone made the filter demand a uuid the page
       * prints nowhere.
       */
      q?: string;
      userId?: ClientRef;
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

  // ── MT5 bridge diagnostics ────────────────────────────────────────────────
  //
  // Read-only passthroughs to the bridge. They answer the two questions no other
  // screen can: whether deal ingestion is working, and whether any money
  // movement was stranded mid-flight.
  //
  // These FAIL when the bridge is down rather than returning empty, and that is
  // deliberate — on a diagnostics screen, "no rows" and "could not ask" are
  // opposite answers, and rendering the second as the first would report a
  // healthy queue on a service that is not running.

  /**
   * The bridge's deal delivery queue.
   *
   * `pending` narrows to what has not arrived. The summary's `failing` count is
   * the one to act on: a pending row may simply be new, while a failing one has
   * been attempted and rejected.
   */
  async getBridgeOutbox(
    params: { pending?: boolean; limit?: number } = {},
    signal?: AbortSignal,
  ): Promise<BridgeOutbox> {
    const { data } = await apiClient.get<BridgeOutbox>('/admin/bridge/outbox', {
      params,
      signal,
    });
    return data;
  },

  /**
   * Balance operations, including the ones stuck mid-flight.
   *
   * `stuck: true` is not a convenience filter — every row it returns is money in
   * an unknown state: the bridge told MT5 to move it and never learned whether
   * it did. Those do not resolve on their own.
   */
  async getBridgeOperations(
    params: { stuck?: boolean; limit?: number } = {},
    signal?: AbortSignal,
  ): Promise<BridgeOperations> {
    const { data } = await apiClient.get<BridgeOperations>('/admin/bridge/operations', {
      params,
      signal,
    });
    return data;
  },

  /** The tail of the bridge's log for today. */
  async getBridgeLogs(
    params: { lines?: number; contains?: string } = {},
    signal?: AbortSignal,
  ): Promise<BridgeLogs> {
    const { data } = await apiClient.get<BridgeLogs>('/admin/bridge/logs', { params, signal });
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
    const { data } = await apiClient.get<WalletListResponse>(
      `/admin/wallets?${walletListSearchParams(params).toString()}`,
      { signal },
    );
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
    const { data } = await apiClient.get<TradingAccountListResponse>(
      `/admin/trading-accounts?${tradingAccountListSearchParams(params).toString()}`,
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
  async getPaymentProviders(signal?: AbortSignal): Promise<PaymentProvider[]> {
    const { data } = await apiClient.get<PaymentProvider[]>('/admin/payment-providers', { signal });
    return data;
  },

  async getPaymentProvider(code: string, signal?: AbortSignal): Promise<PaymentProvider> {
    const { data } = await apiClient.get<PaymentProvider>(
      `/admin/payment-providers/${encodeURIComponent(code)}`,
      { signal },
    );
    return data;
  },

  /**
   * Merged: an absent key is left alone, `null` removes it. Secrets are
   * write-only; a generated one (a webhook key) is rotated, never sent here.
   */
  async updatePaymentProvider(code: string, body: UpdatePaymentProvider): Promise<PaymentProvider> {
    const { data } = await apiClient.put<PaymentProvider>(
      `/admin/payment-providers/${encodeURIComponent(code)}`,
      body,
    );
    return data;
  },

  async testPaymentProvider(code: string): Promise<PaymentProviderTestResult> {
    const { data } = await apiClient.post<PaymentProviderTestResult>(
      `/admin/payment-providers/${encodeURIComponent(code)}/test`,
    );
    return data;
  },

  /** THE ONE RESPONSE carrying the new secret in plaintext — show it once. */
  async rotatePaymentProviderSecret(code: string, name: string): Promise<RotatedProviderSecret> {
    const { data } = await apiClient.post<RotatedProviderSecret>(
      `/admin/payment-providers/${encodeURIComponent(code)}/secrets/${encodeURIComponent(name)}/rotate`,
    );
    return data;
  },

  async getPaymentProviderEvents(
    code: string,
    signal?: AbortSignal,
  ): Promise<PaymentProviderEvent[]> {
    const { data } = await apiClient.get<PaymentProviderEvent[]>(
      `/admin/payment-providers/${encodeURIComponent(code)}/events?limit=50`,
      { signal },
    );
    return data;
  },

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

  /* ── Withdrawal methods ──────────────────────────────────────────────── */

  async getWithdrawalMethods(signal?: AbortSignal): Promise<WithdrawalMethod[]> {
    const { data } = await apiClient.get<WithdrawalMethod[]>('/admin/withdrawal-methods', {
      signal,
    });
    return data;
  },

  async createWithdrawalMethod(body: CreateWithdrawalMethod): Promise<WithdrawalMethod> {
    const { data } = await apiClient.post<WithdrawalMethod>('/admin/withdrawal-methods', body);
    return data;
  },

  async updateWithdrawalMethod(
    key: string,
    body: UpdateWithdrawalMethod,
  ): Promise<WithdrawalMethod> {
    const { data } = await apiClient.patch<WithdrawalMethod>(
      `/admin/withdrawal-methods/${encodeURIComponent(key)}`,
      body,
    );
    return data;
  },

  async updatePaymentMethod(key: string, body: UpdatePaymentMethod): Promise<PaymentMethod> {
    const { data } = await apiClient.patch<PaymentMethod>(
      `/admin/payment-methods/${encodeURIComponent(key)}`,
      body,
    );
    return data;
  },

  /**
   * Deletes a method NO transaction references (a typo, a test row). The API
   * answers 409 for one that was used — its deposits must keep naming it, so it
   * is disabled instead — and for the gateway method.
   */
  async deletePaymentMethod(key: string): Promise<void> {
    await apiClient.delete(`/admin/payment-methods/${encodeURIComponent(key)}`);
  },

  async deleteWithdrawalMethod(key: string): Promise<void> {
    await apiClient.delete(`/admin/withdrawal-methods/${encodeURIComponent(key)}`);
  },

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

  /**
   * One client's CLOSED positions, on every account they hold.
   *
   * Built by the API from the ingested MT5 deals — the rows the portal's account
   * history and the commission engine read — so all three agree. Open positions
   * are not listed on the profile (owner, 26 Sep 2026).
   */
  async getClientClosedPositions(
    id: ClientRef,
    params: { page?: number; limit?: number } = {},
    signal?: AbortSignal,
  ): Promise<ClientClosedPositionsPage> {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    const { data } = await apiClient.get<ClientClosedPositionsPage>(
      `/admin/clients/${id}/closed-positions?${query.toString()}`,
      { signal },
    );
    return data;
  },

  /**
   * Every document a client handed the platform — KYC versions and deposit
   * receipts — newest first, with the categories this reader may not see named
   * in `hidden` (so "none" and "not yours to see" never read the same).
   */
  async getClientDocuments(clientId: ClientRef, signal?: AbortSignal): Promise<ClientDocumentList> {
    const { data } = await apiClient.get<ClientDocumentList>(
      `/admin/clients/${clientId}/documents`,
      { signal },
    );
    return data;
  },

  async getClientIdentity(id: ClientRef, signal?: AbortSignal): Promise<ClientIdentityRecord> {
    const { data } = await apiClient.get<ClientIdentityRecord>(`/admin/clients/${id}/identity`, {
      signal,
    });
    return data;
  },

  async getClient(id: ClientRef, signal?: AbortSignal): Promise<ClientProfile> {
    const { data } = await apiClient.get<ClientProfile>(`/admin/clients/${id}`, { signal });
    return data;
  },

  async setClientStatus(id: ClientRef, status: 'active' | 'suspended') {
    const { data } = await apiClient.patch<ClientRow>(`/admin/clients/${id}/status`, { status });
    return data;
  },

  /**
   * Correct a client's profile — the whole of it since 0140: name, date of
   * birth, nationality, phone, residence and address. CORE-18.
   *
   * PARTIAL by design: only the fields present are written, so two screens
   * editing different things cannot overwrite one another with their own stale
   * copies. Send an empty string to clear an optional field; the API turns that
   * into NULL rather than storing a blank. The API answers 400 with `fields`
   * for a value its rules refuse, and 409 `PROFILE_LOCKED` with `fields` for
   * one the client's verification has locked.
   */
  async updateClientProfile(
    id: ClientRef,
    dto: components['schemas']['UpdateClientProfileDto'],
  ): Promise<ClientAccount> {
    const { data } = await apiClient.patch<ClientAccount>(`/admin/clients/${id}`, dto);
    return data;
  },

  /**
   * The countries and nationalities a client profile accepts — the SERVER's
   * lists, so the edit form cannot offer a value the profile then refuses.
   * Public on the API, the same for every reader.
   */
  async profileOptions(signal?: AbortSignal): Promise<components['schemas']['ProfileOptionsDto']> {
    const { data } = await apiClient.get<components['schemas']['ProfileOptionsDto']>(
      '/profile/options',
      { signal },
    );
    return data;
  },

  /**
   * Change the address a client signs in with.
   *
   * ## Separate call, separate permission, and that is the point
   *
   * It is not a field on `updateClientProfile` because it is not clerical work:
   * pointing an account at a different inbox and running a password reset takes
   * the account over. The API gates it on `clients.email` rather than
   * `clients.edit`, and the UI must gate the control the same way — see
   * `ChangeClientEmailDialog`, which spells the consequences out before the
   * operator commits.
   *
   * On success the client's portal sessions are revoked and their address is
   * unverified until they click the new link, so anything showing
   * `emailVerified` has to be refetched.
   */
  async changeClientEmail(id: ClientRef, email: string): Promise<ClientAccount> {
    const { data } = await apiClient.patch<ClientAccount>(`/admin/clients/${id}/email`, { email });
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

  async getClientTags(clientId: ClientRef, signal?: AbortSignal): Promise<ClientTag[]> {
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
  /**
   * Any tag, on a client you can see. A change that takes the client out of
   * YOUR territory answers 409 TAG_CHANGE_LEAVES_SCOPE until it is resent with
   * `confirmLeavesScope` — see `useClientTagToggle`.
   */
  async assignTag(
    clientId: ClientRef,
    tagId: string,
    options: { confirmLeavesScope?: boolean } = {},
  ): Promise<ClientTagChangeResult> {
    const { data } = await apiClient.post<ClientTagChangeResult>(
      `/admin/clients/${clientId}/tags/${tagId}`,
      undefined,
      { params: options.confirmLeavesScope ? { confirmLeavesScope: 'true' } : undefined },
    );
    return data;
  },

  async unassignTag(
    clientId: ClientRef,
    tagId: string,
    options: { confirmLeavesScope?: boolean } = {},
  ): Promise<ClientTagChangeResult> {
    const { data } = await apiClient.delete<ClientTagChangeResult>(
      `/admin/clients/${clientId}/tags/${tagId}`,
      { params: options.confirmLeavesScope ? { confirmLeavesScope: 'true' } : undefined },
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

  /**
   * The MT5 groups an account may be opened in, read live from the server.
   *
   * Not cached and not hardcoded: the list is the broker's configuration and
   * changes without telling us. A stale dropdown opens accounts in a group that
   * no longer exists, which MT5 refuses with an error nobody can act on.
   */
  async getMt5Groups(signal?: AbortSignal): Promise<Mt5Group[]> {
    const { data } = await apiClient.get<Mt5Group[]>('/admin/mt5/groups', { signal });
    return data;
  },

  /**
   * Open an MT5 account for a client.
   *
   * The response carries the master and investor passwords. They are returned
   * once and stored nowhere, so whatever calls this must show them before it
   * navigates away.
   */
  /** One MT5 login, for linking it to a client — read-only. */
  async lookupMt5Account(login: string, signal?: AbortSignal): Promise<Mt5AccountLookup> {
    const { data } = await apiClient.get<Mt5AccountLookup>(
      `/admin/mt5/accounts/${encodeURIComponent(login)}`,
      { signal },
    );
    return data;
  },

  /** Link a login MT5 already has to a client, with its product. */
  async linkMt5Account(body: {
    userId: number;
    login: string;
    productId?: string;
  }): Promise<LinkedMt5Account> {
    const { data } = await apiClient.post<LinkedMt5Account>('/admin/trading-accounts/link', body);
    return data;
  },

  /**
   * Bring MT5's accounts into the CRM now: each login the CRM lacks is recorded
   * with no client. A batch; the scheduled sync (every ten minutes) takes the rest.
   */
  async syncMt5Accounts(): Promise<Mt5AccountsSyncRun> {
    const { data } = await apiClient.post<Mt5AccountsSyncRun>('/admin/trading-accounts/sync');
    return data;
  },

  /** Set, change or clear (null) the product an account's trades pay under. */
  async setTradingAccountProduct(accountId: string, productId: string | null): Promise<void> {
    await apiClient.patch(`/admin/trading-accounts/${accountId}/product`, { productId });
  },

  async createTradingAccount(dto: CreateMt5AccountDto): Promise<CreatedMt5Account> {
    const { data } = await apiClient.post<CreatedMt5Account>('/admin/trading-accounts', dto);
    return data;
  },

  /*
   * `adjustTradingBalance` USED TO BE HERE, posting to
   * `/admin/trading-accounts/:id/balance`.
   *
   * Both are gone. It was the DEALER operation: it moved the MT5 balance with
   * no wallet leg and no ledger entry, which made it the one money action in
   * the console that left no trace an operator or auditor could follow. It sat
   * in the same row menu as `fundTradingAccount`, doing the visibly same thing,
   * and the difference between them was invisible until somebody went looking
   * for a movement that was not there.
   *
   * Its one good idea survives in `FundTradingAccountDto`: the amount is
   * UNSIGNED and a separate `direction` carries the sign, because two sources of
   * truth for a direction is how a withdrawal becomes a deposit.
   */

  /**
   * Move money on a client's trading account by hand — the ONLY way to.
   *
   * ## ⚠️ `adjustTradingBalance` IS GONE, and this replaced it
   *
   * That one moved the MT5 balance alone: no wallet leg, no ledger entry,
   * nothing on the client's statement. It gave the console a second money
   * control that recorded nothing, and money moved through it could not
   * afterwards be explained by anybody reading the ledger.
   *
   * This one always records. `deposit` credits the wallet and transfers to the
   * account; `withdraw` transfers off the account and the wallet keeps the
   * money. Neither is a payout — nothing leaves the platform on either.
   *
   * ## No currency, no userId
   *
   * Both are derived server-side from the account: transfers do not convert, so
   * the wallet currency MUST be the account's, and the owner is implied. Sending
   * either would let the caller disagree with the account.
   *
   * ## `key` is idempotency, and it only reaches the DATABASE one way
   *
   * On a DEPOSIT it is stored as the credit's `provider_ref` under
   * `UNIQUE(provider, provider_ref)`, so a double-submitted form converges on
   * one movement in the database. A WITHDRAWAL writes no transaction row, so
   * there is no such index to converge on: protection there is the executor's
   * idempotency on the transfer id plus the dialog disabling its button in
   * flight. Pass a value identifying the INTENT either way.
   */
  async fundTradingAccount(
    id: string,
    body: { amount: string; reason: string; direction: 'deposit' | 'withdraw' },
    key: string,
  ): Promise<FundTradingAccountResult> {
    const { data } = await apiClient.post<FundTradingAccountResult>(
      `/admin/trading-accounts/${id}/fund`,
      body,
      idempotent(key),
    );
    return data;
  },

  /*
   * `getLiveBalances` USED TO BE HERE.
   *
   * It posted the page's account ids and the API made one bridge call per
   * account. Every MT5 call is serialised behind the bridge's single session
   * lock, so rendering the table queued twenty-five acquisitions and starved the
   * connection supervisor that needs the same lock to reconnect.
   *
   * `balance` is now a mirror the bridge refreshes on its sweep, served straight
   * from the list endpoint with `balanceSyncedAt` beside it. The single-account
   * live read below stays — one call, on the screen where somebody is looking at
   * one account, and the only place equity and margin come from.
   */

  /**
   * Live balance and margin from MT5, rather than the cached `balance` column.
   *
   * Null when the account has no MT5 login yet.
   */
  async getTradingAccountLive(id: string, signal?: AbortSignal): Promise<Mt5LiveSnapshot | null> {
    const { data } = await apiClient.get<Mt5LiveSnapshot | null>(
      `/admin/trading-accounts/${id}/live`,
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

  // ── Notifications — the bell ─────────────────────────────────────────────
  // Own-feed reads: the recipient is the session, so there is no id or filter
  // to pass beyond paging. `cursor`/`limit` are accepted now so a later
  // load-more is a UI-only change.
  async getNotifications(
    params: { cursor?: string; limit?: number } = {},
    signal?: AbortSignal,
  ): Promise<AdminNotificationPage> {
    const query = new URLSearchParams();
    if (params.cursor) query.set('cursor', params.cursor);
    if (params.limit) query.set('limit', String(params.limit));
    const { data } = await apiClient.get<AdminNotificationPage>(
      `/admin/notifications?${query.toString()}`,
      { signal },
    );
    return data;
  },

  async getNotificationsUnreadCount(signal?: AbortSignal): Promise<NotificationUnreadCount> {
    const { data } = await apiClient.get<NotificationUnreadCount>(
      '/admin/notifications/unread-count',
      { signal },
    );
    return data;
  },

  async markNotificationRead(id: string): Promise<AdminNotification> {
    const { data } = await apiClient.post<AdminNotification>(`/admin/notifications/${id}/read`);
    return data;
  },

  async markAllNotificationsRead(): Promise<NotificationsMarkAllRead> {
    const { data } = await apiClient.post<NotificationsMarkAllRead>(
      '/admin/notifications/read-all',
    );
    return data;
  },
};
