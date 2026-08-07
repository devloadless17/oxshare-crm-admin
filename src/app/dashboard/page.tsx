'use client';

import Link from 'next/link';
import { ChevronRight, FileCheck, Loader2, Users } from 'lucide-react';
import { PageLoader } from '@/components/ui/loader';
import api from '@/lib/api';
import type { KycListResponse } from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { t } from '@/lib/i18n';

// The dashboard shows real data where an endpoint exists (KYC queue) and an
// explicit pending marker where it does not — never invented numbers (D-30).
// Missing sources are tracked in docs/DECISIONS.md (D-28, D-31).
export default function AdminDashboardPage() {
  const { status, data, refetch } = useResource<KycListResponse>(
    ['dashboard', 'kyc-queue'],
    async (signal) =>
      (await api.get<KycListResponse>('/admin/kyc?status=submitted&limit=5', { signal })).data,
  );

  const reviewQueue = data?.items ?? [];
  const counts = data?.counts ?? {};

  const pendingKycCount = (counts['submitted'] ?? 0) + (counts['under_review'] ?? 0);

  const tiles = [
    {
      label: t('adminDashboard.pendingKyc'),
      icon: FileCheck,
      href: '/kyc',
      live: true,
      value: status === 'ready' ? String(pendingKycCount) : null,
      sub: 'Submissions to review',
    },
    {
      label: t('adminDashboard.totalClients'),
      icon: Users,
      href: '/clients',
      live: false,
      value: null,
      sub: 'Needs GET /admin/clients',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('adminDashboard.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('adminDashboard.subtitle')}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <Link
              key={tile.label}
              href={tile.href}
              className="rounded-lg border border-border bg-card p-6 shadow-sm hover:bg-accent/40 block focus-outline"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">{tile.label}</p>
                <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </div>
              <p className="text-2xl font-bold mt-2">
                {tile.live ? (
                  status === 'loading' ? (
                    <Loader2
                      className="h-6 w-6 animate-spin text-link"
                      aria-label={t('common.loading')}
                    />
                  ) : (
                    (tile.value ?? '—')
                  )
                ) : (
                  <span className="text-muted-foreground" title={tile.sub}>
                    —
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {tile.live ? tile.sub : <span className="italic">{tile.sub}</span>}
              </p>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-card shadow-sm">
          <div className="p-6 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold">{t('adminDashboard.kycQueue')}</h2>
            <Link
              href="/kyc"
              className="inline-flex items-center gap-1 text-xs font-semibold text-link hover:underline focus-outline rounded-sm"
            >
              <span>{t('adminDashboard.viewAll')}</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {status === 'loading' ? (
            <div className="p-8 flex justify-center" role="status" aria-live="polite">
              <PageLoader label="Loading KYC queue…" />
            </div>
          ) : status === 'error' || status === 'unavailable' ? (
            <div className="p-6 text-center space-y-2" role="alert">
              <p className="text-sm text-muted-foreground">{t('adminDashboard.kycQueueFailed')}</p>
              <button
                type="button"
                onClick={() => void refetch()}
                className="text-xs font-semibold text-link hover:underline focus-outline rounded-sm"
              >
                {t('common.retryShort')}
              </button>
            </div>
          ) : reviewQueue.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              {t('adminDashboard.kycQueueEmpty')}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {reviewQueue.map((k) => (
                <li key={k.userId}>
                  <Link
                    href={`/kyc/${k.userId}`}
                    className="flex items-center justify-between p-4 hover:bg-accent/40 focus-outline"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {[k.user?.firstName, k.user?.lastName].filter(Boolean).join(' ') ||
                          k.user?.email ||
                          k.userId}
                      </p>
                      <p className="text-xs text-muted-foreground">{k.user?.email}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {k.submittedAt ? new Date(k.submittedAt).toLocaleDateString() : ''}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card shadow-sm">
          <div className="p-6 border-b border-border">
            <h2 className="font-semibold">{t('adminDashboard.comingOnline')}</h2>
          </div>
          <div className="p-6 text-sm text-muted-foreground space-y-2">
            <p>{t('adminDashboard.statsSubtitle')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
