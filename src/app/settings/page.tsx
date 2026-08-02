import type { Metadata } from 'next';
import { Settings, Sliders, Shield, Database, Bell } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';

export const metadata: Metadata = { title: 'Settings — OxShare Admin' };

export default function SettingsPage() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">System Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure platform parameters, security policies, and themes
        </p>
      </div>

      <div className="space-y-6">
        {/* Appearance Settings */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-3 border-b border-border pb-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600/10 text-blue-600 dark:text-blue-400">
              <Sliders className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Appearance & Theme</h2>
              <p className="text-xs text-muted-foreground">Customize admin interface theme and visual preferences</p>
            </div>
          </div>
          <div className="flex items-center justify-between pt-2">
            <div>
              <p className="text-sm font-medium">Interface Mode</p>
              <p className="text-xs text-muted-foreground">Switch between Light Mode and Dark Mode</p>
            </div>
            <ThemeToggle />
          </div>
        </div>

        {/* System & API Configuration */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-3 border-b border-border pb-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold">API & Backend Connectivity</h2>
              <p className="text-xs text-muted-foreground">Backend service endpoints and sync services</p>
            </div>
          </div>
          <div className="space-y-3 pt-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">API Base Endpoint</label>
              <input
                type="text"
                readOnly
                value={process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001'}
                className="mt-1 flex h-9 w-full rounded-lg border border-input bg-muted/30 px-3 text-xs font-mono"
              />
            </div>
          </div>
        </div>

        {/* Security & Access */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-3 border-b border-border pb-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10 text-purple-500">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Security & Access Control</h2>
              <p className="text-xs text-muted-foreground">Role permissions and session timeouts</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground pt-1">
            2FA enforcement and IP whitelist policies are active.
          </p>
        </div>
      </div>
    </div>
  );
}
