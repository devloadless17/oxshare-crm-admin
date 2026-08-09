import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/*
 * These values are the ones the CONSOLE already uses, not shadcn's defaults.
 *
 * Nearly every action in this app is a hand-rolled `<button>` carrying
 * `h-9 rounded-lg px-4 text-xs font-semibold` and `hover:bg-primary-hover` —
 * the modal footers, the page headers, the row controls. This component still
 * had the generator's `rounded-md`, `font-medium` and `hover:bg-primary/90`, so
 * the handful of screens built from it (`/roles/new`, `/roles/[id]/edit`, the
 * confirm dialog, the row-action menus) drew visibly different Save and Cancel
 * buttons from the ones beside them: rounder corners, lighter weight, a
 * different hover. That is what "the buttons on the role page are not the same"
 * is — one component disagreeing with the convention around it.
 *
 * Aligned rather than replaced, because a `<Button>` is still the right thing
 * for the call sites that use it — `asChild` for links, the icon sizing rule,
 * the focus ring. This makes it agree with its neighbours.
 *
 * `hover:bg-primary-hover` is a real token in `globals.css`, not `primary/90`:
 * an opacity shift lets the page behind bleed through, which on the dark theme
 * reads as a different colour rather than a darker one.
 */
const buttonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary-hover',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-card hover:bg-muted hover:text-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-muted hover:text-foreground',
        link: 'text-link underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        // `h-9 … px-4 text-xs` — the exact shape of the console's own footer
        // buttons, so a `<Button size="sm">` sits flush beside a hand-rolled one.
        sm: 'h-9 px-4 text-xs',
        lg: 'h-11 px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
