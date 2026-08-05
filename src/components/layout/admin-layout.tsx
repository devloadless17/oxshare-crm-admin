'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
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
  Lock,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Bell,
  Search,
  Menu,
  X,
  Shield,
  Activity,
  Loader2,
} from 'lucide-react';
import { ThemeToggle } from '../theme-toggle';
import { useAdmin } from '@/context/AdminAuthContext';
import { canAccess } from '@/lib/permissions';
import { t, type MessageKey } from '@/lib/i18n';

interface NavItem {
  /** A message key, not a string — resolved through t() at render time. */
  label: MessageKey;
  href: string;
  icon: React.ElementType;
  badge?: string | number;
  /** Page not built yet — rendered as a disabled "Soon" entry instead of a link. */
  comingSoon?: boolean;
}

interface NavSection {
  title: MessageKey;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'nav.section.main',
    items: [
      { label: 'nav.dashboard', href: '/dashboard', icon: LayoutDashboard },
      { label: 'nav.clients', href: '/clients', icon: Users },
      { label: 'nav.partners', href: '/partners', icon: Building2 },
      {
        label: 'nav.tradingAccounts',
        href: '/trading-accounts',
        icon: LineChart,
        comingSoon: true,
      },
    ],
  },
  {
    title: 'nav.section.financials',
    items: [
      { label: 'nav.withdrawals', href: '/withdrawals', icon: ArrowUpRight },
      { label: 'nav.payouts', href: '/payouts', icon: Wallet, comingSoon: true },
      { label: 'nav.ledger', href: '/ledger', icon: Receipt },
      { label: 'nav.commissionPlans', href: '/commission-plans', icon: Percent },
    ],
  },
  {
    title: 'nav.section.management',
    items: [
      { label: 'nav.kyc', href: '/kyc', icon: FileCheck },
      { label: 'nav.kycBuilder', href: '/kyc/builder', icon: Settings },
      // No longer comingSoon: the directory was built the whole time, hidden as
      // a tab inside /settings, while this entry told operators it was unbuilt.
      { label: 'nav.adminUsers', href: '/admin-users', icon: Users },
      { label: 'nav.roles', href: '/roles', icon: ShieldCheck },
      { label: 'nav.auditLog', href: '/audit-log', icon: Activity },
      // Lock, not Settings: that icon is the KYC Builder's, and this page is
      // now network access and security controls rather than general config.
      { label: 'nav.settings', href: '/settings', icon: Lock },
    ],
  },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { admin, isLoading, logout } = useAdmin();
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [logoutError, setLogoutError] = React.useState<string | null>(null);

  /**
   * Logout, with the failure made visible instead of swallowed.
   *
   * `authApi.logout` retries once and then throws, and it throws for a reason
   * worth showing: only the server can end this session — it revokes the
   * refresh-token family and clears the httpOnly cookies — so a failed call
   * leaves the admin fully signed in. Navigating to /login anyway would show a
   * sign-in screen over a live session on a machine the admin is about to walk
   * away from.
   */
  const handleLogout = async () => {
    setLogoutError(null);
    try {
      await logout();
    } catch {
      setLogoutError(t('session.logoutFailed'));
    }
  };

  // The mobile drawer closes where it is opened from — on the click that
  // navigates. Doing it in an effect keyed on `pathname` meant React ran a
  // second render pass after every navigation just to flip a boolean.
  const closeMobile = () => setMobileOpen(false);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden"
          onClick={closeMobile}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 flex flex-col border-r border-border bg-card text-card-foreground transition-all duration-300 ${
          collapsed ? 'w-20' : 'w-64'
        } ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        {/* Sidebar Header */}
        <div className="flex h-16 items-center justify-between border-b border-border px-4">
          <Link
            href="/dashboard"
            onClick={closeMobile}
            className="flex items-center gap-3 overflow-hidden focus-outline rounded-md"
          >
            <Image
              src="/oxshare-mark.svg"
              // See the note on the sign-in page: Next refuses to optimize SVG
              // without `dangerouslyAllowSVG`, and a vector needs no optimizing.
              unoptimized
              alt={t('app.name')}
              width={28}
              height={26}
              className="h-7 w-7 shrink-0 object-contain"
              priority
            />
            {!collapsed && (
              <div className="flex flex-col">
                <span
                  suppressHydrationWarning
                  className="text-sm font-semibold tracking-wider text-foreground"
                >
                  {t('app.name')}
                </span>
                <span className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
                  {t('app.adminName')}
                </span>
              </div>
            )}
          </Link>

          {/* Desktop Collapse Toggle */}
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-outline"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>

          {/* Mobile Close */}
          <button
            type="button"
            onClick={closeMobile}
            className="flex lg:hidden h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-outline"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Sidebar Navigation — items filtered by the admin's permissions (RBAC-03 nav half) */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {NAV_SECTIONS.map((section) => {
            /*
             * Nothing is shown until we know who is asking.
             *
             * This used to fall back to `section.items` — the UNFILTERED list —
             * while `admin` was null, which is the whole of the GET
             * /admin/auth/me round trip. So every sub-admin saw the complete
             * master-admin navigation on each page load, then watched it shrink.
             * Not a privilege leak (the API returns 403 and `canAccess` blocks
             * the page body), but it advertises the existence and paths of every
             * section a restricted admin is not meant to reach, and it looks like
             * a bug to the person it happens to.
             */
            const visibleItems = admin
              ? section.items.filter((item) => canAccess(admin, item.href))
              : [];
            if (visibleItems.length === 0) return null;
            return (
              <div key={t(section.title)} className="space-y-1">
                {!collapsed && (
                  <h3 className="px-3 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
                    {t(section.title)}
                  </h3>
                )}
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');

                  if (item.comingSoon) {
                    return (
                      <div
                        key={item.href}
                        title={
                          collapsed ? t('nav.comingSoonTitle', { label: t(item.label) }) : undefined
                        }
                        aria-disabled="true"
                        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground/60 cursor-not-allowed select-none ${
                          collapsed ? 'justify-center px-0' : ''
                        }`}
                      >
                        <Icon className="h-5 w-5 shrink-0 text-muted-foreground/60" />
                        {!collapsed && <span className="flex-1 truncate">{t(item.label)}</span>}
                        {!collapsed && (
                          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                            {t('nav.comingSoon')}
                          </span>
                        )}
                      </div>
                    );
                  }

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={closeMobile}
                      title={collapsed ? t(item.label) : undefined}
                      className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium focus-outline ${
                        isActive
                          ? 'bg-primary/10 font-semibold text-link'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      } ${collapsed ? 'justify-center px-0' : ''}`}
                    >
                      <Icon
                        className={`h-5 w-5 shrink-0 transition-transform group-hover:scale-110 ${
                          isActive
                            ? 'text-link'
                            : 'text-muted-foreground group-hover:text-foreground'
                        }`}
                      />
                      {!collapsed && <span className="flex-1 truncate">{t(item.label)}</span>}
                      {!collapsed && item.badge && (
                        <span className="ml-auto rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-link">
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
        <div className="border-t border-border p-3">
          <div
            className={`flex items-center gap-3 rounded-lg bg-muted p-2.5 ${
              collapsed ? 'justify-center p-2' : ''
            }`}
          >
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground shadow-sm">
              {admin?.name ? admin.name.charAt(0).toUpperCase() : 'A'}
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-card" />
            </div>

            {!collapsed && (
              <div className="flex-1 overflow-hidden">
                <p className="truncate text-xs font-semibold text-foreground">
                  {admin?.name || 'Admin'}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">{admin?.email || ''}</p>
              </div>
            )}

            {!collapsed && (
              <button
                type="button"
                onClick={() => void handleLogout()}
                title={t('nav.logout')}
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-outline"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
            {logoutError && !collapsed && (
              <p role="alert" className="mt-2 text-[11px] text-destructive">
                {logoutError}
              </p>
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
              className="flex lg:hidden h-9 w-9 items-center justify-center rounded-md border border-border text-foreground hover:bg-muted focus-outline"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Quick Search Bar */}
            <div className="relative hidden sm:block w-64 md:w-80">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="search"
                placeholder={t('nav.searchPlaceholder')}
                className="h-9 w-full rounded-lg border border-input bg-muted/30 pl-9 pr-4 text-xs focus:bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-3">
            {/* System Live Status */}
            <div className="hidden md:flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-[11px] font-medium text-success">
              <Activity className="h-3.5 w-3.5 animate-pulse" />
              <span>{t('nav.systemStatus')}</span>
            </div>

            {/* Notifications */}
            <button
              type="button"
              className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border text-foreground hover:bg-muted focus-outline"
              title={t('nav.notifications')}
            >
              <Bell className="h-4 w-4" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary" />
            </button>

            {/* Theme Switcher Toggle */}
            <ThemeToggle />
          </div>
        </header>

        {/* Page Content Container — uniform small padding, edge-to-edge layout for all admin pages */}
        <main className="flex-1 p-4 md:p-5 overflow-y-auto w-full max-w-full">
          {/*
           * FOUR states, not three — and the fourth is the one that was missing.
           *
           * `isLoading` used to fall through to `children`, so a forbidden page
           * mounted and fired its queries during the identity round trip — every
           * one guaranteed to come back 403 — and only then was replaced by the
           * panel below. Holding the frame until the answer arrives costs one
           * spinner and removes a burst of requests that exist only to fail.
           *
           * That fix left `!isLoading && admin === null` still falling through,
           * which is reachable and worse: proxy.ts admits a request on the mere
           * PRESENCE of the refresh cookie — it has no signing key and cannot
           * verify one — so a cookie that is present but dead (revoked by a
           * logout elsewhere, killed by refresh-token reuse detection, or from a
           * deleted admin) gets past the gate, `GET /admin/auth/me` 401s, and
           * `admin` settles as null with `retry: false`. The page body then
           * rendered with `canAccess` never called.
           *
           * Nothing leaked — every request behind it 401s — but the shell, the
           * controls and the empty states of a route this visitor may have no
           * permission for were drawn, until the interceptor's redirect landed a
           * round trip later. On a shared back-office machine that is a UI leak
           * of what exists, and it contradicts the deny-by-default posture two
           * files away in permissions.ts.
           *
           * `admin` is the ONLY authoritative signal here: it is the one that
           * came from the server. The refresh cookie and the CSRF cookie are
           * redirect hints, and hints do not get to decide what renders.
           */}
          {isLoading ? (
            <div className="flex items-center justify-center py-24" role="status">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
              <span className="sr-only">{t('session.loading')}</span>
            </div>
          ) : !admin ? (
            <div className="flex items-center justify-center py-24" role="status">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
              {/* The 401 interceptor is already navigating to /login; this is
                  what the frame shows in the meantime, and it is deliberately
                  not the children. */}
              <span className="sr-only">{t('session.loading')}</span>
            </div>
          ) : !canAccess(admin, pathname ?? '') ? (
            <div
              className="flex flex-col items-center justify-center py-24 text-center gap-3"
              role="alert"
            >
              <Shield className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
              <h2 className="text-lg font-bold text-foreground">{t('session.deniedTitle')}</h2>
              <p className="text-sm text-muted-foreground max-w-sm">{t('session.deniedBody')}</p>
              <Link
                href="/dashboard"
                className="text-sm font-semibold text-link hover:underline focus-outline rounded-sm"
              >
                {t('session.backToDashboard')}
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
