'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowLeft,
  CandlestickChart,
  FileText,
  Handshake,
  History,
  Network,
  User,
  Users,
  Wallet,
} from 'lucide-react';
import api from '@/lib/api';
import type { ClientProfile, IbPartnerDetail } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { apiErrorCode, apiErrorMessage } from '@/lib/api/errors';
import { AsyncBoundary } from '@/components/async-boundary';
import { CopyableId } from '@/components/copyable-id';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { Tabs, TabPanel, type TabDefinition } from '@/components/ui/tabs';
import { ToggleList } from '@/components/ui/toggle-list';
import { ClientTagChips } from '@/components/clients/client-tag-chips';
import { ClientWalletsPanel } from '@/components/clients/profile/client-wallets-panel';
import { ClientActionsMenu } from '@/components/clients/profile/client-actions-menu';
import {
  ChangeClientEmailDialog,
  EditClientProfileDialog,
} from '@/components/clients/profile/client-edit-dialogs';
import { ClientPartnerPanel } from '@/components/clients/profile/client-partner-panel';
import {
  ClientClosedPositionsPanel,
  ClientTransactionsPanel,
} from '@/components/clients/profile/client-activity-panels';
import { ClientNetworkTree } from '@/components/clients/profile/client-network-tree';
import {
  RecordReferrerDialog,
  refusalMessage,
} from '@/components/clients/profile/record-referrer-dialog';
import { ReferredTabPanels } from '@/components/clients/profile/client-referred-panels';
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
import { clientLabel } from '@/components/clients/client-identity';
import { PermittedLink } from '@/components/permitted-link';
import { keys } from '@/lib/query-keys';
import { isMasked } from '@/lib/masking';
import { formatDateOfBirth } from '@/lib/profile';
import { formatPhone } from '@/components/ui/phone-input';

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
// A partner's book in full (owner, 26 Sep 2026) — only for a partner, like the Partner tab.
const TAB_REFERRED_CLIENTS = 'referred-clients';
const TAB_REFERRED_ACCOUNTS = 'referred-accounts';

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
  /*
   * Its OWN key, not `clients.edit`. Recording who introduced a client decides
   * who is paid commission on their future trading — that is not the same power
   * as correcting a surname, and an operator holding one should not silently
   * hold the other.
   */
  const canRecordReferrer = hasPermission(admin, 'clients.referrer.set');
  const canViewWallets = hasPermission(admin, 'wallets.view');
  const canViewClients = hasPermission(admin, 'clients.view');
  const canAssignTags = hasPermission(admin, 'clients.tag');

  const [tab, setTab] = React.useState(TAB_OVERVIEW);
  const [tagsOpen, setTagsOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [emailOpen, setEmailOpen] = React.useState(false);
  const [showRecordReferrer, setShowRecordReferrer] = React.useState(false);
  const [referrerLoading, setReferrerLoading] = React.useState(false);
  const [referrerError, setReferrerError] = React.useState('');

  const query = useResource<ClientProfile>(keys.clients.detail(clientId), (signal) =>
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
    keys.clients.partner(clientId),
    (signal) => api.admin.getPartnerDetail(clientId, signal),
    { enabled: canViewPartners },
  );

  const tagsQuery = useResource(keys.tags.all(), (signal) => api.admin.getTags(signal), {
    enabled: canAssignTags,
  });

  const recordReferrer = async (referralCode: string) => {
    setReferrerLoading(true);
    setReferrerError('');
    try {
      await api.patch(`/admin/clients/${clientId}/referrer`, { referralCode });
      /*
       * Both roots. The profile carries the new referrer, and the LIST renders a
       * derived type that moves with it — `DERIVED_CLIENT_TYPE` reads
       * `referred_by_ib_user_id`, so recording a partner turns an `individual`
       * into a `referral` on every row that shows one.
       */
      await queryClient.invalidateQueries({ queryKey: keys.clients.all() });
      setShowRecordReferrer(false);
      toastSuccess(t('clientProfile.recordReferrerDone'));
    } catch (e: unknown) {
      /*
       * The API gives each refusal its own CODE because they share a status and
       * not a meaning. `REFERRAL_PARTNER_INACTIVE` in particular says the client
       * gave the RIGHT code and the partner is suspended — a different
       * conversation from "check the spelling", and the reason the three are not
       * one 400. Falling back to the API's own sentence keeps a code we have not
       * mapped readable rather than swallowing it.
       */
      setReferrerError(
        refusalMessage(
          apiErrorCode(e),
          apiErrorMessage(e, t('clientProfile.recordReferrerFailed')),
        ),
      );
    } finally {
      setReferrerLoading(false);
    }
  };

  const toggleTag = useMutation({
    mutationFn: ({ tagId, attached }: { tagId: string; attached: boolean }) =>
      attached ? api.admin.unassignTag(clientId, tagId) : api.admin.assignTag(clientId, tagId),
    onSuccess: async (_data, { tagId, attached }) => {
      // Also the tags screen: `getTags` returns ClientTagWithCount, so
      // attaching or detaching moves a number an operator reads elsewhere.
      // And `clients.all()`, because the list renders each client's tags.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.clients.all() }),
        queryClient.invalidateQueries({ queryKey: keys.tags.all() }),
      ]);
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
  const displayName = profile ? clientLabel(profile, t('clients.unnamed')) : t('clients.unnamed');

  /*
   * Is there ANY of this person's name left to show?
   *
   * `client.firstName` and `client.lastName` are separate catalog entries, and
   * the server strips exactly the one that was masked — so `displayName` above
   * already holds only the permitted halves. The heading used to wrap it in a
   * `Field` keyed on `client.firstName` alone, which replaced the WHOLE name
   * with the redaction chip the moment the first name was hidden, taking a
   * surname the viewer was entitled to read with it. Reported.
   */
  const nameFullyMasked =
    isMasked('client.firstName', profile?.maskedFields) &&
    isMasked('client.lastName', profile?.maskedFields);

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
    // Only for a client who IS a partner — see the header note — and their book.
    ...(partner
      ? [
          {
            value: TAB_PARTNER,
            label: t('clientProfile.tabPartner'),
            icon: <Handshake className="h-3.5 w-3.5" />,
          },
          ...(canViewClients
            ? [
                {
                  value: TAB_REFERRED_CLIENTS,
                  label: t('clientProfile.tabReferredClients'),
                  icon: <Users className="h-3.5 w-3.5" />,
                },
              ]
            : []),
          ...(canViewTrading
            ? [
                {
                  value: TAB_REFERRED_ACCOUNTS,
                  label: t('clientProfile.tabReferredAccounts'),
                  icon: <CandlestickChart className="h-3.5 w-3.5" />,
                },
              ]
            : []),
        ]
      : []),
    {
      value: TAB_NETWORK,
      label: t('clientProfile.tabNetwork'),
      icon: <Network className="h-3.5 w-3.5" />,
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
                    {/*
                      The chip only when nothing of the name survives the mask;
                      otherwise the halves the viewer may actually see.
                    */}
                    {nameFullyMasked ? (
                      <Field label="" field="client.firstName" profile={profile} />
                    ) : (
                      displayName
                    )}
                  </h1>
                  {/* A div, not a <p>: `Field` renders a block element, and a <div>
                      inside a <p> is invalid HTML that React reports as a
                      hydration error on every load of this page. */}
                  <div className="mt-1 text-sm text-muted-foreground">
                    <Field label="" field="client.email" profile={profile} />
                  </div>
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
                    {/* Tags join the chip row only when there are some. "None" and
                        "hidden from you" are stated by the Tags card below; here
                        they rendered as a lone dash trailing the badges. */}
                    {profile.tags && profile.tags.length > 0 && (
                      <ClientTagChips tags={profile.tags} />
                    )}
                  </div>
                </div>

                <ClientActionsMenu
                  profile={profile}
                  partner={partner}
                  onManageTags={() => setTagsOpen(true)}
                  onEditProfile={() => setEditOpen(true)}
                  onChangeEmail={() => setEmailOpen(true)}
                  // A tab move, not a link — the menu sits above every tab.
                  onShowReferred={
                    partner && canViewClients ? () => setTab(TAB_REFERRED_CLIENTS) : undefined
                  }
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
                      label={t('clientProfile.fieldClientId')}
                      field="client.id"
                      profile={profile}
                    >
                      {/* The FULL uuid — this is the screen an operator quotes
                          it from, so no truncation here. */}
                      <CopyableId
                        value={String(profile.portalId)}
                        full
                        copyLabel={t('common.copyPortalId')}
                      />
                    </Field>
                    <Field
                      label={t('clients.colCountry')}
                      field="client.country"
                      profile={profile}
                    />
                    <Field
                      label={t('clientProfile.fieldPhone')}
                      field="client.phone"
                      profile={profile}
                    >
                      {/* Grouped for reading — `+961 70 123 456`, not an unbroken run. */}
                      {formatPhone(profile.phone) || '—'}
                    </Field>
                    {/* The rest of the ONE profile (0139) — the same record the
                        client's KYC form shows them. One row per field, so each
                        is masked on its own key. */}
                    <Field
                      label={t('clientProfile.fieldDateOfBirth')}
                      field="client.dateOfBirth"
                      profile={profile}
                    >
                      {formatDateOfBirth(profile.dateOfBirth)}
                    </Field>
                    <Field
                      label={t('clientProfile.fieldNationality')}
                      field="client.nationality"
                      profile={profile}
                    />
                    <Field
                      label={t('clientProfile.fieldAddress')}
                      field="client.address"
                      profile={profile}
                    />
                    <Field
                      label={t('clientProfile.fieldCity')}
                      field="client.city"
                      profile={profile}
                    />
                    <Field
                      label={t('clientProfile.fieldPostalCode')}
                      field="client.postalCode"
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
                          <span className="font-mono text-xs">
                            {account.mt5Login ?? t('clientProfile.loginPending')}
                          </span>
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
                            href={`/kyc/${profile.portalId}`}
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
                  {/* No currency passed: earnings arrive one line per
                      currency, each carrying its own. */}
                  <ClientPartnerPanel detail={partner} />
                </AsyncBoundary>
              </TabPanel>
            )}

            {partner && (
              <ReferredTabPanels
                activeTab={tab}
                partnerPortalId={profile.portalId}
                clients={canViewClients ? TAB_REFERRED_CLIENTS : undefined}
                accounts={canViewTrading ? TAB_REFERRED_ACCOUNTS : undefined}
              />
            )}

            {canViewTrading && (
              <TabPanel
                value={TAB_POSITIONS}
                activeValue={tab}
                idPrefix="client-profile"
                className="flex min-h-0 flex-1 flex-col"
              >
                {/*
                  CLOSED positions only, for every client type (owner, 26 Sep
                  2026). The table fills the tab's height on its own.
                */}
                <section className="flex min-h-0 flex-1 flex-col gap-2">
                  <h2 className="shrink-0 text-xs font-bold tracking-wider text-muted-foreground uppercase">
                    {t('clientProfile.posClosedTitle')}
                  </h2>
                  <ClientClosedPositionsPanel userId={profile.id} />
                </section>
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
                      rootPortalId={profile.portalId}
                      rootName={displayName}
                      partner={partner}
                      referredClients={profile.referredClients}
                      referredShown={profile.referredShown}
                      referredTotal={profile.referredTotal}
                      referredOutsideScope={profile.referredOutsideScope}
                    />

                    <ProfileCard title={t('clientProfile.parentIb')}>
                      {profile.referrer?.outsideTerritory ? (
                        /*
                          The introducer exists and this reader may not see who
                          they are. Rendering the name fields would print an
                          empty link, because the API omits them — and falling
                          through to `noParentIb` would assert the false
                          sentence the scoped referrer fix exists to avoid.
                        */
                        <p className="text-sm text-muted-foreground">
                          {t('clientProfile.parentIbOutsideTerritory')}
                          {!profile.referrer.active && (
                            <Badge variant="warning" className="ms-2">
                              {t('clientProfile.attributionInactive')}
                            </Badge>
                          )}
                        </p>
                      ) : profile.referrer ? (
                        <p className="text-sm">
                          <PermittedLink
                            href={`/clients/${profile.referrer.portalId}`}
                            className="text-link hover:underline focus-outline"
                          >
                            {/*
                              NEVER an empty link. A role that masks the
                              partner's name leaves both fields undefined, and
                              this printed nothing at all — reported from
                              production as "this client has no IB" when the IB
                              was there, in territory, with only their name
                              hidden. clientLabel falls through to the Portal
                              ID, which no role can mask.
                            */}
                            {clientLabel(profile.referrer)}
                          </PermittedLink>
                          {!profile.referrer.active && (
                            <Badge variant="warning" className="ms-2">
                              {t('clientProfile.attributionInactive')}
                            </Badge>
                          )}
                        </p>
                      ) : (
                        <>
                          <EmptySection message={t('clientProfile.noParentIb')} />
                          {/*
                            Offered only where there is NOTHING to change. This
                            reads as "no partner is recorded, and here is how to
                            record one" rather than as an edit control on an
                            existing relationship — which the API refuses anyway
                            with a 409, so this condition is convenience and not
                            the guarantee.
                          */}
                          {canRecordReferrer && (
                            <button
                              type="button"
                              onClick={() => {
                                setReferrerError('');
                                setShowRecordReferrer(true);
                              }}
                              className="mt-2 text-xs font-semibold text-link hover:underline focus-outline"
                            >
                              {t('clientProfile.recordReferrer')}
                            </button>
                          )}
                        </>
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

            {/* CORE-18. Two dialogs, because the two edits sit behind two
                permissions — see client-edit-dialogs.tsx.

                Mounted for EVERY client. They used to sit inside the
                `partner &&` block below, so for an ordinary individual client —
                the overwhelming majority — the actions menu offered "Edit
                profile" and "Change email" (it gates on `clients.edit` /
                `clients.email`, not on partner status), the click set state,
                and nothing rendered. The two partner-only dialogs stay where
                they are; these two belong to the profile, not to the rung. */}
            <EditClientProfileDialog
              open={editOpen}
              onClose={() => setEditOpen(false)}
              profile={profile}
            />

            <ChangeClientEmailDialog
              open={emailOpen}
              onClose={() => setEmailOpen(false)}
              profile={profile}
            />

            {showRecordReferrer && (
              <RecordReferrerDialog
                clientName={displayName}
                loading={referrerLoading}
                error={referrerError}
                onCancel={() => !referrerLoading && setShowRecordReferrer(false)}
                onConfirm={recordReferrer}
              />
            )}
          </div>
        )}
      </AsyncBoundary>
    </div>
  );
}
