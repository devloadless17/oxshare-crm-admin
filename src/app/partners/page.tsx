import type { Metadata } from 'next';
import { Building2, Plus, Search, Filter } from 'lucide-react';

export const metadata: Metadata = { title: 'Partners / IBs — OxShare Admin' };

export default function PartnersPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Partners / IBs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage introducing brokers, referral links, and partner commission structures
          </p>
        </div>
        <button
          type="button"
          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white shadow-sm hover:bg-blue-500 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add New Partner
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search partners by name, email, code..."
            className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-4 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground hover:bg-muted"
        >
          <Filter className="h-3.5 w-3.5" />
          Filters
        </button>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
        <div className="p-12 text-center">
          <Building2 className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-sm font-semibold">No Partner Programs Configured</h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
            Partner and IB management modules are ready. Approved partners will display here.
          </p>
        </div>
      </div>
    </div>
  );
}
