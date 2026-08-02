import type { Metadata } from 'next';
import { ArrowUpRight, Search, CheckCircle2, XCircle, Clock } from 'lucide-react';

export const metadata: Metadata = { title: 'Withdrawals — OxShare Admin' };

export default function WithdrawalsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Withdrawal Requests</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review and approve client and IB withdrawal requests
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Pending Requests</p>
            <p className="text-2xl font-bold mt-1">3</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
            <Clock className="h-5 w-5" />
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Approved Today</p>
            <p className="text-2xl font-bold mt-1">$14,250.00</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Rejected / On Hold</p>
            <p className="text-2xl font-bold mt-1">0</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-500/10 text-rose-500">
            <XCircle className="h-5 w-5" />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
        <div className="p-12 text-center">
          <ArrowUpRight className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-sm font-semibold">Withdrawal Queue Active</h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
            All submitted withdrawal transactions will be listed here for multi-step approval.
          </p>
        </div>
      </div>
    </div>
  );
}
