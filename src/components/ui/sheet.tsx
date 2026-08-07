'use client';

/*
 * A panel that slides in from an edge. Radix's Dialog with different geometry —
 * same focus trap, same escape handling, same scroll lock, so a sheet cannot
 * drift from a dialog on the accessibility behaviour that is easy to get wrong.
 *
 * NOT a twin file; see the note in ./dialog.tsx.
 *
 * It animates in AND out. The exit half arrived late — `globals.css` defined
 * only an `animate-in` set — and the panel slid in and then vanished, which
 * reads as breaking rather than closing. A one-way animation is worse than
 * none: the first half sets an expectation the second half denies.
 */

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { t } from '@/lib/i18n';

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetPortal = DialogPrimitive.Portal;

/*
 * Enter AND exit per side.
 *
 * The exit half was missing, and its absence was not neutral: the panel slid in
 * and then vanished on close, which reads as the sheet breaking rather than
 * closing. It also threw away the one thing the animation is for — showing that
 * the panel went back to the edge it came from, rather than the page beneath it
 * being replaced.
 *
 * Radix keeps the element mounted until the exit animation ends, so
 * `data-[state=closed]` is all this needs.
 */
const SIDES = {
  right:
    'inset-y-0 right-0 h-full w-full max-w-sm border-l slide-in-from-right-full data-[state=closed]:slide-out-to-right-full',
  left: 'inset-y-0 left-0 h-full w-full max-w-sm border-r slide-in-from-left-full data-[state=closed]:slide-out-to-left-full',
} as const;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/60 backdrop-blur-xs',
      // Exit as well as enter. Radix holds the node mounted until the
      // animation ends, so the scrim fades out with the panel instead of
      // snapping and leaving the page looking like it flashed.
      'animate-in fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
      className,
    )}
    {...props}
  />
));
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName;

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    side?: keyof typeof SIDES;
  }
>(({ side = 'right', className, children, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed z-50 flex flex-col border-border bg-card text-card-foreground shadow-lg',
        // `animate-out` is unconditional here and the DIRECTION is per side, in
        // SIDES below — `data-[state=closed]:animate-out` alone would run the
        // exit keyframe with no translate set, fading the panel in place.
        'focus:outline-none animate-in data-[state=closed]:animate-out',
        SIDES[side],
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-outline">
        <X className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">{t('common.close')}</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = DialogPrimitive.Content.displayName;

function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col gap-1 border-b border-border px-5 py-4 pr-14', className)}
      {...props}
    />
  );
}

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-sm font-bold tracking-tight text-foreground', className)}
    {...props}
  />
));
SheetTitle.displayName = DialogPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-xs leading-relaxed text-muted-foreground', className)}
    {...props}
  />
));
SheetDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
};
