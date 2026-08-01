import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Dashboard — BBCorp Admin' };

export default function AdminDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Back-office overview</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total Clients', value: '0', sub: 'Registered users' },
          { label: 'Active Partners', value: '0', sub: 'Approved IBs' },
          { label: 'Pending Withdrawals', value: '0', sub: 'Awaiting review' },
          { label: 'Pending KYC', value: '0', sub: 'Documents to review' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border bg-card p-6 shadow-sm">
            <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
            <p className="text-2xl font-bold mt-2">{stat.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{stat.sub}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border bg-card shadow-sm">
          <div className="p-6 border-b"><h2 className="font-semibold">Recent Client Registrations</h2></div>
          <div className="p-6 text-center text-muted-foreground text-sm">No data yet</div>
        </div>
        <div className="rounded-lg border bg-card shadow-sm">
          <div className="p-6 border-b"><h2 className="font-semibold">Pending Actions</h2></div>
          <div className="p-6 text-center text-muted-foreground text-sm">No pending actions</div>
        </div>
      </div>
    </div>
  );
}
