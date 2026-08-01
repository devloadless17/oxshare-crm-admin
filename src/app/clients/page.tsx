import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Clients — BBCorp Admin' };

export default function ClientsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clients</h1>
          <p className="text-muted-foreground mt-1">Manage all registered clients</p>
        </div>
        <button
          type="button"
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Export
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <input
          type="search"
          placeholder="Search by name, email..."
          className="flex h-9 w-72 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <select className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
          <option value="">All Types</option>
          <option value="individual">Individual</option>
          <option value="referral">Referral</option>
          <option value="partner">Partner / IB</option>
        </select>
        <select className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-6 py-3 text-left font-medium text-muted-foreground">Name</th>
              <th className="px-6 py-3 text-left font-medium text-muted-foreground">Email</th>
              <th className="px-6 py-3 text-left font-medium text-muted-foreground">Type</th>
              <th className="px-6 py-3 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-6 py-3 text-left font-medium text-muted-foreground">KYC Level</th>
              <th className="px-6 py-3 text-left font-medium text-muted-foreground">Joined</th>
              <th className="px-6 py-3 text-left font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                No clients found
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
