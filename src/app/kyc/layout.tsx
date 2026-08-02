import type { Metadata } from 'next';
import { AdminLayout } from '@/components/layout/admin-layout';

export const metadata: Metadata = { title: 'KYC Review — OxShare Admin' };

export default function KycLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayout>{children}</AdminLayout>;
}
