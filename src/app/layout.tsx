import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { DEFAULT_LOCALE, direction } from '@/lib/i18n';
import { LocaleDirection } from '@/components/locale-direction';
import { ThemeProvider } from '@/components/theme-provider';

import { AdminAuthProvider } from '@/context/AdminAuthContext';
import { QueryProvider } from '@/components/query-provider';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'OXShare Admin',
  description: 'OXShare CRM back-office administration.',
};

/**
 * `async`, and it reads `headers()`, for ONE reason: the CSP nonce.
 *
 * `next-themes` injects an inline script to set the theme class before first
 * paint — that is what stops the flash of the wrong theme. Next stamps its OWN
 * inline scripts with the nonce automatically, but not a library's, so with
 * `'unsafe-inline'` removed that one script is blocked and every page loads in
 * the default theme with a console error nobody sees.
 *
 * The cost is that this layout renders dynamically rather than being
 * prerendered. That is acceptable here and would not be everywhere: every route
 * in this app is behind a session and personalised anyway, so there was nothing
 * to cache.
 */
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html lang={DEFAULT_LOCALE} dir={direction(DEFAULT_LOCALE)} suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {/* `defaultTheme` is NOT passed. It used to be `"light"` here, which
            overrode the provider's own default via the `{...props}` spread — so
            changing the default in theme-provider.tsx alone would have looked
            like it worked and changed nothing. The default is `"system"` and it
            lives in one place. */}
        <ThemeProvider storageKey="oxshare-admin-theme" nonce={nonce}>
          <LocaleDirection />
          <QueryProvider>
            <AdminAuthProvider>{children}</AdminAuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
