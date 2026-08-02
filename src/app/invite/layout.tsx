'use client';

import { usePathname } from 'next/navigation';
import { AdminLayout } from '@/components/layout/admin-layout';

// /invite/accept is the public page reached from the invite email — no sidebar.
export default function InviteLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith('/invite/accept')) {
    return <>{children}</>;
  }
  return <AdminLayout>{children}</AdminLayout>;
}
