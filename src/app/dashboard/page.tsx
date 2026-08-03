'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Building2, FileCheck, Loader2, Users } from 'lucide-react';
import api from '@/lib/api';

// The dashboard shows real data where an endpoint exists (KYC queue) and an
// explicit pending marker where it does not — never invented numbers (D-30).
// Missing sources are tracked in docs/DECISIONS.md (D-28, D-31).
interface KycRow {
  userId: string;
  status: string;
  submittedAt?: string;
  user?: { email: string; firstName?: string; lastName?: string };
}

interface KycListResponse {
  items: KycRow[];
  counts: Record<string, number>;
}

type LoadState = 'loading' | 'ready' | 'error';

export default function AdminDashboardPage() {
  const [reviewQueue, setReviewQueue] = useState<KycRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loadState, setLoadState] = useState<LoadState>('loading');

  const load = useCallback(() => {
    setLoadState('loading');
    api.get<KycListResponse>('/admin/kyc?status=submitted&limit=5')
      .then((r) => {
        setReviewQueue(r.data.items ?? []);
        setCounts(r.data.counts ?? {});
        setLoadState('ready');
      })
      .catch(() => setLoadState('error'));
  }, []);

  useEffect(() => { load(); }, [load]);

  const pendingKycCount = (counts['submitted'] ?? 0) + (counts['under_review'] ?? 0);

  const tiles = [
    {
      label: 'Pending KYC',
      icon: FileCheck,
      href: '/kyc',
      live: true,
      value: loadState === 'ready' ? String(pendingKycCount) : null,
      sub: 'Submissions to review',
    },
    {
      label: 'Total Clients',
      icon: Users,
      href: '/clients',
      live: false,
      value: null,
      sub: 'Needs GET /admin/clients',
    },
    {
      label: 'Active Partners',
      icon: Building2,
      href: '/partners',
      live: false,
      value: null,
      sub: 'Needs GET /admin/partners',
    },
    {
      label: 'Pending Withdrawals',
      icon: ArrowUpRight,
      href: '/withdrawals',
      live: false,
      value: null,
      sub: 'Needs GET /admin/withdrawals',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Back-office overview</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.label}
              href={t.href}
              className="rounded-lg border border-border bg-card p-6 shadow-sm hover:bg-accent/40 block focus-outline"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">{t.label}</p>
                <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </div>
              <p className="text-2xl font-bold mt-2">
                {t.live
                  ? (loadState === 'loading' ? <Loader2 className="h-6 w-6 animate-spin text-link" aria-label="Loading" /> : t.value ?? '—')
                  : <span className="text-muted-foreground" title={t.sub}>—</span>}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t.live ? t.sub : <span className="italic">{t.sub}</span>}
              </p>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-card shadow-sm">
          <div className="p-6 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold">KYC Review Queue</h2>
            <Link href="/kyc" className="text-xs font-semibold text-link hover:underline focus-outline rounded-sm">
              View all →
            </Link>
          </div>
          {loadState === 'loading' ? (
            <div className="p-8 flex justify-center" role="status" aria-live="polite">
              <Loader2 className="h-6 w-6 animate-spin text-link" />
              <span className="sr-only">Loading KYC queue</span>
            </div>
          ) : loadState === 'error' ? (
            <div className="p-6 text-center space-y-2" role="alert">
              <p className="text-sm text-muted-foreground">Failed to load the KYC queue.</p>
              <button type="button" onClick={load} className="text-xs font-semibold text-link hover:underline focus-outline rounded-sm">
                Retry
              </button>
            </div>
          ) : reviewQueue.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">No submissions waiting for review.</div>
          ) : (
            <ul className="divide-y divide-border">
              {reviewQueue.map((k) => (
                <li key={k.userId}>
                  <Link href={`/kyc/${k.userId}`} className="flex items-center justify-between p-4 hover:bg-accent/40 focus-outline">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {[k.user?.firstName, k.user?.lastName].filter(Boolean).join(' ') || k.user?.email || k.userId}
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
          <div className="p-6 border-b border-border"><h2 className="font-semibold">Coming Online</h2></div>
          <div className="p-6 text-sm text-muted-foreground space-y-2">
            <p>
              Client, partner, and withdrawal metrics activate automatically once their backend
              endpoints exist. The missing endpoints are listed on each page and tracked in
              DECISIONS.md (D-28, D-31).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
