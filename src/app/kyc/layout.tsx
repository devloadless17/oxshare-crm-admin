import { AdminLayout } from '@/components/layout/admin-layout';

export default function KycLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayout>{children}</AdminLayout>;
}
