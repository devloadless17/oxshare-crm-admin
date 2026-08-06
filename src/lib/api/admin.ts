import { apiClient } from './client';
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
export type IpAllowlistStatus = components['schemas']['IpAllowlistStatusDto'];
export type IpAllowlistRule = components['schemas']['IpAllowlistRuleDto'];
export type KycSubmission = components['schemas']['KycSubmissionDto'];
export type KycListResponse = components['schemas']['KycListResponseDto'];
export type ClientRow = components['schemas']['ClientRowDto'];
export type ClientListResponse = components['schemas']['ClientListResponseDto'];
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
  cursor?: string;
  q?: string;
  type?: string;
  status?: string;
  level?: string;
  country?: string;
  /** Tag SLUG, not id — a rename must not break a link somebody saved. */
  tag?: string;
  sort?: ClientSortKey;
  order?: 'asc' | 'desc';
}

/**
 * Query string for the client list. Exported for its own unit test.
 *
 * Empty values are OMITTED rather than sent blank: `?country=` reaches the API
 * as an empty string, and a filter that is present-but-empty is a different
 * request from one that is absent.
 */
export function clientListSearchParams(params: ClientListParams): URLSearchParams {
  const query = new URLSearchParams();
  query.set('limit', String(params.limit));
  for (const [key, value] of Object.entries(params)) {
    if (key === 'limit') continue;
    if (typeof value === 'string' && value !== '') query.set(key, value);
  }
  return query;
}
export type AuditEntry = components['schemas']['AuditEntryDto'];
export type AuditListResponse = components['schemas']['AuditListResponseDto'];
export type AuditAction = components['schemas']['AuditActionDto'];

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
    params: { status?: IbApplicationStatus; page?: number; limit?: number },
    signal?: AbortSignal,
  ): Promise<IbApplicationPage> {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
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

  // RBAC-08 — the admin IP allowlist.
  async getIpAllowlist(): Promise<IpAllowlistStatus> {
    const { data } = await apiClient.get<IpAllowlistStatus>('/admin/ip-allowlist');
    return data;
  },

  async addIpAllowlistRule(dto: { cidr: string; label: string }): Promise<IpAllowlistStatus> {
    const { data } = await apiClient.post<IpAllowlistStatus>('/admin/ip-allowlist', dto);
    return data;
  },

  async removeIpAllowlistRule(id: string) {
    const { data } = await apiClient.delete<{ message: string }>(`/admin/ip-allowlist/${id}`);
    return data;
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
