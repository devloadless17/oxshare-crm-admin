import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * The status pill, in one place.
 *
 * Five screens had hand-rolled their own `<span className="rounded-full border
 * px-2.5 py-0.5 …">` with slightly different padding and slightly different
 * colour tokens — client status, the admin directory, role permission chips,
 * the KYC queue and the commission tiers. Nothing was wrong with any of them
 * individually, which is exactly why they drifted.
 *
 * Pure CVA, like `button.tsx`, and deliberately NOT a Radix component: a badge
 * is a styled span with no behaviour, and adding a dependency to get one is how
 * a bundle grows without anybody deciding to.
 *
 * NOT a twin file. `scripts/check-twins.sh` carries an explicit list, and this
 * is admin-only — the client portal has no status pills of its own.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'border-border bg-muted text-muted-foreground',
        success: 'border-success/30 bg-success/10 text-success',
        warning: 'border-warning/40 bg-warning/10 text-warning',
        destructive: 'border-destructive/30 bg-destructive/10 text-destructive',
        outline: 'border-border bg-transparent text-foreground',
        /**
         * A CLIENT TAG (ADM-14).
         *
         * Its own variant rather than `default` because a tag carries an
         * operator-chosen colour, applied inline — so the base has to supply
         * layout and typography while leaving colour to the caller, which no
         * other variant does.
         */
        tag: 'border-transparent bg-muted text-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
