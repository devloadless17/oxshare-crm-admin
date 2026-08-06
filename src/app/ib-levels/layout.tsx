import type { Metadata } from 'next';
import { AdminLayout } from '@/components/layout/admin-layout';

// The page reads the live ladder, so it is a client component and its metadata
// lives here instead — same arrangement as app/currencies/layout.tsx.
export const metadata: Metadata = { title: 'IB Levels — OXShare Admin' };

export default function IbLevelsLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayout>{children}</AdminLayout>;
}
