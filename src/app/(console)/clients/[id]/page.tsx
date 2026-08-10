'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FileText } from 'lucide-react';
import api from '@/lib/api';
import type { ClientProfile } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { apiErrorCode } from '@/lib/api/errors';
import { AsyncBoundary } from '@/components/async-boundary';
import { Badge } from '@/components/ui/badge';
import { ToggleList } from '@/components/ui/toggle-list';
import { ClientTagChips } from '@/components/clients/client-tag-chips';
import { ClientWalletsPanel } from '@/components/clients/profile/client-wallets-panel';
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
 * Rev 9 deferred this and DECISIONS D-20 recorded the deferral as resolved; it
 * exists on an explicit reversal, because the FSD's acceptance criterion for
 * ADM-01 is literally "an administrator searches the client base and opens a
 * full client profile".
 *
 * ── Three kinds of absence, and none of them may look like another ──────────
 *
 *   the section key is missing   → you lack the permission        ("hidden")
 *   the section is present, empty → this client has none          ("none yet")
 *   a FIELD key is missing        → masked from you               ("••••")
 *
 * Collapsing any pair produces a screen that makes claims about the CLIENT
 * which are really claims about the VIEWER — and somebody acts on it.
 */
export default function ClientProfilePage() {
  const params = useParams<{ id: string }>();
  const clientId = params.id;
  const { admin } = useAdmin();
  const queryClient = useQueryClient();

  const canViewKyc = hasPermission(admin, 'kyc.view') || hasPermission(admin, 'kyc.review');
  const canViewDocs =
    hasPermission(admin, 'kyc.documents.view') || hasPermission(admin, 'kyc.review');
  const canViewTrading = hasPermission(admin, 'trading.view');
  /*
   * `ib.view`, because `partners.view` NEVER EXISTED.
   *
   * It was invented here and never added to the backend catalog, so no role
   * could hold it and this panel was hidden from everybody — including from
   * the wildcard holders, once the wildcard stopped being honoured. The
   * permissions module documents this exact class of drift at the top; this
   * is the last instance of it.
   */
  const canViewPartners = hasPermission(admin, 'ib.view');
  // Tagging a CLIENT is a client permission now, not a tag-vocabulary one:
  // `tags.*` is who may edit the vocabulary, `clients.tag` is who may put one
  // on somebody. A tag decides which admins can see a client, so the two are
  // genuinely different powers.
  const canAssignTags = hasPermission(admin, 'clients.tag');

  const query = useResource<ClientProfile>(['client', clientId], (signal) =>
    api.admin.getClient(clientId, signal),
  );

  const tagsQuery = useResource(['tags'], (signal) => api.admin.getTags(signal), {
    enabled: canAssignTags,
  });

  const toggleTag = useMutation({
    mutationFn: ({ tagId, attached }: { tagId: string; attached: boolean }) =>
      attached ? api.admin.unassignTag(clientId, tagId) : api.admin.assignTag(clientId, tagId),
    onSuccess: async (_data, { tagId, attached }) => {
      await queryClient.invalidateQueries({ queryKey: ['client', clientId] });
      // The tag LABEL, not its uuid. `attached` is the state before the write,
      // so the branch reads inverted — toggling an attached tag removes it.
      const label = (tagsQuery.data ?? []).find((tag) => tag.id === tagId)?.label ?? tagId;
      toastSuccess(
        attached
          ? t('clientProfile.tagRemoved', { label })
          : t('clientProfile.tagAdded', { label }),
      );
    },
    /*
     * A tag is an ACCESS-CONTROL primitive here — `admin_client_tag_scopes`
     * decides which administrators may see this client — so the API refuses an
     * assignment that would take the client out of the operator's own scope.
     * That refusal used to be swallowed entirely: the chip snapped back and
     * nothing said why.
     */
    onError: (error) => toastError(error, t('clientProfile.tagFailed')),
  });

  /*
   * 404 here means "no such client" OR "outside your tag scope", and the two
   * are INDISTINGUISHABLE on purpose — otherwise a scoped administrator could
   * enumerate the client base they were denied by trying uuids and reading
   * status codes.
   *
   * Branched on the machine CODE (R-2.2), never on the status alone:
   * `useResource` maps every 404 to `unavailable`, which everywhere else in
   * this app means "this endpoint is not built yet". Without the code check, a
   * genuinely unbuilt endpoint would render as a missing client.
   */
  if (query.status === 'unavailable' && apiErrorCode(query.error) === 'CLIENT_NOT_FOUND') {
    return <ClientNotFound />;
  }

  const profile = query.data;
  const attachedIds = new Set((profile?.tags ?? []).map((tag) => tag.id));

  return (
    <div className="space-y-6">
      <Link
        href="/clients"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground focus-outline"
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
      >
        {profile && (
          <div className="space-y-6">
            <header className="rounded-xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">
                    <Field label="" field="client.firstName" profile={profile}>
                      {[profile.firstName, profile.lastName].filter(Boolean).join(' ') ||
                        t('clients.unnamed')}
                    </Field>
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    <Field label="" field="client.email" profile={profile} />
                  </p>
                </div>
                <div className="flex items-center gap-2">
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
                  <Badge variant="outline" className="capitalize">
                    {profile.type}
                  </Badge>
                </div>
              </div>
            </header>

            <div className="grid gap-6 lg:grid-cols-2">
              <ProfileCard title={t('clientProfile.sectionIdentity')}>
                <dl className="grid grid-cols-2 gap-4">
                  <Field label={t('clients.colCountry')} field="client.country" profile={profile} />
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
                  <Field label={t('clients.colCreated')} field="client.createdAt" profile={profile}>
                    {profile.createdAt ? new Date(profile.createdAt).toLocaleDateString() : '—'}
                  </Field>
                </dl>
              </ProfileCard>

              <ProfileCard title={t('clientProfile.sectionTags')}>
                <div className="space-y-3">
                  <ClientTagChips tags={profile.tags} />
                  {canAssignTags && (
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
                  )}
                </div>
              </ProfileCard>

              {/*
                The client's WALLETS, with the operator actions on them.

                Its own component and its own request: `GET /admin/clients/:id`
                returns identity and compliance, not money, and the two are
                behind different permissions — so fetching wallets here means an
                admin without `wallets.view` still gets the profile they are
                entitled to instead of a failed page.
              */}
              <ClientWalletsPanel userId={profile.id} />

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

              <ProfileCard
                title={t('clientProfile.sectionDocuments')}
                hiddenReason={canViewDocs ? undefined : t('clientProfile.documentsHidden')}
              >
                {profile.documents && profile.documents.length > 0 ? (
                  <ul className="space-y-1.5">
                    {profile.documents.map((file) => (
                      <li key={file}>
                        {/*
                         * A LINK, never an inline image.
                         *
                         * Every fetch goes through GET /uploads/kyc/:file,
                         * which applies the client scope, checks the reader and
                         * writes the R-6.6 audit row. Embedding the bytes here
                         * would route an audited PII read around its own audit
                         * — "which admin viewed this passport" would answer
                         * "nobody", because opening a profile is not viewing a
                         * document.
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
                title={t('clientProfile.sectionReferrals')}
                hiddenReason={canViewPartners ? undefined : t('clientProfile.referralsHidden')}
              >
                <div className="space-y-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {t('clientProfile.parentIb')}
                    </p>
                    {profile.referrer ? (
                      <p className="mt-0.5 text-sm">
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
                  </div>

                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {t('clientProfile.referredClients')}
                    </p>
                    {profile.referredClients && profile.referredClients.length > 0 ? (
                      <ul className="mt-1 space-y-1">
                        {profile.referredClients.map((referred) => (
                          <li key={referred.clientUserId}>
                            <PermittedLink
                              href={`/clients/${referred.clientUserId}`}
                              className="text-xs text-link hover:underline focus-outline"
                            >
                              {[referred.firstName, referred.lastName].filter(Boolean).join(' ')}
                            </PermittedLink>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <EmptySection message={t('clientProfile.noReferrals')} />
                    )}
                  </div>
                </div>
              </ProfileCard>
            </div>
          </div>
        )}
      </AsyncBoundary>
    </div>
  );
}
