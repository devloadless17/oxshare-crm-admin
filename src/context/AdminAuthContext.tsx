'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api from '@/lib/api';

export interface AdminProfile {
  id: string;
  email: string;
  name: string;
  role: 'master_admin' | 'sub_admin';
  permissions: string[];
  createdAt: string;
}

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
  const [admin, setAdmin] = useState<AdminProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAdmin = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/auth/me');
      setAdmin(data);
    } catch {
      setAdmin(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAdmin();
  }, [fetchAdmin]);

  const logout = async () => {
    try {
      await api.post('/admin/auth/logout');
    } catch {
      // ignore
    } finally {
      setAdmin(null);
      window.location.href = '/login';
    }
  };

  return (
    <AdminAuthContext.Provider
      value={{
        admin,
        isLoading,
        isAuthenticated: !!admin,
        refetchAdmin: fetchAdmin,
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
