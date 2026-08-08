'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarIcon, X } from 'lucide-react';
import api from '@/lib/api';
import { apiErrorMessage } from '@/lib/api/errors';
import { PermissionMatrix } from '@/components/rbac/permission-matrix';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { t } from '@/lib/i18n';

/**
 * Issue an API key — a page, not a dialog.
 *
 * The form carries the entire permission catalog plus an expiry picker, which
 * is more than a modal should hold: a catalog scrolling inside a scrolling
 * dialog is exactly where a reviewer stops reading the permissions they are
 * about to grant. It is also a decision worth being able to link to, leave, and
 * come back to.
 *
 * ## There is no EDIT counterpart, deliberately
 *
 * A key is immutable once issued. Re-scoping a live credential would mean a
 * running integration silently gaining (or losing) powers without its secret
 * changing and without anybody redeploying it — the audit trail would be the
 * only record that what the key can do today differs from yesterday. Revoke and
 * issue instead: two explicit events, both attributable, and the new secret
 * forces whoever installed it to know something changed.
 *
 * ## Handing the secret to the list page
 *
 * The plaintext exists for one moment — the create response — and only a hash
 * is stored, so it can never be shown again. On success this navigates to the
 * list with `?issued=`, which reads it once, shows the reveal dialog and strips
 * the parameter with `history.replaceState` so it never survives into history.
 */
export default function NewApiKeyPage() {
  const router = useRouter();

  const [name, setName] = React.useState('');
  const [permissions, setPermissions] = React.useState<string[]>([]);
  const [expiresAt, setExpiresAt] = React.useState<Date | undefined>(undefined);
  const [calendarOpen, setCalendarOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  /**
   * The earliest selectable expiry — tomorrow, stamped once on mount.
   *
   * State with a lazy initialiser rather than a `useMemo`: reading the clock
   * during render makes the component impure (React's lint rule refuses it),
   * and this genuinely is a value captured at mount rather than derived from
   * anything that changes.
   */
  const [earliestExpiry] = React.useState(() => new Date(Date.now() + 24 * 60 * 60 * 1000));

  // The catalog is the server's vocabulary (R-4.5) — the frontend must never
  // invent a permission key, so the picker is built from what the API returns.
  const catalog = useQuery({
    queryKey: ['permissions'],
    queryFn: () => api.admin.getPermissions(),
  });

  const create = useMutation({
    mutationFn: () =>
      api.admin.createApiKey({
        name,
        permissions,
        /*
         * The END of the chosen day, in the operator's own timezone.
         *
         * A calendar gives a local calendar date at midnight. Sending that
         * would make a key set to expire "today" already dead — it expired this
         * morning. Whoever picks a date means "usable through that day".
         */
        expiresAt: expiresAt
          ? new Date(
              expiresAt.getFullYear(),
              expiresAt.getMonth(),
              expiresAt.getDate(),
              23,
              59,
              59,
            ).toISOString()
          : null,
      }),
    onSuccess: (result) => {
      router.replace(`/api-keys?issued=${encodeURIComponent(result.plaintext)}`);
    },
    onError: (err) => setError(apiErrorMessage(err, t('apiKeys.form.failed'))),
  });

  const canSubmit = name.trim().length > 0 && permissions.length > 0 && !create.isPending;

  return (
    /*
     * NO inner scroll container, deliberately.
     *
     * This was `h-full` with an `overflow-y-auto` wrapper, which gave the form
     * its own scrollbar nested inside the one `<main>` already has — two bars
     * on one screen, and the inner one detached from the page. The page scrolls
     * now; the action bar below stays put via `sticky`, which needs no scroll
     * container of its own because `<main>` is the one it sticks within.
     */
    <div className="flex flex-col">
      <div>
        <div className="space-y-6 pb-6">
          <div>
            <Link
              href="/api-keys"
              className="focus-outline inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              {t('apiKeys.title')}
            </Link>
            <h1 className="mt-2 text-2xl font-bold tracking-tight">{t('apiKeys.form.title')}</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t('apiKeys.subtitle')}</p>
          </div>

          {error && (
            <div
              className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
              role="alert"
            >
              {error}
            </div>
          )}

          {/*
           * Labels ABOVE their inputs, not beside them.
           *
           * A left-hand label column forces every field to the same width and
           * wastes the horizontal space this page exists to use — and it breaks
           * down entirely on a narrow screen, where the label wraps away from
           * what it names.
           */}
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label htmlFor="key-name" className="text-xs font-semibold">
                {t('apiKeys.form.name')}
              </label>
              <input
                id="key-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('apiKeys.form.namePlaceholder')}
                maxLength={100}
                className="focus-outline mt-1.5 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">{t('apiKeys.form.nameHelp')}</p>
            </div>

            <div>
              {/*
               * A `<label>`, matching the Name field beside it.
               *
               * This was a `<p>`, which renders at a different height — so the
               * two columns' labels did not sit on the same line and the whole
               * field appeared shifted down. Same element, same baseline.
               *
               * `htmlFor` points at the trigger, so clicking the label opens the
               * calendar rather than doing nothing.
               */}
              <label htmlFor="key-expiry" className="text-xs font-semibold">
                {t('apiKeys.form.expiry')}
              </label>
              {/*
               * The trigger takes the FULL column width, like the Name input
               * beside it — the Clear control sits inside it rather than
               * stealing width from the row.
               */}
              <div className="relative mt-1.5">
                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                  {/*
                   * `PopoverTrigger` renders a real <button> itself — Base UI,
                   * not Radix, so there is no `asChild` and no wrapper element
                   * to style around.
                   *
                   * `w-full`, not `flex-1`: `flex-1` only fills what the row
                   * leaves over, and the Clear control was taking a share, so
                   * the field never matched the Name input beside it.
                   *
                   * `active:!scale-100` opts out of the global
                   * `button:active { transform: scale(.985) }` in globals.css.
                   * A press animation reads as "this did something" on a submit
                   * button; on a control that only opens a popover it makes the
                   * whole field flinch.
                   *
                   * `cursor-pointer` because a <button> defaults to the arrow
                   * cursor, and this one is styled to look like an input.
                   */}
                  <PopoverTrigger
                    id="key-expiry"
                    type="button"
                    className="focus-outline flex h-9 w-full cursor-pointer items-center gap-2 rounded-lg border border-input bg-background px-3 pr-20 text-left text-sm active:!scale-100"
                  >
                    <CalendarIcon
                      className="h-4 w-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    {expiresAt ? expiresAt.toLocaleDateString() : t('apiKeys.never')}
                  </PopoverTrigger>
                  {/*
                   * `w-auto` so the panel takes the calendar's own width rather
                   * than the shared `w-72`, which was narrower than the grid
                   * wants and squeezed the columns together.
                   *
                   * `[--tw-enter-scale:1] [--tw-exit-scale:1]` drops the shared
                   * panel's 95% zoom on open/close, keeping only the fade. On a
                   * menu that zoom reads as the panel arriving from the trigger;
                   * on a calendar it visibly resizes a 7-column grid mid-
                   * animation, so the dates slide under the pointer on the way
                   * in and shrink away on the way out.
                   *
                   * Set as the custom properties the `enter`/`exit` keyframes in
                   * globals.css read, NOT as `zoom-in-100`/`zoom-out-100`: that
                   * utility set is hand-written there rather than coming from
                   * `tailwindcss-animate`, and only the `-95` steps exist. A
                   * `-100` class would compile to nothing and silently leave the
                   * zoom in place.
                   */}
                  <PopoverContent
                    className="w-auto p-0 [--tw-enter-scale:1] [--tw-exit-scale:1]"
                    align="start"
                  >
                    <Calendar
                      mode="single"
                      selected={expiresAt}
                      onSelect={(date) => {
                        setExpiresAt(date);
                        setCalendarOpen(false);
                      }}
                      /*
                       * Everything before tomorrow is unselectable, matching the
                       * API — `ApiKeysService.create` refuses an expiry in the
                       * past. A picker that offers a date the server will reject
                       * turns a rule into a validation error nobody predicted.
                       */
                      disabled={{ before: earliestExpiry }}
                      autoFocus
                    />
                  </PopoverContent>
                </Popover>

                {/*
                 * Clear sits INSIDE the field, right-aligned, rather than
                 * beside it — which is what lets the trigger be full width. The
                 * trigger's `pr-20` reserves the space so a long date can never
                 * run underneath this.
                 */}
                {expiresAt && (
                  <button
                    type="button"
                    onClick={() => setExpiresAt(undefined)}
                    className="focus-outline absolute right-1.5 top-1/2 inline-flex -translate-y-1/2 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground active:!"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('apiKeys.form.clearExpiry')}
                  </button>
                )}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{t('apiKeys.form.expiryHelp')}</p>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold">{t('apiKeys.form.permissions')}</p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t('apiKeys.form.permissionsHelp')}
            </p>
            {catalog.data && (
              <PermissionMatrix
                catalog={catalog.data}
                selected={permissions}
                onToggle={(key) =>
                  setPermissions((prev) =>
                    prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key],
                  )
                }
                /*
                 * Select-all is applied HERE rather than inside the matrix,
                 * which never owns the selection. `keys` is one module's keys or
                 * the whole catalog's; the Set keeps the result duplicate-free
                 * when a module is selected twice.
                 */
                onSelectAll={(keys, nextSelected) =>
                  setPermissions((prev) =>
                    nextSelected
                      ? [...new Set([...prev, ...keys])]
                      : prev.filter((p) => !keys.includes(p)),
                  )
                }
              />
            )}
          </div>
        </div>
      </div>

      {/*
       * A floating PILL, centred — not a full-width bar.
       *
       * The bar version spanned the viewport and needed negative margins to
       * cancel `<main>`'s padding, which is a lot of machinery for two buttons.
       * This is `w-fit mx-auto`: it sizes to its own content, sits in the middle
       * of the page, and floats over the form rather than cutting it in half
       * with a full-width rule.
       *
       * `pointer-events-none` on the sticky wrapper with `pointer-events-auto`
       * on the pill: the wrapper spans the width to do the centring, and
       * without this it would swallow clicks on the form beneath it either side
       * of the buttons.
       */}
      <div className="pointer-events-none sticky bottom-4 z-10 mt-4 flex justify-center">
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-background/95 p-1.5 shadow-lg backdrop-blur">
          <Link
            href="/api-keys"
            className="focus-outline inline-flex h-9 items-center rounded-full px-4 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {t('apiKeys.form.cancel')}
          </Link>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => create.mutate()}
            className="focus-outline h-9 rounded-full bg-primary px-5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {create.isPending ? t('apiKeys.form.creating') : t('apiKeys.form.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}
