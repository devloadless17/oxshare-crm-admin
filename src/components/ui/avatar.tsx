'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * shadcn's Avatar API — `Avatar` / `AvatarImage` / `AvatarFallback` — without
 * the `@radix-ui/react-avatar` dependency.
 *
 * The working agreement in the root CLAUDE.md requires asking before adding a
 * package, and Radix's avatar earns its weight through one feature: it renders
 * the fallback until the image has actually LOADED, so a slow or broken URL
 * shows initials rather than a broken-image glyph. That is worth having, and it
 * is the `status` state below — about fifteen lines.
 *
 * The API is kept identical on purpose. If a reason to take the dependency
 * appears, swapping this file for the generated shadcn one is a delete, not a
 * migration of every call site.
 *
 * NOTE: `UserProfileDto` currently has no avatar field, so every avatar in the
 * portal renders initials today. `AvatarImage` exists because the profile work
 * adds one, and because a fallback-only component invites the next person to
 * hardcode initials at the call site instead.
 */

const Avatar = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        'relative flex h-9 w-9 shrink-0 overflow-hidden rounded-full select-none',
        className,
      )}
      {...props}
    />
  ),
);
Avatar.displayName = 'Avatar';

const AvatarImage = React.forwardRef<
  HTMLImageElement,
  React.ImgHTMLAttributes<HTMLImageElement> & { src?: string }
>(({ className, src, alt = '', onLoad, onError, ...props }, ref) => {
  const [status, setStatus] = React.useState<'loading' | 'loaded' | 'failed'>('loading');

  // A changed src is a new question, so the answer resets. Without this, moving
  // from a working image to a broken one keeps showing the old one's 'loaded'.
  React.useEffect(() => setStatus('loading'), [src]);

  if (!src || status === 'failed') return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      alt={alt}
      className={cn('aspect-square h-full w-full object-cover', className)}
      onLoad={(e) => {
        setStatus('loaded');
        onLoad?.(e);
      }}
      onError={(e) => {
        // Falls back to initials rather than to a broken-image glyph, which is
        // the whole reason this component is not a bare <img>.
        setStatus('failed');
        onError?.(e);
      }}
      {...props}
    />
  );
});
AvatarImage.displayName = 'AvatarImage';

const AvatarFallback = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        'flex h-full w-full items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground',
        className,
      )}
      {...props}
    />
  ),
);
AvatarFallback.displayName = 'AvatarFallback';

/**
 * Initials from a name, for the fallback.
 *
 * Exported and pure so the "what does a client with no last name see" question
 * is answered once and testable, rather than re-derived with a different
 * `charAt(0)` expression at each of the three places an avatar appears.
 */
export function initialsOf(firstName?: string | null, lastName?: string | null): string {
  const first = firstName?.trim()?.[0] ?? '';
  const last = lastName?.trim()?.[0] ?? '';
  const initials = `${first}${last}`.toUpperCase();
  // 'U' for unknown — never an empty circle, which reads as a failed render.
  return initials || 'U';
}

export { Avatar, AvatarImage, AvatarFallback };
