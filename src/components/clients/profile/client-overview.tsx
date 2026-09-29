'use client';

import type { ReactNode } from 'react';
import type { ClientProfile, IbPartnerDetail } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { Badge } from '@/components/ui/badge';
import { CopyableId } from '@/components/copyable-id';
import { PermittedLink } from '@/components/permitted-link';
import { ClientTagChips } from '@/components/clients/client-tag-chips';
import { formatDateOfBirth } from '@/lib/profile';
import { formatPhone } from '@/components/ui/phone-input';
import { t } from '@/lib/i18n';
import { Field, KycStatusBadge, ProfileCard } from './profile-cards';
import { ClientGlance, type GlanceTab } from './client-glance';

/**
 * THE OVERVIEW — who the client is, and where they stand, at a glance.
 *
 * Two parts, and neither repeats a tab (owner, 29 Sep 2026). On top, one row
 * of FIGURES (`ClientGlance`) — balances, accounts, money in and out, pending,
 * last activity, partner earnings — each a count or a single row, each opening
 * the tab that holds the detail. Beneath, the three things no tab shows: their
 * personal details, their account, and their verification, read from the
 * profile the page already holds. A card the reader may not see is left out.
 */
export function ClientOverview({
  profile,
  partner,
  onOpen,
}: {
  profile: ClientProfile;
  partner: IbPartnerDetail | null;
  /** Opens the tab a glance tile summarises. */
  onOpen: (tab: GlanceTab) => void;
}) {
  const { admin } = useAdmin();
  const canViewKyc = hasPermission(admin, 'kyc.view') || hasPermission(admin, 'kyc.review');
  const canViewPartners = hasPermission(admin, 'ib.view');

  return (
    <div className="space-y-6">
      <ClientGlance userId={profile.id} partner={partner} onOpen={onOpen} />
      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <PersonalCard profile={profile} />
        <AccountCard profile={profile} canViewPartners={canViewPartners} />
        {canViewKyc && <VerificationCard profile={profile} />}
      </div>
    </div>
  );
}

/* ── From the profile ─────────────────────────────────────────────────────── */

function PersonalCard({ profile }: { profile: ClientProfile }) {
  return (
    <ProfileCard title={t('clientProfile.ovPersonal')}>
      <dl className="grid grid-cols-2 gap-4">
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
        <Field label={t('clientProfile.fieldPhone')} field="client.phone" profile={profile}>
          {formatPhone(profile.phone) || '—'}
        </Field>
        <Field label={t('clients.colCountry')} field="client.country" profile={profile} />
        <Field label={t('clientProfile.fieldCity')} field="client.city" profile={profile} />
        <Field
          label={t('clientProfile.fieldStateProvince')}
          field="client.stateProvince"
          profile={profile}
        />
        <Field label={t('clientProfile.fieldAddress')} field="client.address" profile={profile} />
        <Field
          label={t('clientProfile.fieldPostalCode')}
          field="client.postalCode"
          profile={profile}
        />
      </dl>
    </ProfileCard>
  );
}

function AccountCard({
  profile,
  canViewPartners,
}: {
  profile: ClientProfile;
  canViewPartners: boolean;
}) {
  const referrer = profile.referrer;
  return (
    <ProfileCard title={t('clientProfile.ovAccount')}>
      <dl className="grid grid-cols-2 gap-4">
        <Field label={t('clientProfile.fieldClientId')} field="client.id" profile={profile}>
          <CopyableId value={String(profile.portalId)} full copyLabel={t('common.copyPortalId')} />
        </Field>
        <Item label={t('clientProfile.ovStatus')}>
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
        </Item>
        <Item label={t('clientProfile.ovType')}>
          <span className="capitalize">{profile.type}</span>
        </Item>
        <Item label={t('clientProfile.ovEmailConfirmed')}>
          {profile.emailVerified ? (
            <Badge variant="success">{t('clients.emailVerifiedYes')}</Badge>
          ) : (
            <Badge variant="warning">{t('clients.emailVerifiedNo')}</Badge>
          )}
        </Item>
        <Field label={t('clients.colCreated')} field="client.createdAt" profile={profile}>
          {profile.createdAt ? new Date(profile.createdAt).toLocaleDateString() : '—'}
        </Field>
        {/* Who introduced them — told only to a reader who may see the partner
            programme, and never as "direct" when it is "outside your territory". */}
        {canViewPartners && (
          <Item label={t('clientProfile.ovIntroducedBy')}>
            {!referrer ? (
              <span className="text-muted-foreground">{t('clientProfile.ovDirect')}</span>
            ) : referrer.outsideTerritory || referrer.portalId === undefined ? (
              <span className="text-muted-foreground">{t('clients.introducedByOutside')}</span>
            ) : (
              <PermittedLink
                href={`/clients/${referrer.portalId}`}
                className="text-link hover:underline focus-outline"
              >
                {[referrer.firstName, referrer.lastName].filter(Boolean).join(' ') ||
                  `#${referrer.portalId}`}
              </PermittedLink>
            )}
          </Item>
        )}
        <div className="col-span-2">
          <Item label={t('clientProfile.sectionTags')}>
            {profile.tags.length > 0 ? (
              <ClientTagChips tags={profile.tags} />
            ) : (
              <span className="text-muted-foreground">{t('clientProfile.ovNoTags')}</span>
            )}
          </Item>
        </div>
      </dl>
    </ProfileCard>
  );
}

function VerificationCard({ profile }: { profile: ClientProfile }) {
  const kyc = profile.kyc;
  return (
    <ProfileCard title={t('clientProfile.sectionKyc')}>
      <dl className="grid grid-cols-2 gap-4">
        <Item label={t('clients.colKycLevel')}>
          {profile.verificationLevel >= 1 ? (
            <Badge variant="success">{t('clients.levelVerified')}</Badge>
          ) : (
            <Badge variant="warning">{t('clients.levelUnverified')}</Badge>
          )}
        </Item>
        <Item label={t('clientProfile.fieldKycStatus')}>
          {kyc ? (
            <KycStatusBadge status={kyc.status} />
          ) : (
            <span className="text-muted-foreground">{t('clientProfile.noKyc')}</span>
          )}
        </Item>
        <Item label={t('clientProfile.fieldKycSubmitted')}>{day(kyc?.submittedAt)}</Item>
        <Item label={t('clientProfile.ovKycReviewed')}>{day(kyc?.reviewedAt)}</Item>
        <Item label={t('clientProfile.ovKycDocuments')}>
          <span className="tabular">{kyc?.documentCount ?? 0}</span>
        </Item>
        {kyc?.rejectionReason && (
          <div className="col-span-2">
            <Item label={t('clientProfile.ovKycReason')}>
              <span className="text-destructive">{kyc.rejectionReason}</span>
            </Item>
          </div>
        )}
      </dl>
    </ProfileCard>
  );
}

/* ── Helpers ───────────────────────────────────────────────────────────────── */

/** A label over a value — the identity grid's shape, for values not masked by key. */
function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

function day(value: string | undefined): string {
  return value ? new Date(value).toLocaleDateString() : '—';
}
