'use client';

import React, { createContext, useContext, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, startProactiveRefresh } from '@/lib/api/client';
import { authApi } from '@/lib/api/auth';
import { adminApi } from '@/lib/api/admin';
import { assertPermissionKeysExist } from '@/lib/permissions';
import type { components } from '@/lib/api/types.gen';

// Generated from the backend's Swagger — never hand-written. A rename of
// `permissions` becomes a compile error here instead of hasPermission()
// silently returning false for everyone.
export type AdminProfile = components['schemas']['AdminProfileDto'];

interface AdminAuthContextType {
  admin: AdminProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  refetchAdmin: () => Promise<void>;
  logout: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextType>({
  admin: null,
  isLoading: true,
  isAuthenticated: false,
  refetchAdmin: async () => {},
  logout: async () => {},
});

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  // A query, not useEffect + useState: an unauthenticated visitor gets one 401
  // and stays settled, rather than a render pass driven by an effect.
  const { data, isPending } = useQuery({
    queryKey: ['admin', 'me'],
    queryFn: async () => {
      const res = await apiClient.get<AdminProfile>('/admin/auth/me');
      startProactiveRefresh();
      return res.data;
    },
    retry: false,
    staleTime: 5 * 60_000,
  });

  const admin = data ?? null;

  const refetchAdmin = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'me'] });
  }, [queryClient]);

  // Dev-only: shout if any route in permissions.ts demands a key the backend
  // does not define. Such a key can never be granted, so the route silently
  // becomes master-admin-only with nothing anywhere to explain why.
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' || !admin) return;
    adminApi
      .getPermissions()
      .then((catalog) =>
        assertPermissionKeysExist(
          Object.values(catalog).flatMap((m) => (m.permissions ?? []).map((p) => p.key)),
        ),
      )
      .catch(() => undefined);
  }, [admin]);

  const logout = useCallback(async () => {
    await authApi.logout();
    queryClient.clear();
    // A HARD navigation, deliberately. `queryClient.clear()` drops the cache but
    // not the rest of the JS context; a full load is what guarantees no admin
    // data survives the logout into the next session on a shared machine.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = '/login';
  }, [queryClient]);

  return (
    <AdminAuthContext.Provider
      value={{ admin, isLoading: isPending, isAuthenticated: !!admin, refetchAdmin, logout }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdmin() {
  return useContext(AdminAuthContext);
}
