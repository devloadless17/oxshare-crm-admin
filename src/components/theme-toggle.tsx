'use client';

// TWIN FILE — an identical copy lives at the same path in oxshare-crm-client.
// Behaviour changes belong in BOTH. Anything app-specific goes in the config
// block below, never inline — that is what keeps a diff between the two copies
// a signal rather than noise.

import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { useHydrated } from '@/hooks/use-hydrated';
import { t } from '@/lib/i18n';

// ── App-specific config ─────────────────────────────────────────────────────
/** Matches this app's notification bell, which the toggle sits beside. */
const TRIGGER_RADIUS = 'rounded-lg';

/**
 * Light or dark — ONE icon, beside the notification bell.
 *
 * ## What it replaced, and why
 *
 * Theme used to be a "Theme ▸" row inside the account menu offering Light, Dark
 * and System. The client asked for exactly two states and for the control to sit
 * in the header beside the bell, as on the broker's existing site — a preference
 * you change often should be one click, not three levels into a menu.
 *
 * ## What "no System" means here
 *
 * The CHOICE is gone; the first-visit default is not. Before anyone has picked,
 * the page still follows the device (next-themes' own default), so a phone in
 * dark mode opens dark. The first click then pins an explicit `light` or
 * `dark`, and that is what the page keeps. A visitor who had picked "System"
 * previously still resolves to their device's scheme and flips out of it the
 * same way.
 *
 * ## The icon is the DESTINATION
 *
 * A moon on a light page, a sun on a dark one — the convention the reference
 * site uses, and the one that reads as a button rather than a status light. The
 * accessible name says the same thing in words ("Switch to dark mode"), because
 * an icon alone announces nothing.
 *
 * Decided from `resolvedTheme`, never `theme`: `theme` is `"system"` until
 * the first click, which is neither answer.
 *
 * ## Before hydration
 *
 * The server cannot know the stored theme, so the first render is a box of the
 * same size with no icon — no layout shift, and no wrong icon flashed for a frame
 * and then swapped.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const hydrated = useHydrated();

  const box = `flex h-9 w-9 shrink-0 items-center justify-center ${TRIGGER_RADIUS} border border-border text-foreground transition-colors`;

  if (!hydrated) {
    return <span aria-hidden="true" className={box} />;
  }

  const isDark = resolvedTheme === 'dark';
  const label = isDark ? t('theme.switchToLight') : t('theme.switchToDark');

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={label}
      title={label}
      className={`${box} cursor-pointer hover:bg-muted focus-outline`}
    >
      {isDark ? (
        <Sun className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Moon className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  );
}
