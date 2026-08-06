import type { Metadata } from 'next';
import { AdminLayout } from '@/components/layout/admin-layout';

// The list reads live partners, so the page is a client component and its
// metadata lives here — same arrangement as app/ib-levels/layout.tsx.
export const metadata: Metadata = { title: 'Partners — OXShare Admin' };

export default function PartnersLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayout>{children}</AdminLayout>;
}
