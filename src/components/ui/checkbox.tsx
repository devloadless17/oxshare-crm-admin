'use client';

import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * shadcn's checkbox, on Radix.
 *
 * ── This is NOT a drop-in for `<input type="checkbox">` ────────────────────
 *
 * Radix renders a `<button role="checkbox">`, not an input. Three consequences
 * that bite at the call site:
 *
 *   1. `onChange(e)` becomes `onCheckedChange(checked)` — the handler receives
 *      the new value directly, not an event. There is no `e.target.checked`.
 *   2. `checked` is `boolean | 'indeterminate'`. Handlers that feed state typed
 *      `boolean` must coerce, which is why call sites here pass `=== true`
 *      rather than the raw value.
 *   3. The label has to be paired by `id`/`htmlFor`, not by wrapping. A button
 *      IS a labelable element, so wrapping is not strictly invalid — but a
 *      button's accessible name is computed from its CONTENT first, and this
 *      one's content is a decorative icon. Pairing explicitly is the shadcn
 *      convention and the arrangement that resolves the same way for a screen
 *      reader and for `getByLabelText`.
 *
 * The third is the one worth stating: it degrades silently. The box still
 * toggles on click, so nothing looks broken while the accessible name is not
 * what you think it is.
 *
 * Not listed in `scripts/check-twins.sh`, so it is admin-only for now. If the
 * portal grows a checkbox, copy this file there and add it to `TWINS` rather
 * than letting two versions drift.
 */
const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'peer h-4 w-4 shrink-0 cursor-pointer rounded border border-input bg-background',
      'focus-outline disabled:cursor-not-allowed disabled:opacity-50',
      'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
      <Check className="h-3 w-3" aria-hidden="true" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
