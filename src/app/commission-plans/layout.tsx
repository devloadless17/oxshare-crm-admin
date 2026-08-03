import type { Metadata } from 'next';
import { AdminLayout } from '@/components/layout/admin-layout';

export const metadata: Metadata = { title: 'Commission Plans — OxShare Admin' };

export default function CommissionPlansLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayout>{children}</AdminLayout>;
}
