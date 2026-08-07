'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  BadgeCheck,
  ChevronRight,
  FileCheck,
  Handshake,
  Info,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import api from '@/lib/api';
import type {
  KycListResponse,
  KycTrendSeries,
  RegistrationSeries,
  StatsOverview,
  StatsWindow,
  WithdrawalVolumeSeries,
} from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { formatMoney } from '@/lib/money';
import { AsyncBoundary } from '@/components/async-boundary';
import { ChartCard } from '@/components/dashboard/chart-card';
import { useChartTokens } from '@/components/dashboard/chart-theme';
import { ClientSplitChart } from '@/components/dashboard/client-split-chart';
import { formatCount } from '@/components/dashboard/format';
import { KycFunnelChart } from '@/components/dashboard/kyc-funnel-chart';
import { KycTrendChart } from '@/components/dashboard/kyc-trend-chart';
import { PeriodSelector } from '@/components/dashboard/period-selector';
import { sumAmounts } from '@/components/dashboard/plot-money';
import { RegistrationsChart } from '@/components/dashboard/registrations-chart';
import { StatTile } from '@/components/dashboard/stat-tile';
import { WithdrawalStateChart } from '@/components/dashboard/withdrawal-state-chart';
import { WithdrawalVolumeChart } from '@/components/dashboard/withdrawal-volume-chart';
import { t } from '@/lib/i18n';

/**
 * The back-office dashboard.
 *
 * ## Every number is real
 *
 * There is nothing invented on this screen. The counters come from
 * `GET /admin/stats/overview` and the three time series from their own
 * endpoints; a section with no data renders as an empty chart or a stated
 * "none yet", never as plausible rows. That is the same rule that keeps the
 * `BackendPending` panels honest elsewhere.
 *
 * ## Five resources, not one
 *
 * The overview, the three series and the recent-submissions list are separate
 * `useResource` calls behind separate `AsyncBoundary`s. A single page-level
 * query would mean one failing endpoint blanks a dashboard that is four-fifths
 * fine — so a failure here costs exactly one card, which keeps its own retry
 * inside its own border.
 *
 * ## Permissions gate SECTIONS, not the page
 *
 * `/admin/stats/overview` is open to any admin and returns only the sections
 * the caller's permissions allow, listing them in `sections`. The client-side
 * `hasPermission` checks below mirror that so a card is never mounted only to
 * render a 403 — an operator without `withdrawals.view` sees a dashboard with
 * no withdrawal panels rather than a broken one. The API is the enforcement;
 * this is ergonomics (ARCHITECTURE §8.8).
 *
 * The series endpoints carry the same gating, so each series query is `enabled`
 * only when its permission is held — an unauthorised request that is never
 * made cannot render a card in an error state.
 *
 * ## Money
 *
 * Every amount here arrives as a string and is displayed through `formatMoney`.
 * The only conversion to a number happens inside
 * `components/dashboard/plot-money.ts`, for bar geometry, and nothing that
 * comes out of it is ever shown — see that file's header.
 */
export default function AdminDashboardPage() {
  const { admin } = useAdmin();
  const [days, setDays] = React.useState<StatsWindow>(30);

  const canViewClients = hasPermission(admin, 'users.view');
  const canReviewKyc = hasPermission(admin, 'kyc.review') || hasPermission(admin, 'kyc.view');
  const canViewWithdrawals = hasPermission(admin, 'withdrawals.view');
  const canViewIb = hasPermission(admin, 'ib.view');

  const overview = useResource<StatsOverview>(['admin', 'stats', 'overview'], (signal) =>
    api.admin.getStatsOverview(signal),
  );

  /*
   * The window is part of the query key, so switching period is a new cached
   * entry rather than a refetch of the old one — flipping 30 → 7 → 30 shows the
   * first result instantly. `placeholderData` in `useResource` keeps the
   * previous render on screen meanwhile, which is what `ChartCard` dims.
   */
  const registrations = useResource<RegistrationSeries>(
    ['admin', 'stats', 'registrations', days],
    (signal) => api.admin.getRegistrationSeries(days, signal),
    { enabled: canViewClients },
  );

  const kycTrend = useResource<KycTrendSeries>(
    ['admin', 'stats', 'kyc-trend', days],
    (signal) => api.admin.getKycTrend(days, signal),
    { enabled: canReviewKyc },
  );

  const withdrawalVolume = useResource<WithdrawalVolumeSeries>(
    ['admin', 'stats', 'withdrawal-volume', days],
    (signal) => api.admin.getWithdrawalVolume(days, signal),
    { enabled: canViewWithdrawals },
  );

  const recentKyc = useResource<KycListResponse>(
    ['admin', 'stats', 'recent-kyc'],
    async (signal) =>
      (await api.get<KycListResponse>('/admin/kyc?status=submitted&limit=5', { signal })).data,
    { enabled: canReviewKyc },
  );

  const stats = overview.data;
  const clients = stats?.clients;
  const kyc = stats?.kyc;
  const withdrawals = stats?.withdrawals;
  const ib = stats?.ib;

  const overviewLoading = overview.status === 'loading';

  /*
   * `pending` and `under_review` together — both mean "a reviewer has to look
   * at this", which is the question the tile answers. Counting only
   * `submitted` would understate the queue by everything already picked up.
   */
  const pendingKyc = (kyc?.byStatus['submitted'] ?? 0) + (kyc?.byStatus['under_review'] ?? 0);

  const pendingWithdrawal = withdrawals?.byState.find((entry) => entry.state === 'pending');

  const registrationPoints = registrations.data?.points ?? [];
  const registrationTotal = registrationPoints.reduce((sum, point) => sum + point.count, 0);

  const volumePoints = withdrawalVolume.data?.points ?? [];
  // Summed as DECIMAL strings, not from the numbers the bars were drawn with.
  const volumeTotal = sumAmounts(volumePoints.map((point) => point.totalAmount));
  const volumeCount = volumePoints.reduce((sum, point) => sum + point.count, 0);

  const reviewQueue = recentKyc.data?.items ?? [];

  /*
   * An admin holding none of the four keys gets a 200 with an empty `sections`
   * rather than a 403 — so the honest answer is a stated explanation, not an
   * empty grid that looks like a loading failure.
   */
  const hasAnySection =
    canViewClients || canReviewKyc || canViewWithdrawals || canViewIb || overviewLoading;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('adminDashboard.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('dashboard.subtitle')}</p>
        </div>
        {/*
         * One filter row, above everything it scopes. Every time series below
         * re-fetches against this window, so the panels always describe the
         * same slice.
         */}
        <PeriodSelector value={days} onChange={setDays} />
      </div>

      {/*
       * A scoped admin's totals count only THEIR clients. Saying so is not
       * optional: an unqualified "1,204 clients" reads as a platform total, and
       * an operator acting on that number is acting on a misreading.
       */}
      {stats?.scoped === true && (
        <div
          className="flex items-start gap-2 rounded-xl border border-border bg-card p-3 shadow-xs"
          role="note"
        >
          <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-xs text-muted-foreground">{t('dashboard.scopedNotice')}</p>
        </div>
      )}

      {!hasAnySection && (
        <div className="rounded-xl border border-border bg-card p-8 text-center shadow-xs">
          <p className="text-sm text-muted-foreground">{t('dashboard.noSections')}</p>
        </div>
      )}

      {/* ── Headline tiles ──────────────────────────────────────────────── */}
      <AsyncBoundary
        status={overview.status}
        label={t('dashboard.overviewLoading')}
        endpoints={['GET /admin/stats/overview']}
        onRetry={overview.refetch}
        error={overview.error}
        errorMessage={t('dashboard.overviewError')}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {clients && (
            <>
              <StatTile
                label={t('dashboard.tileTotalClients')}
                value={formatCount(clients.total)}
                hint={t('dashboard.tileTotalClientsHint')}
                icon={Users}
                href="/clients"
              />
              <StatTile
                label={t('dashboard.tileNewThisMonth')}
                value={formatCount(clients.registered.thisMonth)}
                hint={t('dashboard.tileNewThisMonthHint', {
                  today: formatCount(clients.registered.today),
                  week: formatCount(clients.registered.thisWeek),
                })}
                icon={UserPlus}
                href="/clients"
              />
              <StatTile
                label={t('dashboard.tileVerified')}
                value={formatCount(clients.byVerification.verified)}
                hint={t('dashboard.tileVerifiedHint', {
                  notVerified: formatCount(clients.byVerification.notVerified),
                })}
                icon={BadgeCheck}
                href="/clients"
              />
            </>
          )}
          {kyc && (
            <StatTile
              label={t('dashboard.tilePendingKyc')}
              value={formatCount(pendingKyc)}
              hint={t('dashboard.tilePendingKycHint')}
              icon={FileCheck}
              href="/kyc"
              accent={pendingKyc > 0}
            />
          )}
          {withdrawals && (
            <StatTile
              label={t('dashboard.tilePendingWithdrawals')}
              value={formatCount(pendingWithdrawal?.count ?? 0)}
              // The held VALUE beside the count, formatted from the string.
              hint={t('dashboard.tilePendingWithdrawalsHint', {
                amount: formatMoney(pendingWithdrawal?.totalAmount ?? '0', 'USD'),
              })}
              icon={Wallet}
              href="/transactions"
              accent={(pendingWithdrawal?.count ?? 0) > 0}
            />
          )}
          {ib && (
            <StatTile
              label={t('dashboard.tilePartners')}
              value={formatCount(ib.partners)}
              hint={t('dashboard.tilePartnersHint', {
                pending: formatCount(ib.applications['pending'] ?? 0),
              })}
              icon={Handshake}
              href="/partners"
            />
          )}
        </div>
      </AsyncBoundary>

      {/* ── Trends over the selected window ─────────────────────────────── */}
      <div className="grid gap-4 xl:grid-cols-2">
        {canViewClients && (
          <ChartCard
            title={t('dashboard.registrationsTitle')}
            description={t('dashboard.registrationsDescription')}
            status={registrations.status}
            isFetching={registrations.isFetching}
            onRetry={registrations.refetch}
            error={registrations.error}
            errorMessage={t('dashboard.registrationsError')}
            label={t('dashboard.registrationsLoading')}
            endpoints={['GET /admin/stats/registrations']}
            action={
              <span className="text-xs text-muted-foreground shrink-0">
                {t('dashboard.registrationsTotal', { count: formatCount(registrationTotal) })}
              </span>
            }
          >
            <RegistrationsChart points={registrationPoints} />
          </ChartCard>
        )}

        {canReviewKyc && (
          <ChartCard
            title={t('dashboard.kycTrendTitle')}
            description={t('dashboard.kycTrendDescription')}
            status={kycTrend.status}
            isFetching={kycTrend.isFetching}
            onRetry={kycTrend.refetch}
            error={kycTrend.error}
            errorMessage={t('dashboard.kycTrendError')}
            label={t('dashboard.kycTrendLoading')}
            endpoints={['GET /admin/stats/kyc-trend']}
            action={<TrendLegend />}
          >
            <KycTrendChart points={kycTrend.data?.points ?? []} />
          </ChartCard>
        )}
      </div>

      {/* ── Composition, today ──────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {canViewClients && clients && (
          <ChartCard
            title={t('dashboard.clientSplitTitle')}
            description={t('dashboard.clientSplitDescription')}
            status={overview.status}
            isFetching={overview.isFetching}
            onRetry={overview.refetch}
            error={overview.error}
            errorMessage={t('dashboard.overviewError')}
            label={t('dashboard.overviewLoading')}
            endpoints={['GET /admin/stats/overview']}
            height={200}
            valuesInText
          >
            <ClientSplitChart stats={clients} />
          </ChartCard>
        )}

        {canReviewKyc && kyc && (
          <ChartCard
            title={t('dashboard.kycFunnelTitle')}
            description={t('dashboard.kycFunnelDescription')}
            status={overview.status}
            isFetching={overview.isFetching}
            onRetry={overview.refetch}
            error={overview.error}
            errorMessage={t('dashboard.overviewError')}
            label={t('dashboard.overviewLoading')}
            endpoints={['GET /admin/stats/overview']}
            height={200}
            valuesInText
          >
            <KycFunnelChart stats={kyc} />
          </ChartCard>
        )}

        {canViewWithdrawals && withdrawals && (
          <ChartCard
            title={t('dashboard.withdrawalStateTitle')}
            description={t('dashboard.withdrawalStateDescription')}
            status={overview.status}
            isFetching={overview.isFetching}
            onRetry={overview.refetch}
            error={overview.error}
            errorMessage={t('dashboard.overviewError')}
            label={t('dashboard.overviewLoading')}
            endpoints={['GET /admin/stats/overview']}
            height={200}
            valuesInText
          >
            <WithdrawalStateChart byState={withdrawals.byState} />
          </ChartCard>
        )}
      </div>

      {/* ── Money moving, and the queue ─────────────────────────────────── */}
      <div className="grid gap-4 xl:grid-cols-2">
        {canViewWithdrawals && (
          <ChartCard
            title={t('dashboard.withdrawalVolumeTitle')}
            description={t('dashboard.withdrawalVolumeDescription')}
            status={withdrawalVolume.status}
            isFetching={withdrawalVolume.isFetching}
            onRetry={withdrawalVolume.refetch}
            error={withdrawalVolume.error}
            errorMessage={t('dashboard.withdrawalVolumeError')}
            label={t('dashboard.withdrawalVolumeLoading')}
            endpoints={['GET /admin/stats/withdrawal-volume']}
            action={
              <span className="text-xs text-muted-foreground shrink-0 text-end">
                {t('dashboard.withdrawalVolumeTotal', {
                  amount: formatMoney(volumeTotal, 'USD'),
                  count: formatCount(volumeCount),
                })}
              </span>
            }
          >
            <WithdrawalVolumeChart points={volumePoints} />
          </ChartCard>
        )}

        {canReviewKyc && (
          <section className="rounded-xl border border-border bg-card shadow-xs flex flex-col">
            <div className="flex items-start justify-between gap-4 p-5 pb-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-foreground">
                  {t('dashboard.recentKycTitle')}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t('dashboard.recentKycDescription')}
                </p>
              </div>
              <Link
                href="/kyc"
                className="inline-flex items-center gap-1 text-xs font-semibold text-link hover:underline focus-outline rounded-sm shrink-0"
              >
                <span>{t('adminDashboard.viewAll')}</span>
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
            <AsyncBoundary
              status={recentKyc.status}
              label={t('adminDashboard.kycQueue')}
              endpoints={['GET /admin/kyc']}
              onRetry={recentKyc.refetch}
              error={recentKyc.error}
              errorMessage={t('adminDashboard.kycQueueFailed')}
            >
              {reviewQueue.length === 0 ? (
                <p className="p-6 pt-0 text-center text-sm text-muted-foreground">
                  {t('adminDashboard.kycQueueEmpty')}
                </p>
              ) : (
                <ul className="divide-y divide-border border-t border-border">
                  {reviewQueue.map((submission) => (
                    <li key={submission.userId}>
                      <Link
                        href={`/kyc/${submission.userId}`}
                        className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-accent/40 focus-outline"
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-foreground truncate">
                            {[submission.user?.firstName, submission.user?.lastName]
                              .filter(Boolean)
                              .join(' ') ||
                              submission.user?.email ||
                              submission.userId}
                          </span>
                          <span className="block text-xs text-muted-foreground truncate">
                            {submission.user?.email}
                          </span>
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {submission.submittedAt
                            ? new Date(submission.submittedAt).toLocaleDateString()
                            : ''}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </AsyncBoundary>
          </section>
        )}
      </div>
    </div>
  );
}

/**
 * The KYC trend's legend, in the card header rather than under the plot.
 *
 * A legend is mandatory once there are two series — identity is never carried
 * by colour alone. It lives in the header because Recharts' own `<Legend>`
 * takes height out of the plot area, which is what pushes the x-axis band into
 * an overflow and gives a card its own tiny scrollbar.
 *
 * Written as a component rather than inline so the page reads as layout. The
 * colours come from the same hook the chart uses, so the swatch and the line
 * can never disagree.
 */
function TrendLegend() {
  const tokens = useChartTokens();

  // The SAME slot indices the chart assigns, so a swatch can never disagree
  // with the line it labels.
  const keys = [
    { key: 'submitted', label: t('dashboard.kycSubmitted'), colour: tokens.series[0] },
    { key: 'approved', label: t('dashboard.kycApproved'), colour: tokens.series[2] },
  ] as const;

  return (
    <ul className="flex items-center gap-3 shrink-0">
      {keys.map((entry) => (
        <li key={entry.key} className="flex items-center gap-1.5">
          {/* A short stroke, mirroring the mark a line chart draws. */}
          <span
            aria-hidden="true"
            className="inline-block rounded-full"
            style={{ width: 12, height: 2, backgroundColor: entry.colour }}
          />
          <span className="text-[11px] text-muted-foreground">{entry.label}</span>
        </li>
      ))}
    </ul>
  );
}
