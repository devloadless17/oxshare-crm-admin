'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowLeft,
  ArrowLeftRight,
  CandlestickChart,
  FileText,
  Handshake,
  LineChart,
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
import { useClientTagToggle } from '@/components/clients/profile/use-client-tag-toggle';
import { ClientClosedPositionsPanel } from '@/components/clients/profile/client-activity-panels';
import { ClientAccountsPanel } from '@/components/clients/profile/client-accounts-panel';
import { ClientOverview } from '@/components/clients/profile/client-overview';
import { LinkAccountDialog } from '@/components/trading/link-account-dialog';
import { ClientTransactionsTab } from '@/components/clients/profile/client-transactions-tab';
import { ClientDocumentsPanel } from '@/components/clients/profile/client-documents-panel';
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
  ProfileCard,
} from '@/components/clients/profile/profile-cards';
import { toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';
import { clientLabel } from '@/components/clients/client-identity';
import { PermittedLink } from '@/components/permitted-link';
import { keys } from '@/lib/query-keys';
import { isMasked } from '@/lib/masking';

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
/*
 * The owner's three (29 Sep 2026): the client's MT5 ACCOUNTS beside their
 * wallets; TRANSACTIONS — deposits, withdrawals and transfers as sub-tabs, each
 * with filters, sorting and a Details view — which replaced History; and every
 * DOCUMENT they handed over, KYC and deposit receipts alike, with its status.
 */
const TAB_ACCOUNTS = 'accounts';
const TAB_TRANSACTIONS = 'transactions';
const TAB_DOCUMENTS = 'documents';
const TAB_NETWORK = 'network';
// A partner's book in full (owner, 26 Sep 2026) — only for a partner, like the Partner tab.
const TAB_REFERRED_CLIENTS = 'referred-clients';
const TAB_REFERRED_ACCOUNTS = 'referred-accounts';

export default function ClientProfilePage() {
  const params = useParams<{ id: string }>();
  const clientId = params.id;
  const { admin } = useAdmin();
  const queryClient = useQueryClient();

  const canViewTrading = hasPermission(admin, 'trading.view');
  const canViewPartners = hasPermission(admin, 'ib.view');
  /*
   * Its OWN key, not `clients.edit`. Recording who introduced a client decides
   * who is paid commission on their future trading — that is not the same power
   * as correcting a surname, and an operator holding one should not silently
   * hold the other.
   */
  const canRecordReferrer = hasPermission(admin, 'clients.referrer.set');
  // The Financial list's key — the Transactions tab reads it, filtered to this client.
  const canViewTransactions = hasPermission(admin, 'transactions.view');
  const canViewClients = hasPermission(admin, 'clients.view');
  const canAssignTags = hasPermission(admin, 'clients.tag');

  const [tab, setTab] = React.useState(TAB_OVERVIEW);
  const [tagsOpen, setTagsOpen] = React.useState(false);
  const [linkOpen, setLinkOpen] = React.useState(false);
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

  /*
   * Any tag, on a client you can see — a change that would take the client out
   * of YOUR territory is asked first, and a hand-off leaves the page. See the
   * hook.
   */
  const tagToggle = useClientTagToggle({
    clientId,
    portalId: query.data?.portalId,
    labelOf: (tagId) => (tagsQuery.data ?? []).find((tag) => tag.id === tagId)?.label ?? tagId,
    onHandedOver: () => setTagsOpen(false),
  });

  /*
   * 404 here means "no such client" OR "outside your tag scope", and the two are
   * INDISTINGUISHABLE on purpose — otherwise a scoped administrator could
   * enumerate the client base they were denied by trying uuids.
   *
   * Branched on the machine CODE (R-2.2), never on the status alone.
   */
  if (query.status === 'notFound') {
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
    // Beside Wallets: what the client holds on the MT5 side, and nobody else's.
    ...(canViewTrading
      ? [
          {
            value: TAB_ACCOUNTS,
            label: t('clientProfile.tabAccounts'),
            icon: <LineChart className="h-3.5 w-3.5" />,
          },
        ]
      : []),
    ...(canViewTransactions
      ? [
          {
            value: TAB_TRANSACTIONS,
            label: t('clientProfile.tabTransactions'),
            icon: <ArrowLeftRight className="h-3.5 w-3.5" />,
          },
        ]
      : []),
    /*
     * For every reader who may open the profile: the endpoint withholds each
     * half (KYC, receipts) behind its own permission and SAYS which, so the tab
     * never shows an empty list that means "hidden".
     */
    {
      value: TAB_DOCUMENTS,
      label: t('clientProfile.tabDocuments'),
      icon: <FileText className="h-3.5 w-3.5" />,
    },
    /*
     * Positions are shown for EVERY client type, partner or not — as are the
     * Accounts, Transactions and Documents tabs above.
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
                    {/* The client's tags live HERE — the Tags card went (owner,
                        29 Sep 2026): two or three chips do not need a card. Only
                        when there are some; "Manage tags" is in the menu. */}
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
                  onLinkAccount={() => setLinkOpen(true)}
                />
              </div>
            </header>

            <div className="shrink-0">
              <Tabs tabs={tabs} value={tab} onValueChange={setTab} idPrefix="client-profile" />
            </div>

            {/* The client is known here, so the dialog only asks for the login. */}
            <LinkAccountDialog
              open={linkOpen}
              onClose={() => setLinkOpen(false)}
              client={{
                id: profile.id,
                portalId: profile.portalId,
                firstName: profile.firstName,
                lastName: profile.lastName,
                email: profile.email,
                country: profile.country,
              }}
            />

            <TabPanel value={TAB_OVERVIEW} activeValue={tab} idPrefix="client-profile">
              {/*
                EVERYTHING AT A GLANCE (owner, 29 Sep 2026) — who they are, their
                account and verification, their money and trading, their partner
                standing and what moved last. Each card is left out for a reader
                who may not see its data. Detail lives on the tabs.
              */}
              <ClientOverview profile={profile} partner={partner} onOpen={setTab} />
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

            {canViewTrading && (
              <TabPanel
                value={TAB_ACCOUNTS}
                activeValue={tab}
                idPrefix="client-profile"
                className="flex min-h-0 flex-1 flex-col"
              >
                <ClientAccountsPanel
                  userId={profile.id}
                  clientName={displayName}
                  client={{
                    id: profile.id,
                    portalId: profile.portalId,
                    firstName: profile.firstName,
                    lastName: profile.lastName,
                    email: profile.email,
                    country: profile.country,
                  }}
                />
              </TabPanel>
            )}

            {canViewTransactions && (
              <TabPanel
                value={TAB_TRANSACTIONS}
                activeValue={tab}
                idPrefix="client-profile"
                className="flex min-h-0 flex-1 flex-col"
              >
                {/* Mounted only while open: three lists nobody asked for yet. */}
                {tab === TAB_TRANSACTIONS && <ClientTransactionsTab userId={profile.id} />}
              </TabPanel>
            )}

            <TabPanel
              value={TAB_DOCUMENTS}
              activeValue={tab}
              idPrefix="client-profile"
              className="flex min-h-0 flex-1 flex-col"
            >
              {tab === TAB_DOCUMENTS && <ClientDocumentsPanel userId={profile.id} />}
            </TabPanel>

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
                          {profile.referrer.active === false && (
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
                  onToggle={(tagId) => void tagToggle.toggle(tagId, attachedIds.has(tagId))}
                  disabled={tagToggle.pending}
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
