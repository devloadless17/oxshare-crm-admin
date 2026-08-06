import type { Metadata } from 'next';
import { AdminLayout } from '@/components/layout/admin-layout';

// The page reads the live currency list, so it is a client component and its
// metadata lives here instead.
export const metadata: Metadata = { title: 'Currencies — OXShare Admin' };

export default function CurrenciesLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayout>{children}</AdminLayout>;
}
