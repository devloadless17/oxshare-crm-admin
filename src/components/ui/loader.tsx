import { cn } from '@/lib/utils';

/**
 * The one loading indicator in this app.
 *
 * TWIN FILE — an identical copy lives at the same path in oxshare-crm-client.
 * Behaviour changes belong in both.
 *
 * Before this there were fourteen spellings of "please wait": lucide's
 * `Loader2` at five different sizes and four different colours, a
 * border-and-`animate-spin` div in `RequireAuth`, and a `RefreshCw` that spun
 * only sometimes. They disagreed on size, on colour, on whether a screen reader
 * heard anything, and on what happened under `prefers-reduced-motion`.
 *
 * ## Why a hand-written SVG rather than an icon from the set
 *
 * `currentColor`. A loader lives inside a control whose foreground it cannot
 * know — on `variant="default"` it must be primary-foreground, on `outline` and
 * `ghost` it must be the ordinary text colour, and inside a destructive button
 * it must be white. An icon with a baked-in `text-primary` is right on exactly
 * one of those and invisible on at least one other. Inheriting is the only
 * thing that is right everywhere, and it costs eight lines of SVG.
 *
 * The track/arc split matters for the same reason: a bare arc on a busy button
 * reads as a rendering glitch, while a faint full ring behind it reads as a
 * dial. `opacity-25` on the track keeps it legible on both themes without
 * needing a colour of its own.
 *
 * ## Motion
 *
 * `loader-spin` is defined in `globals.css` and is NOT `animate-spin`. Do not
 * swap it back: the blanket reduced-motion rule in that file sets
 * `animation-duration: 0.001ms !important` on everything, which finishes
 * `animate-spin` instantly and leaves a frozen arc for every user whose OS has
 * "reduce motion" on. `loader-spin` re-asserts the rotation past that rule, so
 * it spins in both settings. The reasoning lives with the keyframes.
 */

const SIZES = {
  /** Inside a button. Note `[&_svg]:size-4` on Button overrides this anyway. */
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
  xl: 'h-12 w-12',
} as const;

export type SpinnerSize = keyof typeof SIZES;

/**
 * The mark itself — no text, no layout, no accessibility semantics.
 *
 * `aria-hidden` because a bare spinner has nothing useful to announce; the
 * WRAPPER owns the message. `PageLoader` below carries `role="status"` and a
 * label, and `Button` sets `aria-busy`. A spinner that announced itself would
 * make those double up.
 */
export function Spinner({ size = 'sm', className }: { size?: SpinnerSize; className?: string }) {
  return (
    <svg
      className={cn('loader-spin shrink-0', SIZES[size], className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {/* The track: a full ring, faint. Without it the arc reads as a glitch. */}
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="2.5"
        className="opacity-25"
      />
      {/* The arc: a quarter turn, round-capped so it reads as drawn rather than
          cut. `strokeDasharray` is the circumference (2πr ≈ 56.5) split so a
          quarter shows. */}
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="56.5"
        strokeDashoffset="42"
      />
    </svg>
  );
}

/**
 * A whole screen, or a whole panel, waiting on something.
 *
 * `role="status"` + `aria-live="polite"` and a real label, because for some of
 * the people who see this the outcome is a redirect they did not ask for. A
 * bare spinner tells them nothing at all.
 *
 * `label` is an ALREADY-RESOLVED string, not a MessageKey. A key would be the
 * stricter signature, and it would not fit: `AsyncBoundary` — the busiest
 * caller — takes a `label: string` from screens that have already called `t()`,
 * often with interpolation. Matching that is worth more than a type that
 * forbids a literal here while every neighbouring component allows one.
 *
 * `srOnly` hides the label visually while keeping it announced, which is what a
 * full-screen gate wants; a panel-level loader usually wants it shown.
 */
export function PageLoader({
  label,
  size = 'lg',
  srOnly = false,
  fullScreen = false,
  className,
}: {
  label: string;
  size?: SpinnerSize;
  /** Show the label, or keep it for screen readers only. */
  srOnly?: boolean;
  /** Fill the viewport rather than the space the parent gives. */
  fullScreen?: boolean;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-col items-center justify-center gap-3 text-center',
        fullScreen ? 'min-h-screen bg-background' : 'py-16',
        className,
      )}
    >
      <Spinner size={size} className="text-primary" />
      {srOnly ? (
        <span className="sr-only">{label}</span>
      ) : (
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
      )}
    </div>
  );
}
