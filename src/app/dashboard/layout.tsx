import type { Metadata } from 'next';
import { AdminLayout } from '@/components/layout/admin-layout';

export const metadata: Metadata = { title: 'Dashboard — OxShare Admin' };

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayout>{children}</AdminLayout>;
}
