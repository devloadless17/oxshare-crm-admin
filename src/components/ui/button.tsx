import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/loader';

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
  /**
   * The button is waiting on something it started.
   *
   * PORTED FROM THE PORTAL'S TWIN, which has had it for a while. The comment at
   * the top of that file says the SHAPE of these two must match and that a new
   * prop belongs in both by hand; this one did not make the trip, and twenty-odd
   * call sites in this console hand-placed lucide's `Loader2` instead — five
   * sizes, several colours, and `animate-spin`, which `ui/loader.tsx` was
   * written to remove.
   *
   * Handles the whole state rather than just drawing a spinner: it DISABLES the
   * button and sets `aria-busy`. Every call site was doing the first by hand and
   * none was doing the second, so a double-click submitted twice on any screen
   * whose author forgot — on a console that approves payouts.
   *
   * The label stays put. Swapping "Save" for "Saving…" resizes the button under
   * a pointer that is still travelling toward it, and on a slow request that is
   * a real mis-click. Pass different children if a screen genuinely needs
   * different words.
   */
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, loading = false, children, disabled, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button';

    /*
     * `asChild` and `loading` cannot combine, and this is why rather than an
     * oversight. Slot requires EXACTLY ONE child — injecting a spinner beside
     * the caller's element gives it two and React throws. `asChild` is used here
     * for links (`<Button asChild><Link/></Button>`), and a navigation has
     * nothing to wait on: it either happens or it does not. So the prop is
     * ignored in that combination rather than crashing the screen.
     */
    if (asChild) {
      return (
        <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}>
          {children}
        </Comp>
      );
    }

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        /*
         * Disabled BY the loading state, not merely alongside it. A button that
         * shows a spinner and still accepts clicks is the double-submit bug
         * wearing the costume of its own fix.
         *
         * `||`, NOT `??`. Nullish coalescing only falls back when `disabled` is
         * null or undefined, so a caller passing a computed condition would keep
         * control of the value forever: `disabled={!dirty}` is `false` the moment
         * the form is valid, and `false ?? loading` is `false`. The portal's twin
         * carries the scar from getting this wrong.
         */
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {/* Inherits the button's foreground through `currentColor`, so it is
            legible on primary, destructive, outline and ghost alike without any
            call site choosing a colour. `[&_svg]:size-4` in the base class sizes
            it. */}
        {loading && <Spinner />}
        {children}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
