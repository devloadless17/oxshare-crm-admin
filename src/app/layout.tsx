import type { Metadata } from 'next';
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang={DEFAULT_LOCALE} dir={direction(DEFAULT_LOCALE)} suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider defaultTheme="light" storageKey="oxshare-admin-theme">
          <LocaleDirection />
          <QueryProvider>
            <AdminAuthProvider>{children}</AdminAuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
