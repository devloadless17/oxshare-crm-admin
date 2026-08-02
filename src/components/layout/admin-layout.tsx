'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Building2,
  ArrowUpRight,
  FileCheck,
  Percent,
  Wallet,
  Receipt,
  LineChart,
  ShieldCheck,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Bell,
  Search,
  Menu,
  X,
  Shield,
  Activity,
} from 'lucide-react';
import { ThemeToggle } from '../theme-toggle';
import { useAdmin } from '@/context/AdminAuthContext';
import { canAccess } from '@/lib/permissions';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: string | number;
  /** Page not built yet — rendered as a disabled "Soon" entry instead of a link. */
  comingSoon?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'MAIN',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { label: 'Clients', href: '/clients', icon: Users },
      { label: 'Partners / IBs', href: '/partners', icon: Building2 },
      { label: 'Trading Accounts', href: '/trading-accounts', icon: LineChart, comingSoon: true },
    ],
  },
  {
    title: 'FINANCIALS',
    items: [
      { label: 'Withdrawals', href: '/withdrawals', icon: ArrowUpRight },
      { label: 'Payouts', href: '/payouts', icon: Wallet, comingSoon: true },
      { label: 'Ledger', href: '/ledger', icon: Receipt, comingSoon: true },
      { label: 'Commission Plans', href: '/commission-plans', icon: Percent, comingSoon: true },
    ],
  },
  {
    title: 'MANAGEMENT',
    items: [
      { label: 'KYC Review', href: '/kyc', icon: FileCheck },
      { label: 'KYC Workflow Builder', href: '/kyc/builder', icon: Settings },
      { label: 'Roles & Permissions', href: '/roles', icon: ShieldCheck },
      { label: 'Admin Users', href: '/admin-users', icon: Users, comingSoon: true },
      { label: 'Audit Log', href: '/audit-log', icon: Activity },
      { label: 'Settings', href: '/settings', icon: Settings },
    ],
  },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { admin, logout } = useAdmin();
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  // Close mobile sidebar on route change
  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 flex flex-col border-r border-[#1e293b] bg-[#0f172a] text-[#f8fafc] transition-all duration-300 ${
          collapsed ? 'w-20' : 'w-64'
        } ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        {/* Sidebar Header */}
        <div className="flex h-16 items-center justify-between border-b border-[#1e293b] px-4">
          <Link href="/dashboard" className="flex items-center gap-3 overflow-hidden">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-md shadow-blue-500/20">
              <Shield className="h-5 w-5" />
            </div>
            {!collapsed && (
              <div className="flex flex-col">
                <span suppressHydrationWarning className="text-sm font-bold tracking-wider text-white">OXSHARE</span>
                <span className="text-[10px] font-semibold tracking-widest text-blue-400 uppercase">
                  Admin Portal
                </span>
              </div>
            )}
          </Link>

          {/* Desktop Collapse Toggle */}
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-[#1e293b] hover:text-white transition-colors"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>

          {/* Mobile Close */}
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="flex lg:hidden h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-[#1e293b] hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Sidebar Navigation — items filtered by the admin's permissions (RBAC-03 nav half) */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {NAV_SECTIONS.map((section) => {
            const visibleItems = admin
              ? section.items.filter((item) => canAccess(admin, item.href))
              : section.items;
            if (visibleItems.length === 0) return null;
            return (
            <div key={section.title} className="space-y-1">
              {!collapsed && (
                <h3 className="px-3 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                  {section.title}
                </h3>
              )}
              {visibleItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');

                if (item.comingSoon) {
                  return (
                    <div
                      key={item.href}
                      title={collapsed ? `${item.label} — coming soon` : undefined}
                      aria-disabled="true"
                      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-500 cursor-not-allowed select-none ${
                        collapsed ? 'justify-center px-0' : ''
                      }`}
                    >
                      <Icon className="h-5 w-5 shrink-0 text-slate-500" />
                      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                      {!collapsed && (
                        <span className="ml-auto rounded-full bg-slate-500/15 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-slate-400 uppercase">
                          Soon
                        </span>
                      )}
                    </div>
                  );
                }

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                        : 'text-slate-300 hover:bg-[#1e293b] hover:text-white'
                    } ${collapsed ? 'justify-center px-0' : ''}`}
                  >
                    <Icon
                      className={`h-5 w-5 shrink-0 transition-transform group-hover:scale-110 ${
                        isActive ? 'text-white' : 'text-slate-400 group-hover:text-blue-400'
                      }`}
                    />
                    {!collapsed && (
                      <span className="flex-1 truncate">{item.label}</span>
                    )}
                    {!collapsed && item.badge && (
                      <span className="ml-auto rounded-full bg-blue-500/20 px-2 py-0.5 text-[11px] font-semibold text-blue-300">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
            );
          })}
        </nav>

        {/* Sidebar User Footer */}
        <div className="border-t border-[#1e293b] p-3">
          <div
            className={`flex items-center gap-3 rounded-lg bg-[#162032] p-2.5 ${
              collapsed ? 'justify-center p-2' : ''
            }`}
          >
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white shadow-sm">
              {admin?.name ? admin.name[0].toUpperCase() : 'A'}
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-[#0f172a]" />
            </div>

            {!collapsed && (
              <div className="flex-1 overflow-hidden">
                <p className="truncate text-xs font-semibold text-white">{admin?.name || 'Admin'}</p>
                <p className="truncate text-[11px] text-slate-400">{admin?.email || ''}</p>
              </div>
            )}

            {!collapsed && (
              <button
                type="button"
                onClick={logout}
                title="Logout"
                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-rose-500/20 hover:text-rose-400 transition-colors"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div
        className={`flex flex-1 flex-col transition-all duration-300 ${
          collapsed ? 'lg:pl-20' : 'lg:pl-64'
        }`}
      >
        {/* Top Header */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/95 backdrop-blur-md px-4 lg:px-8">
          {/* Left: Mobile Toggle & Title */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="flex lg:hidden h-9 w-9 items-center justify-center rounded-md border border-border text-foreground hover:bg-muted"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Quick Search Bar */}
            <div className="relative hidden sm:block w-64 md:w-80">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="search"
                placeholder="Search clients, deals, IBs... (⌘K)"
                className="h-9 w-full rounded-lg border border-input bg-muted/30 pl-9 pr-4 text-xs focus:bg-background focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all"
              />
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-3">
            {/* System Live Status */}
            <div className="hidden md:flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              <Activity className="h-3.5 w-3.5 animate-pulse" />
              <span>System Operational</span>
            </div>

            {/* Notifications */}
            <button
              type="button"
              className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border text-foreground hover:bg-muted transition-colors"
              title="Notifications"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-blue-600" />
            </button>

            {/* Theme Switcher Toggle */}
            <ThemeToggle />
          </div>
        </header>

        {/* Page Content Container — route half of RBAC-03; the API-side 403 is tracked in D-28 */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto">
          {admin && !canAccess(admin, pathname ?? '') ? (
            <div className="flex flex-col items-center justify-center py-24 text-center gap-3" role="alert">
              <Shield className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
              <h2 className="text-lg font-bold text-foreground">Access denied</h2>
              <p className="text-sm text-muted-foreground max-w-sm">
                Your role does not include access to this section. Ask a master admin if you need it.
              </p>
              <Link href="/dashboard" className="text-sm font-semibold text-blue-500 hover:underline">
                Back to dashboard
              </Link>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
