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
    <div className="flex h-full flex-col">
      {/* Scrolls; the action bar below does not. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
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
              <div className="mt-1.5 flex items-center gap-2">
                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                  <PopoverTrigger asChild>
                    {/*
                     * `flex-1`, not `inline-flex`: the trigger fills its column
                     * like the Name input fills the other one. A control sized
                     * to its own text made the two halves of the row visibly
                     * mismatched, and left the date cramped against the icon.
                     */}
                    <button
                      id="key-expiry"
                      type="button"
                      className="focus-outline flex h-9 flex-1 items-center gap-2 rounded-lg border border-input bg-background px-3 text-left text-sm"
                    >
                      <CalendarIcon
                        className="h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      {expiresAt ? expiresAt.toLocaleDateString() : t('apiKeys.never')}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
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

                {expiresAt && (
                  <button
                    type="button"
                    onClick={() => setExpiresAt(undefined)}
                    className="focus-outline inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-accent"
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
       * The action bar is pinned to the bottom of the viewport, not the bottom
       * of the form.
       *
       * The permission catalog is long enough to scroll on any screen, so a
       * submit button at the end of the document is one an operator has to go
       * looking for — after they have already made the decision. Right-aligned
       * because that is where this console puts a form's primary action.
       */}
      <div className="sticky bottom-0 flex shrink-0 items-center justify-end gap-2 border-t border-border bg-background py-4">
        <Link
          href="/api-keys"
          className="focus-outline inline-flex h-9 items-center rounded-lg border border-border px-4 text-xs font-semibold hover:bg-accent"
        >
          {t('apiKeys.form.cancel')}
        </Link>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => create.mutate()}
          className="focus-outline h-9 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {create.isPending ? t('apiKeys.form.creating') : t('apiKeys.form.submit')}
        </button>
      </div>
    </div>
  );
}
