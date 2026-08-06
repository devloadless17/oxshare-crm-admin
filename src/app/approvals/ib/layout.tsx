import type { Metadata } from 'next';
import { AdminLayout } from '@/components/layout/admin-layout';

// The queue reads live applications, so the page is a client component and its
// metadata lives here — same arrangement as app/ib-levels/layout.tsx.
export const metadata: Metadata = { title: 'Partner approvals — OXShare Admin' };

export default function PartnerApprovalsLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayout>{children}</AdminLayout>;
}
