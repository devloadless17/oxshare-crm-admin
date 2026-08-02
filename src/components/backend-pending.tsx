import { ServerOff } from 'lucide-react';

/**
 * Honest placeholder for UI whose backend endpoints don't exist yet.
 * Names the missing endpoints so the state doubles as a to-do for the API owner.
 * Tracked in docs/DECISIONS.md (D-28, D-30).
 */
export function BackendPending({ title, endpoints }: { title?: string; endpoints: string[] }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center space-y-3">
      <ServerOff className="h-8 w-8 mx-auto text-muted-foreground" aria-hidden="true" />
      <h3 className="text-sm font-semibold text-foreground">
        {title ?? 'Waiting on backend endpoints'}
      </h3>
      <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
        This page&apos;s UI is ready, but the API it needs is not implemented yet. It will light up
        automatically once these endpoints exist:
      </p>
      <div className="flex flex-wrap justify-center gap-1.5">
        {endpoints.map((e) => (
          <code
            key={e}
            className="rounded-md bg-muted px-2 py-1 text-[11px] font-mono text-muted-foreground border border-border/60"
          >
            {e}
          </code>
        ))}
      </div>
    </div>
  );
}
