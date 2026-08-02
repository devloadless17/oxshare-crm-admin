import { AdminLayout } from '@/components/layout/admin-layout';

export default function ClientsLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayout>{children}</AdminLayout>;
}
