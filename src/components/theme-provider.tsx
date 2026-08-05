'use client';

// TWIN FILE — an identical copy lives at the same path in oxshare-crm-client.
// Behaviour changes belong in BOTH. Anything app-specific (cookie names,
// token lifetimes, redirect paths, endpoint patterns) goes in the config block
// at the top of the file, never inline — that is what keeps a diff between the
// two copies a signal rather than noise.
import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from 'next-themes';

/**
 * `system` by default, and `enableSystem` — both of which were off.
 *
 * The old defaults were `defaultTheme="light"` with `enableSystem={false}`,
 * which meant anyone whose device is in dark mode got a bright page on first
 * load of every device they own, and could only opt out by finding a toggle
 * that offered exactly two states and no way to say "follow my OS".
 *
 * `enableSystem` is what makes `system` more than a third label: it attaches
 * the `prefers-color-scheme` listener, so a machine that flips to dark at
 * sunset gets an app that flips with it rather than one that decided in
 * January.
 *
 * CHANGED IN BOTH COPIES TOGETHER. This is a twin file and the portal's copy
 * carries the same change — the portal is where the client-facing account menu
 * exposes the third option, but a shared component whose two copies disagree on
 * a default is exactly the drift `check:twins` exists to catch.
 *
 * The nonce prop matters here and is set by the root layout — next-themes
 * injects an inline script to set the class before first paint, and with
 * `unsafe-inline` removed from `script-src` an unstamped script is blocked.
 * That failure is silent and looks like "dark mode does not work".
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange={false}
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
