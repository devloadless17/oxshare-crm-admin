'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Activity, ArrowLeft, FileText, Handshake, History, User, Wallet } from 'lucide-react';
import api from '@/lib/api';
import type { ClientProfile, IbPartnerDetail } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { apiErrorCode } from '@/lib/api/errors';
import { AsyncBoundary } from '@/components/async-boundary';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { Tabs, TabPanel, type TabDefinition } from '@/components/ui/tabs';
import { ToggleList } from '@/components/ui/toggle-list';
import { ClientTagChips } from '@/components/clients/client-tag-chips';
import { ClientWalletsPanel } from '@/components/clients/profile/client-wallets-panel';
import { ClientActionsMenu } from '@/components/clients/profile/client-actions-menu';
import { ClientPartnerPanel } from '@/components/clients/profile/client-partner-panel';
import {
  ClientPositionsPanel,
  ClientTransactionsPanel,
} from '@/components/clients/profile/client-activity-panels';
import { ClientNetworkTree } from '@/components/clients/profile/client-network-tree';
import {
  ChangeLevelDialog,
  ReassignParentDialog,
} from '@/components/clients/profile/client-partner-dialogs';
import {
  ClientNotFound,
  EmptySection,
  Field,
  KycStatusBadge,
  ProfileCard,
} from '@/components/clients/profile/profile-cards';
import { buildKycDocUrl } from '@/lib/kyc-doc-url';
import { toastError, toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';
import { PermittedLink } from '@/components/permitted-link';

/**
 * FR-ADM-01's full client profile.
 *
 * ── Three kinds of absence, and none of them may look like another ──────────
 *
 *   the section key is missing   → you lack the permission        ("hidden")
 *   the section is present, empty → this client has none          ("none yet")
 *   a FIELD key is missing        → masked from you               ("••••")
 *
 * Collapsing any pair produces a screen that makes claims about the CLIENT
 * which are really claims about the VIEWER — and somebody acts on it.
 *
 * ── Why this is TABBED, and why the tabs differ per client ──────────────────
 *
 * The screen was one grid of eight cards, which is the right shape for an
 * individual client and the wrong one for a partner: a partner's standing, their
 * agency, their line and their earnings are four more panels again, and stacking
 * them made the compliance sections — the reason most people open this screen —
 * sit below two screens of partner detail.
 *
 * So the sections are grouped, and the PARTNER TAB IS ABSENT for a client who is
 * not one, rather than rendered empty. That is the same rule as the permission
 * cards above, applied to the subject instead of the viewer: an empty "Partner"
 * tab on an individual client invites the question of whether the data failed to
 * load.
 *
 * `partner === null` is the ordinary answer here — most clients are not
 * partners — which is why the query treats it as data rather than as an error.
 */
const TAB_OVERVIEW = 'overview';
const TAB_MONEY = 'money';
const TAB_PARTNER = 'partner';
const TAB_POSITIONS = 'positions';
const TAB_HISTORY = 'history';
const TAB_NETWORK = 'network';

export default function ClientProfilePage() {
  const params = useParams<{ id: string }>();
  const clientId = params.id;
  const { admin } = useAdmin();
  const queryClient = useQueryClient();

  const canViewKyc = hasPermission(admin, 'kyc.view') || hasPermission(admin, 'kyc.review');
  const canViewDocs =
    hasPermission(admin, 'kyc.documents.view') || hasPermission(admin, 'kyc.review');
  const canViewTrading = hasPermission(admin, 'trading.view');
  const canViewPartners = hasPermission(admin, 'ib.view');
  const canViewWallets = hasPermission(admin, 'wallets.view');
  const canAssignTags = hasPermission(admin, 'clients.tag');

  const [tab, setTab] = React.useState(TAB_OVERVIEW);
  const [tagsOpen, setTagsOpen] = React.useState(false);
  const [levelOpen, setLevelOpen] = React.useState(false);
  const [parentOpen, setParentOpen] = React.useState(false);

  const query = useResource<ClientProfile>(['client', clientId], (signal) =>
    api.admin.getClient(clientId, signal),
  );

  /*
   * The partner side, as its OWN request.
   *
   * `GET /admin/clients/:id` returns identity and compliance; partner standing
   * lives behind `ib.view` on a different controller. Fetching it separately
   * means an admin without that key still gets the profile they are entitled to
   * rather than a failed page — the same reasoning the wallets panel already
   * carries.
   *
   * `null` for a non-partner is DATA, not an error: the endpoint answers 200
   * with a null body, so `resource.data` is null and the tab simply does not
   * appear.
   */
  const partnerQuery = useResource<IbPartnerDetail | null>(
    ['client', clientId, 'partner'],
    (signal) => api.admin.getPartnerDetail(clientId, signal),
    { enabled: canViewPartners },
  );

  const tagsQuery = useResource(['tags'], (signal) => api.admin.getTags(signal), {
    enabled: canAssignTags,
  });

  const toggleTag = useMutation({
    mutationFn: ({ tagId, attached }: { tagId: string; attached: boolean }) =>
      attached ? api.admin.unassignTag(clientId, tagId) : api.admin.assignTag(clientId, tagId),
    onSuccess: async (_data, { tagId, attached }) => {
      await queryClient.invalidateQueries({ queryKey: ['client', clientId] });
      const label = (tagsQuery.data ?? []).find((tag) => tag.id === tagId)?.label ?? tagId;
      toastSuccess(
        attached
          ? t('clientProfile.tagRemoved', { label })
          : t('clientProfile.tagAdded', { label }),
      );
    },
    /*
     * A tag is an ACCESS-CONTROL primitive — `admin_client_tag_scopes` decides
     * which administrators may see this client — so the API refuses an
     * assignment that would take the client out of the operator's own scope.
     */
    onError: (error) => toastError(error, t('clientProfile.tagFailed')),
  });

  /*
   * 404 here means "no such client" OR "outside your tag scope", and the two are
   * INDISTINGUISHABLE on purpose — otherwise a scoped administrator could
   * enumerate the client base they were denied by trying uuids.
   *
   * Branched on the machine CODE (R-2.2), never on the status alone.
   */
  if (query.status === 'unavailable' && apiErrorCode(query.error) === 'CLIENT_NOT_FOUND') {
    return <ClientNotFound />;
  }

  const profile = query.data;
  const partner = partnerQuery.data ?? null;
  const attachedIds = new Set((profile?.tags ?? []).map((tag) => tag.id));
  const displayName =
    [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || t('clients.unnamed');

  const tabs: TabDefinition[] = [
    {
      value: TAB_OVERVIEW,
      label: t('clientProfile.tabOverview'),
      icon: <User className="h-3.5 w-3.5" />,
    },
    {
      value: TAB_MONEY,
      label: t('clientProfile.tabMoney'),
      icon: <Wallet className="h-3.5 w-3.5" />,
    },
    /*
     * Positions and History are shown for EVERY client type, partner or not.
     * What a client traded and what moved through their balance are questions
     * asked of an individual as often as of a partner — gating them on type
     * would hide the answer precisely when somebody is investigating an
     * ordinary complaint.
     */
    ...(canViewTrading
      ? [
          {
            value: TAB_POSITIONS,
            label: t('clientProfile.tabPositions'),
            icon: <Activity className="h-3.5 w-3.5" />,
          },
        ]
      : []),
    ...(canViewWallets
      ? [
          {
            value: TAB_HISTORY,
            label: t('clientProfile.tabHistory'),
            icon: <History className="h-3.5 w-3.5" />,
          },
        ]
      : []),
    // Only for a client who IS a partner — see the header note.
    ...(partner
      ? [
          {
            value: TAB_PARTNER,
            label: t('clientProfile.tabPartner'),
            icon: <Handshake className="h-3.5 w-3.5" />,
          },
        ]
      : []),
    {
      value: TAB_NETWORK,
      label: t('clientProfile.tabNetwork'),
      icon: <Handshake className="h-3.5 w-3.5" />,
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <Link
        href="/clients"
        className="focus-outline inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        {t('clientProfile.back')}
      </Link>

      <AsyncBoundary
        status={query.status}
        label={t('clientProfile.loading')}
        endpoints={['GET /admin/clients/:id']}
        onRetry={query.refetch}
        errorMessage={t('clientProfile.loadFailed')}
        error={query.error}
        // Passes the height through to the tabs below, and centres the four
        // non-ready states in the space rather than parking them under the
        // back link.
        fill
      >
        {profile && (
          /*
           * `gap-4`, not `gap-6`. A tab strip OWNS the panel beneath it, so the
           * two want to read as one control — 24px of air between the underline
           * and the first heading made the panel look like a separate section
           * that happened to follow.
           */
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <header className="shrink-0 rounded-xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <h1 className="text-2xl font-bold tracking-tight">
                    <Field label="" field="client.firstName" profile={profile}>
                      {displayName}
                    </Field>
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    <Field label="" field="client.email" profile={profile} />
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        profile.status === 'active'
                          ? 'success'
                          : profile.status === 'suspended'
                            ? 'destructive'
                            : 'warning'
                      }
                      className="capitalize"
                    >
                      {profile.status}
                    </Badge>
                    {/* The DERIVED type — partner beats referral beats
                        individual. The backend computes it from `ib_accounts`
                        and `referred_by_ib_user_id`, so it cannot disagree with
                        the partner tab beside it. */}
                    <Badge variant="outline" className="capitalize">
                      {profile.type}
                    </Badge>
                    {profile.verificationLevel >= 1 ? (
                      <Badge variant="success">{t('clients.levelVerified')}</Badge>
                    ) : (
                      <Badge variant="warning">{t('clients.levelUnverified')}</Badge>
                    )}
                    {partner && !partner.active && (
                      <Badge variant="warning">{t('clientProfile.partnerSuspended')}</Badge>
                    )}
                    <ClientTagChips tags={profile.tags} />
                  </div>
                </div>

                <ClientActionsMenu
                  profile={profile}
                  partner={partner}
                  onManageTags={() => setTagsOpen(true)}
                  onChangeLevel={() => setLevelOpen(true)}
                  onReassignParent={() => setParentOpen(true)}
                />
              </div>
            </header>

            <div className="shrink-0">
              <Tabs tabs={tabs} value={tab} onValueChange={setTab} idPrefix="client-profile" />
            </div>

            <TabPanel value={TAB_OVERVIEW} activeValue={tab} idPrefix="client-profile">
              <div className="grid gap-6 lg:grid-cols-2">
                <ProfileCard title={t('clientProfile.sectionIdentity')}>
                  <dl className="grid grid-cols-2 gap-4">
                    <Field
                      label={t('clients.colCountry')}
                      field="client.country"
                      profile={profile}
                    />
                    <Field
                      label={t('clientProfile.fieldPhone')}
                      field="client.phone"
                      profile={profile}
                    />
                    <Field
                      label={t('clients.colKycLevel')}
                      field="client.verificationLevel"
                      profile={profile}
                    >
                      {profile.verificationLevel >= 1
                        ? t('clients.levelVerified')
                        : t('clients.levelUnverified')}
                    </Field>
                    <Field
                      label={t('clients.colCreated')}
                      field="client.createdAt"
                      profile={profile}
                    >
                      {profile.createdAt ? new Date(profile.createdAt).toLocaleDateString() : '—'}
                    </Field>
                  </dl>
                </ProfileCard>

                <ProfileCard title={t('clientProfile.sectionTags')}>
                  <ClientTagChips tags={profile.tags} />
                </ProfileCard>

                <ProfileCard
                  title={t('clientProfile.sectionTrading')}
                  hiddenReason={canViewTrading ? undefined : t('clientProfile.tradingHidden')}
                >
                  {profile.tradingAccounts && profile.tradingAccounts.length > 0 ? (
                    <ul className="space-y-2">
                      {profile.tradingAccounts.map((account) => (
                        <li key={account.id} className="flex items-center justify-between gap-3">
                          <span className="font-mono text-xs">{account.mt5Login}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {account.mt5Group ?? '—'} · {account.environment}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptySection message={t('clientProfile.noTradingAccounts')} />
                  )}
                </ProfileCard>

                <ProfileCard
                  title={t('clientProfile.sectionKyc')}
                  hiddenReason={canViewKyc ? undefined : t('clientProfile.kycHidden')}
                >
                  {profile.kyc ? (
                    <dl className="grid grid-cols-2 gap-4">
                      <div>
                        <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {t('clientProfile.kycStatus')}
                        </dt>
                        <dd className="mt-1">
                          <KycStatusBadge status={profile.kyc.status} />
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {t('clientProfile.kycSubmitted')}
                        </dt>
                        <dd className="mt-0.5 text-sm">
                          {profile.kyc.submittedAt
                            ? new Date(profile.kyc.submittedAt).toLocaleDateString()
                            : '—'}
                        </dd>
                      </div>
                      {hasPermission(admin, 'kyc.review') && (
                        <div className="col-span-2">
                          <PermittedLink
                            href={`/kyc/${profile.id}`}
                            className="text-xs font-semibold text-link hover:underline focus-outline"
                          >
                            {t('clientProfile.openKycReview')}
                          </PermittedLink>
                        </div>
                      )}
                    </dl>
                  ) : (
                    <EmptySection message={t('clientProfile.noKyc')} />
                  )}
                </ProfileCard>

                <div id="documents">
                  <ProfileCard
                    title={t('clientProfile.sectionDocuments')}
                    hiddenReason={canViewDocs ? undefined : t('clientProfile.documentsHidden')}
                  >
                    {profile.documents && profile.documents.length > 0 ? (
                      <ul className="space-y-1.5">
                        {profile.documents.map((file) => (
                          <li key={file}>
                            {/*
                             * A LINK, never an inline image. Every fetch goes
                             * through GET /uploads/kyc/:file, which applies the
                             * client scope, checks the reader and writes the
                             * R-6.6 audit row. Embedding the bytes would route
                             * an audited PII read around its own audit.
                             */}
                            <a
                              href={buildKycDocUrl(file)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 font-mono text-[11px] text-link hover:underline focus-outline"
                            >
                              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                              {file}
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <EmptySection message={t('clientProfile.noDocuments')} />
                    )}
                  </ProfileCard>
                </div>
              </div>
            </TabPanel>

            <TabPanel
              value={TAB_MONEY}
              activeValue={tab}
              idPrefix="client-profile"
              /* The fill chain the tables need: `TabPanel` is a flex item of the
                 page column, and a `fill` DataTable resolves its height against
                 this. Without it the table is as tall as its rows and the empty
                 state collapses to a strip. */
              className="flex min-h-0 flex-1 flex-col"
            >
              {/* FULL WIDTH. A table of currencies, balances and a row menu has
                  nothing to sit beside, and half a page of columns wraps. */}
              {/*
                Its own component and its own request: `GET /admin/clients/:id`
                returns identity and compliance, not money, and the two are
                behind different permissions.
              */}
              <ClientWalletsPanel userId={profile.id} />
            </TabPanel>

            {partner && (
              <TabPanel value={TAB_PARTNER} activeValue={tab} idPrefix="client-profile">
                <AsyncBoundary
                  status={partnerQuery.status}
                  label={t('clientProfile.partnerLoading')}
                  endpoints={['GET /admin/ib/partners/:userId']}
                  onRetry={partnerQuery.refetch}
                  errorMessage={t('clientProfile.partnerLoadFailed')}
                  error={partnerQuery.error}
                >
                  {/* USD: the accrual rows carry their own currency and the
                      totals are summed across them, so this is the platform
                      default rather than a per-row value. */}
                  <ClientPartnerPanel detail={partner} currency="USD" />
                </AsyncBoundary>
              </TabPanel>
            )}

            {canViewTrading && (
              <TabPanel
                value={TAB_POSITIONS}
                activeValue={tab}
                idPrefix="client-profile"
                className="flex min-h-0 flex-1 flex-col"
              >
                {/*
                  TWO tables sharing the height, each filling its half.
                  `basis-0` with `flex-1` is what splits it evenly regardless of
                  how many rows either holds — otherwise a client with forty
                  closed trades and none open gives the open table one row of
                  height and the closed one everything else.
                */}
                <div className="flex min-h-0 flex-1 flex-col gap-6">
                  <section className="flex min-h-0 flex-1 basis-0 flex-col gap-2">
                    <h2 className="shrink-0 text-xs font-bold tracking-wider text-muted-foreground uppercase">
                      {t('clientProfile.posOpenTitle')}
                    </h2>
                    <ClientPositionsPanel userId={profile.id} status="open" />
                  </section>
                  <section className="flex min-h-0 flex-1 basis-0 flex-col gap-2">
                    <h2 className="shrink-0 text-xs font-bold tracking-wider text-muted-foreground uppercase">
                      {t('clientProfile.posClosedTitle')}
                    </h2>
                    <ClientPositionsPanel userId={profile.id} status="closed" />
                  </section>
                </div>
              </TabPanel>
            )}

            {canViewWallets && (
              <TabPanel
                value={TAB_HISTORY}
                activeValue={tab}
                idPrefix="client-profile"
                className="flex min-h-0 flex-1 flex-col"
              >
                <section className="flex min-h-0 flex-1 flex-col gap-2">
                  <h2 className="shrink-0 text-xs font-bold tracking-wider text-muted-foreground uppercase">
                    {t('clientProfile.txTitle')}
                  </h2>
                  <ClientTransactionsPanel userId={profile.id} />
                </section>
              </TabPanel>
            )}

            <TabPanel value={TAB_NETWORK} activeValue={tab} idPrefix="client-profile">
              {/* FULL WIDTH: a tree indents as it descends, so a half-page
                  column wraps names at exactly the depth that matters most. */}
              <div className="space-y-6">
                {canViewPartners ? (
                  <>
                    <ClientNetworkTree
                      rootUserId={profile.id}
                      rootName={displayName}
                      partner={partner}
                      referredClients={profile.referredClients}
                    />

                    <ProfileCard title={t('clientProfile.parentIb')}>
                      {profile.referrer ? (
                        <p className="text-sm">
                          <PermittedLink
                            href={`/clients/${profile.referrer.ibUserId}`}
                            className="text-link hover:underline focus-outline"
                          >
                            {[profile.referrer.firstName, profile.referrer.lastName]
                              .filter(Boolean)
                              .join(' ')}
                          </PermittedLink>
                          {!profile.referrer.active && (
                            <Badge variant="warning" className="ms-2">
                              {t('clientProfile.attributionInactive')}
                            </Badge>
                          )}
                        </p>
                      ) : (
                        <EmptySection message={t('clientProfile.noParentIb')} />
                      )}
                    </ProfileCard>
                  </>
                ) : (
                  <ProfileCard
                    title={t('clientProfile.sectionReferrals')}
                    hiddenReason={t('clientProfile.referralsHidden')}
                  >
                    {null}
                  </ProfileCard>
                )}
              </div>
            </TabPanel>

            {/* ── Dialogs, mounted once and opened from the actions menu ───── */}
            <Modal
              open={tagsOpen}
              onClose={() => setTagsOpen(false)}
              title={t('clientProfile.manageTagsTitle', { name: displayName })}
            >
              <div className="space-y-4">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t('clientProfile.manageTagsBody')}
                </p>
                <ClientTagChips tags={profile.tags} />
                <ToggleList
                  options={(tagsQuery.data ?? []).map((tag) => ({
                    value: tag.id,
                    label: tag.label,
                    hint: tag.slug,
                  }))}
                  selected={[...attachedIds]}
                  onToggle={(tagId) =>
                    toggleTag.mutate({ tagId, attached: attachedIds.has(tagId) })
                  }
                  disabled={toggleTag.isPending}
                  emptyMessage={t('clientProfile.noTagsAvailable')}
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setTagsOpen(false)}
                    className="inline-flex h-9 items-center rounded-lg border border-border px-4 text-xs font-semibold hover:bg-muted focus-outline"
                  >
                    {t('clientProfile.done')}
                  </button>
                </div>
              </div>
            </Modal>

            {partner && (
              <>
                <ChangeLevelDialog
                  open={levelOpen}
                  onClose={() => setLevelOpen(false)}
                  partner={partner}
                  name={displayName}
                />
                <ReassignParentDialog
                  open={parentOpen}
                  onClose={() => setParentOpen(false)}
                  partner={partner}
                  name={displayName}
                />
              </>
            )}
          </div>
        )}
      </AsyncBoundary>
    </div>
  );
}
