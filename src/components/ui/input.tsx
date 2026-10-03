// TWIN FILE — an identical copy lives at the same path in oxshare-crm-client.
// Behaviour changes belong in BOTH. Anything app-specific (cookie names,
// token lifetimes, redirect paths, endpoint patterns) goes in the config block
// at the top of the file, never inline — that is what keeps a diff between the
// two copies a signal rather than noise.

import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        /*
         * A phone number has no letter to say which way it reads, so bidi
         * would lay `+961 70 123 456` out right to left in an Arabic page with
         * its groups reversed. It is pinned left to right.
         */
        dir={type === 'tel' ? 'ltr' : undefined}
        className={cn(
          // `bg-card`, not `bg-background`. On the light theme `--background` is
          // the page grey (#f0f0f0) and `--card` is white, so a field painted
          // with the page colour reads as a disabled or read-only strip rather
          // than as somewhere to type — and inside a card, which is where most
          // of these live, it vanished into a same-coloured surround. `--card`
          // is the raised surface in both themes, which is what an input is.
          'flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          /*
           * What is TYPED reads in its own direction: an email, an IBAN or a
           * wallet address typed into an Arabic form is laid out left to right
           * (its first strong letter decides), Arabic typed into an English form
           * right to left. `plaintext` rather than `dir="ltr"` keeps the FIELD
           * in the page's direction, so the logical padding that clears a
           * leading icon stays on the icon's side. In a right-to-left page the
           * text is held to the right edge, where the label and the placeholder
           * are, instead of jumping left at the first Latin letter.
           */
          '[unicode-bidi:plaintext] rtl:text-right',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
