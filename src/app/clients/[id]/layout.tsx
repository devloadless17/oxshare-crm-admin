import { AdminLayout } from '@/components/layout/admin-layout';

export default function ClientProfileLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayout>{children}</AdminLayout>;
}
