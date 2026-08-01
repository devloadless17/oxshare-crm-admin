export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r bg-card flex flex-col">
        <div className="flex h-16 items-center border-b px-6">
          <span className="text-lg font-bold tracking-tight">BBCorp Admin</span>
        </div>
        <nav className="flex-1 p-4 space-y-1 text-sm overflow-y-auto">
          {[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Clients', href: '/clients' },
            { label: 'Partners / IBs', href: '/partners' },
            { label: 'Withdrawals', href: '/withdrawals' },
            { label: 'KYC Review', href: '/kyc' },
            { label: 'Commission Plans', href: '/commission-plans' },
            { label: 'Payouts', href: '/payouts' },
            { label: 'Ledger', href: '/ledger' },
            { label: 'Trading Accounts', href: '/trading-accounts' },
            { label: 'Admin Users', href: '/admin-users' },
            { label: 'Settings', href: '/settings' },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="flex items-center rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="border-t p-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
              A
            </div>
            <div className="text-sm">
              <p className="font-medium">Admin</p>
              <p className="text-muted-foreground text-xs">Master Admin</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center justify-between border-b bg-background px-8 shrink-0">
          <div />
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            BBCorp CRM — Back Office
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-8">{children}</main>
      </div>
    </div>
  );
}
