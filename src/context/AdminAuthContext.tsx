'use client';

import React, { createContext, useContext, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, startProactiveRefresh } from '@/lib/api/client';
import { authApi } from '@/lib/api/auth';
import { adminApi } from '@/lib/api/admin';
import { assertPermissionKeysExist } from '@/lib/permissions';
import { announceSessionEvent, onSessionEvent } from '@/lib/session-channel';
import { isPublicPath } from '@/lib/public-paths';
import type { components } from '@/lib/api/types.gen';

// Generated from the backend's Swagger — never hand-written. A rename of
// `permissions` becomes a compile error here instead of hasPermission()
// silently returning false for everyone.
export type AdminProfile = components['schemas']['AdminProfileDto'];

interface AdminAuthContextType {
  admin: AdminProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /**
   * The identity request failed for a reason that is NOT "you have no session".
   *
   * A 401 means signed out and is handled by the interceptor. Anything else —
   * the API being down, a 500, a timeout, an offline moment — means we do not
   * KNOW who this is, which is a different state and must be rendered
   * differently.
   *
   * Without this the two were indistinguishable: `useQuery` collapses an error
   * into `data === undefined`, `admin` became null, and `admin-layout.tsx`
   * rendered its "the interceptor is redirecting" spinner. Nothing was
   * redirecting, so stopping the backend left the console spinning forever with
   * no error, no retry and no way to reach the sign-in page.
   */
  isUnreachable: boolean;
  /** Retry the identity request after a transport failure. */
  retry: () => Promise<void>;
  /**
   * Re-ask who this is. Resolves to whether the answer arrived.
   *
   * It used to resolve `void`, which made a failure indistinguishable from a
   * success at every call site — and the login page had one: it awaited this and
   * navigated regardless, so a transient failure right after a successful
   * sign-in landed the operator in a console that knew nothing about them.
   */
  refetchAdmin: () => Promise<boolean>;
  logout: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextType>({
  admin: null,
  isLoading: true,
  isAuthenticated: false,
  isUnreachable: false,
  retry: () => Promise.resolve(),
  refetchAdmin: () => Promise.resolve(false),
  logout: async () => {},
});

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  // A query, not useEffect + useState: an unauthenticated visitor gets one 401
  // and stays settled, rather than a render pass driven by an effect.
  const {
    data,
    isPending,
    error,
    refetch: refetchMe,
  } = useQuery({
    queryKey: ['admin', 'me'],
    queryFn: async () => {
      const res = await apiClient.get<AdminProfile>('/admin/auth/me');
      startProactiveRefresh();
      return res.data;
    },
    /*
     * `retry: false` for a 401 — that is a settled answer, not a blip.
     *
     * A 5xx or a network failure IS worth retrying, and retrying it is what
     * turns a one-second API restart into a recoverable hiccup rather than a
     * frozen console. Same rule as `query-provider.tsx` applies to every other
     * query; identity was the one exempt from it for no reason.
     */
    retry: (failureCount, err: unknown) => {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status !== undefined && status < 500) return false;
      return failureCount < 2;
    },
    staleTime: 5 * 60_000,
    /*
     * Re-ask when the operator comes back to the tab.
     *
     * `query-provider.tsx` disables this globally, which is right for data
     * screens and wrong for identity: with no mount, no focus refetch and no
     * interval, a permission change never reached an open tab. A master admin
     * revoking `withdrawals.approve` took effect on the API immediately while
     * the console kept offering the button.
     *
     * It is also half of the cross-tab story: a tab that was signed out
     * elsewhere finds out as soon as somebody looks at it.
     */
    refetchOnWindowFocus: true,
  });

  const admin = data ?? null;

  /*
   * Failed, but NOT because there is no session.
   *
   * 401 is the signed-out answer and the interceptor owns it. Everything else is
   * "we could not ask", which the layout renders as an error with a retry rather
   * than as a spinner that never resolves.
   */
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  const isUnreachable = error !== null && status !== 401;

  const retry = useCallback(async () => {
    await refetchMe();
  }, [refetchMe]);

  const refetchAdmin = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'me'] });
    // `invalidateQueries` resolves even when the refetch behind it errored, so
    // the ANSWER has to be read from the query itself.
    const result = await refetchMe();
    return result.data !== undefined;
  }, [queryClient, refetchMe]);

  /*
   * Dev-only: shout if any route in permissions.ts demands a key the backend
   * does not define. Such a key can never be granted, so the route silently
   * becomes master-admin-only with nothing anywhere to explain why.
   *
   * `GET /admin/permissions` requires `roles.view` OR `admins.view`, so an
   * administrator holding neither gets a 403 here — which is a perfectly
   * ordinary answer for a narrow role, NOT drift, and must not be reported as
   * though it were. The catch says which happened instead of discarding it:
   * swallowing everything is what let a failed fetch reach the check as an
   * empty catalog and print 22 phantom orphans.
   */
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' || !admin) return;
    adminApi
      .getPermissions()
      .then((catalog) =>
        assertPermissionKeysExist(
          Object.values(catalog).flatMap((m) => (m.permissions ?? []).map((p) => p.key)),
        ),
      )
      .catch((err: unknown) => {
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 403) {
          // Expected for a role without roles.view/admins.view. Not drift.
          return;
        }
        console.error(
          `[permissions] Could not fetch the backend permission catalog (${status ?? 'network error'}), ` +
            'so route keys were not checked against it this session.',
        );
      });
  }, [admin]);

  /*
   * A session that ended somewhere else ends here too.
   *
   * Without this, signing out in one tab left every other tab rendering the full
   * console — its React Query cache intact, its chrome intact — until somebody
   * clicked something that fired a request. On a shared back-office machine that
   * is the console still showing an operator's name and data to whoever sits
   * down next.
   *
   * A hard navigation rather than a router push, for the same reason `logout`
   * uses one: only a full load discards the cache and the JS context.
   */
  useEffect(() => {
    return onSessionEvent((event) => {
      if (event !== 'signed-out') return;
      if (typeof window === 'undefined') return;
      if (isPublicPath(window.location.pathname)) return;
      // A HARD navigation, deliberately, against @next/next's advice: a
      // router push keeps this tab's JS context — and therefore the previous
      // operator's cached data — alive into the sign-in screen. Same reasoning
      // as `logout` below and as `endDeadSession` in lib/api/client.ts.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = '/login';
    });
  }, []);

  /**
   * Ends the session, and does NOT pretend to when it could not.
   *
   * `authApi.logout` now retries once and then throws. Navigating anyway would
   * show a clean login screen over a session that is still live server-side —
   * and since R-3.2 this app cannot clear an httpOnly cookie itself, "still live
   * server-side" also means "still live in this browser". On a shared machine
   * that is the whole risk: the admin believes they signed out and the next
   * person is signed in as them.
   *
   * So a failure propagates to the caller, which surfaces it. The button stays,
   * and the session is still there to try again.
   */
  const logout = useCallback(async () => {
    await authApi.logout();
    // Only after the server confirmed it. Announcing first would close every
    // other tab on a logout that then failed, which is the opposite of the
    // honesty `authApi.logout` goes out of its way to preserve.
    announceSessionEvent('signed-out');
    /*
     * Navigate, and do NOT `queryClient.clear()` first.
     *
     * Clearing removes every query from the cache, and every mounted observer
     * responds by refetching — against a session the server has just revoked. So
     * the two lines between `clear()` and the navigation produced a burst of
     * 401s, each of which reached the response interceptor, which raced this
     * assignment with a `window.location.href` of its own.
     *
     * The clear was never what made logout safe anyway: this is a HARD
     * navigation precisely because a full page load discards the React Query
     * cache, the auth context and every rendered row together. That guarantee is
     * the one the comment always claimed, and it does not need help.
     */
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = '/login';
  }, []);

  return (
    <AdminAuthContext.Provider
      value={{
        admin,
        isLoading: isPending,
        isAuthenticated: !!admin,
        isUnreachable,
        retry,
        refetchAdmin,
        logout,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdmin() {
  return useContext(AdminAuthContext);
}
