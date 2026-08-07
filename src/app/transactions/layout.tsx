import type { Metadata } from 'next';
import { AdminLayout } from '@/components/layout/admin-layout';

// The queue reads live withdrawals, so the page is a client component and its
// metadata lives here — same arrangement as app/currencies/layout.tsx.
export const metadata: Metadata = { title: 'Transactions — OXShare Admin' };

export default function TransactionsLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayout>{children}</AdminLayout>;
}
