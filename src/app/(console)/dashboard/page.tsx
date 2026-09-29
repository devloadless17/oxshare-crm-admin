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
import { PageLoader } from '@/components/ui/loader';
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
import { PermittedLink } from '@/components/permitted-link';
import { keys } from '@/lib/query-keys';
import { ClientIdentity, clientName } from '@/components/clients/client-identity';

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
 * Their FIRST loads are still shown together, behind one page-level spinner —
 * see the gate below. Separate resources are about how failure degrades, not
 * about letting the screen assemble itself panel by panel in front of the
 * operator.
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

  const canViewClients = hasPermission(admin, 'clients.view');
  const canReviewKyc = hasPermission(admin, 'kyc.review') || hasPermission(admin, 'kyc.view');
  const canViewWithdrawals = hasPermission(admin, 'withdrawals.view');
  const canViewIb = hasPermission(admin, 'ib.view');
  // Any one section is enough to ask; with NONE the request is not made at
  // all. The route guard would 403 it, and the console never asks the API for
  // something it already knows it cannot have — the noSections explanation
  // below is the answer for that operator, not an error card.
  const canAnyStats = canViewClients || canReviewKyc || canViewWithdrawals || canViewIb;

  const overview = useResource<StatsOverview>(
    keys.stats.overview(),
    (signal) => api.admin.getStatsOverview(signal),
    { enabled: canAnyStats },
  );

  /*
   * The window is part of the query key, so switching period is a new cached
   * entry rather than a refetch of the old one — flipping 30 → 7 → 30 shows the
   * first result instantly. `placeholderData` in `useResource` keeps the
   * previous render on screen meanwhile, which is what `ChartCard` dims.
   */
  const registrations = useResource<RegistrationSeries>(
    keys.stats.registrations(days),
    (signal) => api.admin.getRegistrationSeries(days, signal),
    { enabled: canViewClients },
  );

  const kycTrend = useResource<KycTrendSeries>(
    keys.stats.kycTrend(days),
    (signal) => api.admin.getKycTrend(days, signal),
    { enabled: canReviewKyc },
  );

  const withdrawalVolume = useResource<WithdrawalVolumeSeries>(
    keys.stats.withdrawalVolume(days),
    (signal) => api.admin.getWithdrawalVolume(days, signal),
    { enabled: canViewWithdrawals },
  );

  const recentKyc = useResource<KycListResponse>(
    keys.stats.recentKyc(),
    async (signal) =>
      (await api.get<KycListResponse>('/admin/kyc?status=submitted&limit=5', { signal })).data,
    { enabled: canReviewKyc },
  );

  /*
   * ONE loader on first load, not eight.
   *
   * The five resources stay separate — that is what keeps a failure costing a
   * single card — but their LOADING states are shown together. Rendering each
   * panel the moment its own query settles meant the tiles appeared, then the
   * grid reflowed as each chart landed, so the screen was still visibly
   * assembling itself long after it looked ready. Nothing here is actionable
   * until all of it is there, so the page waits as a whole and arrives as one.
   *
   * Only the ENABLED resources are counted. A React Query with `enabled: false`
   * stays `isPending` forever, which `useResource` reports as `loading` — so
   * including a query the admin's permissions never let run would hold the
   * spinner on screen permanently for exactly the operators who can least
   * afford to be told nothing.
   *
   * This gate is first-load only: switching the period keeps the previous data
   * on screen (`placeholderData` in `useResource`), so those refetches are
   * `isFetching` rather than `loading` and `ChartCard` dims them in place.
   */
  const gatedResources = [
    ...(canAnyStats ? [overview] : []),
    ...(canViewClients ? [registrations] : []),
    ...(canReviewKyc ? [kycTrend, recentKyc] : []),
    ...(canViewWithdrawals ? [withdrawalVolume] : []),
  ];

  if (gatedResources.some((resource) => resource.status === 'loading')) {
    /*
     * `flex-1`, so the spinner sits in the middle of the PAGE.
     *
     * `PageLoader` centres itself within `min-h-[60vh]` — a floor, not a
     * height. As a bare flex child of `<main>` (`flex min-h-0 flex-1 flex-col`)
     * it takes that natural 60vh at the top of the column, which puts the
     * spinner around 30vh: visibly above centre, with the rest of the console
     * empty below it. Growing to fill the bounded main area makes "centred"
     * mean centred in the space the page actually occupies.
     */
    return <PageLoader label={t('dashboard.pageLoading')} className="flex-1" />;
  }

  const stats = overview.data;
  const clients = stats?.clients;
  const kyc = stats?.kyc;
  const withdrawals = stats?.withdrawals;
  const ib = stats?.ib;

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
   *
   * No `|| loading` term any more: nothing below this point renders until the
   * gate above has lifted, so this can no longer flash during a fetch.
   */
  const hasAnySection = canAnyStats;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
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
        {/*
         * `auto-fit`, not a fixed six.
         *
         * Which tiles exist depends on the role: `clients.view` contributes
         * two, kyc/withdrawals/ib one each. A fixed `xl:grid-cols-6` sized the
         * row for the maximum regardless, so a compliance officer holding three
         * of them got three tiles and half a row of nothing — the layout
         * describing permissions they do not have.
         *
         * `auto-fit` collapses the empty tracks, so the tiles that ARE rendered
         * share the full width. `minmax(13rem, 1fr)` keeps the wrap sensible:
         * six tiles still fit a wide screen, and a narrow one breaks to two or
         * one without any breakpoint doing the arithmetic.
         */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] gap-3">
          {clients && (
            <>
              <StatTile
                label={t('dashboard.tileTotalClients')}
                value={formatCount(clients.total)}
                hint={t('dashboard.tileTotalClientsHint')}
                icon={Users}
                href="/clients"
              />
              {/*
                NOT a link, and that is the honest version. `StatTile`'s
                contract is "a tile is a LINK when there is somewhere to act on
                it", and the client list has no registration-date filter — so
                this used to send an operator to an unfiltered list of every
                client, where the 143 they clicked could not be found. Three
                tiles carrying three different numbers all opened the same
                page, which reads as a mis-click or a filter that silently
                failed. Give it a link again in the commit that gives the list
                a date filter.
              */}
              <StatTile
                label={t('dashboard.tileNewThisMonth')}
                value={formatCount(clients.registered.thisMonth)}
                hint={t('dashboard.tileNewThisMonthHint', {
                  today: formatCount(clients.registered.today),
                  week: formatCount(clients.registered.thisWeek),
                })}
                icon={UserPlus}
              />
              {/*
                Not a link either, and for the same reason: `level`,
                `emailVerified` and `kycStatus` were deliberately removed from
                the client filters (client-filters.tsx says why), so there is
                no way to isolate the verified set at the destination.
              */}
              <StatTile
                label={t('dashboard.tileVerified')}
                value={formatCount(clients.byVerification.verified)}
                hint={t('dashboard.tileVerifiedHint', {
                  notVerified: formatCount(clients.byVerification.notVerified),
                })}
                icon={BadgeCheck}
              />
            </>
          )}
          {kyc && (
            <StatTile
              label={t('dashboard.tilePendingKyc')}
              value={formatCount(pendingKyc)}
              hint={t('dashboard.tilePendingKycHint')}
              icon={FileCheck}
              href="/kyc?status=needs_review"
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
              /*
               * The partner directory — back since 25 Sep 2026. It counts from
               * the same `ib_accounts` rows as this tile, and so does the client
               * list's derived "partner" type, so all three agree on who is one
               * (pinned by the backend's `ib-partner-directory.spec.ts`). The
               * tile only renders for `ib.view`, which is exactly the key the
               * page requires, so the link can never land on "no access".
               */
              href="/partners"
            />
          )}
        </div>
      </AsyncBoundary>

      {/* ── Trends over the selected window ─────────────────────────────── */}
      {/* Same `auto-fit` reasoning as the tiles above. A role holding only
          `kyc.view` renders one of these two, and a fixed two-column grid left
          that chart at half width with dead space beside it. `28rem` is the
          floor at which a time-series axis is still readable — below it these
          stack rather than squeeze. */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(28rem,1fr))] gap-4">
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
      {/* Three cards at most, and commonly one or two. `22rem` is smaller than
          the trend row's floor because these are bar/legend cards rather than
          dated axes, so three still fit a wide screen. */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(22rem,1fr))] gap-4">
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
      {/* `withdrawals.view` and `kyc.view` are separate grants and commonly held
          apart, so this row very often has one child. Same `auto-fit` treatment
          as the rows above. */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(28rem,1fr))] gap-4">
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
                href="/kyc?status=needs_review"
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
              fill
            >
              {reviewQueue.length === 0 ? (
                <div className="flex min-h-0 flex-1 items-center justify-center p-6 pt-0">
                  <p className="text-center text-sm text-muted-foreground">
                    {t('adminDashboard.kycQueueEmpty')}
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-border border-t border-border">
                  {reviewQueue.map((submission) => (
                    <li key={submission.userId}>
                      <PermittedLink
                        href={`/kyc/${submission.userId}`}
                        className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-accent/40 focus-outline"
                      >
                        <div className="min-w-0 text-sm">
                          <ClientIdentity
                            name={clientName(submission.user?.firstName, submission.user?.lastName)}
                            email={submission.user?.email}
                            portalId={submission.user?.portalId}
                            /* The row is already a link to the review. */
                            link={false}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {submission.submittedAt
                            ? new Date(submission.submittedAt).toLocaleDateString()
                            : ''}
                        </span>
                      </PermittedLink>
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
