import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { currentLocale, direction } from '@/lib/i18n';
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
    <html lang={currentLocale()} dir={direction()} suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider defaultTheme="light" storageKey="oxshare-admin-theme">
          <QueryProvider>
            <AdminAuthProvider>{children}</AdminAuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
