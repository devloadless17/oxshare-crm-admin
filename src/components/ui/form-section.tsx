import type { ReactNode } from 'react';

/** A titled group of settings — one card per concern, so a long form reads as a page. */
export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5">
      <h2 className="text-sm font-bold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

/** The foot of a settings page: one Save for the whole page, always in view. */
export function StickyActions({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-1 flex justify-end gap-2 border-t border-border bg-background/95 px-1 py-3 backdrop-blur">
      {children}
    </div>
  );
}
