import type { Metadata } from 'next';
import { AdminLayout } from '@/components/layout/admin-layout';

// The list reads live methods, so the page is a client component and its
// metadata lives here.
export const metadata: Metadata = { title: 'Payment methods — OXShare Admin' };

export default function PaymentMethodsLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayout>{children}</AdminLayout>;
}
