import type { Metadata } from 'next';
import { AdminLayout } from '@/components/layout/admin-layout';

export const metadata: Metadata = { title: 'Roles & Permissions — OxShare Admin' };

export default function RolesLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayout>{children}</AdminLayout>;
}
