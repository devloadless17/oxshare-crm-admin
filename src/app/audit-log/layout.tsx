import type { Metadata } from 'next';
import { AdminLayout } from '@/components/layout/admin-layout';

export const metadata: Metadata = { title: 'Audit Log — OxShare Admin' };

export default function AuditLogLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayout>{children}</AdminLayout>;
}
