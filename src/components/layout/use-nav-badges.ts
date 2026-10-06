'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AdminProfile } from '@/context/AdminAuthContext';
import api from '@/lib/api';
import type { KycListResponse } from '@/lib/api/admin';
import { hasPermission } from '@/lib/permissions';
import { keys } from '@/lib/query-keys';
import type { NavBadges } from './navigation';

/**
 * How much work is waiting in each queue, keyed by the nav href that opens it.
 *
 * Moved out of `admin-layout.tsx` whole when the sidebar gained main items. A
 * badge is not a property of the route, it is a property of right now — so the
 * tree in `navigation.ts` stays a constant and this is where the two meet. The
 * KYC nav badge in the portal records what happens otherwise: it was baked into
 * the constant, evaluated once at import, and told an approved client their
 * verification was "Required" forever.
 *
 * `useQuery` directly rather than `useResource`: each of these is a NUMBER on a
 * nav item, and the Resource states exist so a screen can tell loading from
 * unavailable from error. None of those has a rendering here — a count that
 * cannot be read is a badge that is not drawn, which is what an absent key
 * already means.
 *
 * Each query is gated on the permission its endpoint requires, so a restricted
 * admin fires no request that would 403 on every page load. Refetched on an
 * interval rather than on focus: a queue count going stale by a minute costs
 * nothing, and this runs behind every screen in the console. `limit: 1` on all
 * four — the count rides in the response envelope, so a page of rows nobody
 * renders is pure waste. A failed count must not surface as an error anywhere:
 * the nav simply shows no badge, which reads the same as none pending.
 */
export function useNavBadges(admin: AdminProfile | null): NavBadges {
  const canSeeApplications = hasPermission(admin, 'ib.view');
  const pendingApplications = useQuery({
    queryKey: keys.ibApplications.pendingCount(),
    queryFn: () => api.admin.getIbApplications({ status: 'pending', limit: 1 }),
    enabled: canSeeApplications,
    refetchInterval: 60_000,
    retry: false,
  });

  const canReviewKyc = hasPermission(admin, 'kyc.review') || hasPermission(admin, 'kyc.view');
  const pendingKyc = useQuery({
    queryKey: keys.kyc.pendingCount(),
    queryFn: async () =>
      (await api.get<KycListResponse>('/admin/kyc?status=needs_review&limit=1')).data,
    enabled: canReviewKyc,
    refetchInterval: 60_000,
    retry: false,
  });

  const canSeeDeposits = hasPermission(admin, 'deposits.view');
  const pendingDeposits = useQuery({
    queryKey: keys.deposits.pendingCount(),
    // The desk's own queue: deposits a person decides (backend 0168).
    // The desk's own endpoint, on the key this badge is shown for (`deposits.view`).
    queryFn: () => api.admin.getDeskDeposits({ state: 'pending', limit: 1 }),
    enabled: canSeeDeposits,
    refetchInterval: 60_000,
    retry: false,
  });

  const canSeeWithdrawals = hasPermission(admin, 'withdrawals.view');
  const pendingWithdrawals = useQuery({
    queryKey: keys.withdrawals.pendingCount(),
    queryFn: () => api.admin.getWithdrawals({ state: 'pending', limit: 1 }),
    enabled: canSeeWithdrawals,
    refetchInterval: 60_000,
    retry: false,
  });

  const ibPending = pendingApplications.data?.counts.pending;

  /*
   * `needs_review`, served by the API — not summed here.
   *
   * This used to add `submitted + under_review` itself, which was right, and was
   * the THIRD place that definition lived: the backend filter resolves the same
   * pair, and the queue's own "Needs review" tab read a `counts.needs_review`
   * key that did not exist and so displayed 0 for ever. Three authors, two
   * agreeing by luck and one silently wrong. The API computes it once now, so
   * the badge, the tab and the filter cannot disagree.
   */
  const kycPending = pendingKyc.data?.counts?.['needs_review'];

  /*
   * `counts.pending`, never `total`, on both money desks. The two read the same
   * today because each query filters to `pending` — but `counts` is the
   * per-state map the endpoint computes over the WHOLE filtered set, so it stays
   * correct if that filter is ever relaxed, while `total` would silently start
   * counting every withdrawal ever made.
   */
  const depositsPending = pendingDeposits.data?.counts?.['pending'];
  const withdrawalsPending = pendingWithdrawals.data?.counts?.['pending'];

  return React.useMemo(() => {
    /*
     * A zero is left out entirely: an absent key means "draw nothing", and a
     * red `0` beside a cleared queue is an alarm about the absence of work.
     */
    const badges: Partial<Record<string, number>> = {};
    if (ibPending) badges['/approvals/ib'] = ibPending;
    if (kycPending) badges['/kyc'] = kycPending;
    if (depositsPending) badges['/approvals/deposits'] = depositsPending;
    if (withdrawalsPending) badges['/transactions'] = withdrawalsPending;
    return badges;
  }, [ibPending, kycPending, depositsPending, withdrawalsPending]);
}
