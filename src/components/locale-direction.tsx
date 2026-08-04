'use client';

import { useEffect } from 'react';
import { currentLocale, direction } from '@/lib/i18n';

/**
 * Applies the stored language and its writing direction to `<html>`.
 *
 * TWIN FILE — an identical copy lives at the same path in `oxshare-crm-client`.
 *
 * The server cannot know the browser's stored preference, so the root layout
 * renders the DEFAULT locale and this corrects it on the client. That is the
 * same shape `next-themes` uses for the theme class, and the reason `<html>`
 * already carries `suppressHydrationWarning` — rendering one language on the
 * server and another on the client is otherwise a hydration mismatch.
 *
 * `dir` matters more than `lang` here. It is what makes the browser mirror the
 * whole document, and it is the switch that makes the FSD §10 RTL requirement
 * verifiable: set the locale key in devtools, reload, and the layout either
 * mirrors correctly or the offending `left-*`/`pl-*` utilities show themselves.
 * Without it, `direction()` is a function nobody can exercise.
 *
 * Renders nothing. It exists for the side effect, which is why it is a component
 * rather than a hook — it has to sit in the root layout above every page.
 */
export function LocaleDirection() {
  useEffect(() => {
    const locale = currentLocale();
    const root = document.documentElement;
    // Assigned rather than compared-then-assigned: both are idempotent, and a
    // guard here would only hide a wrong value rather than correct it.
    root.lang = locale;
    root.dir = direction(locale);
  }, []);

  return null;
}
