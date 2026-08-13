'use client';

import * as React from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import type { ClientFieldGroup, PermissionModule, Role } from '@/lib/api/admin';
import { PermissionMatrix } from './permission-matrix';
import { ToggleList } from '@/components/ui/toggle-list';
import { Button } from '@/components/ui/button';
import { useAdmin } from '@/context/AdminAuthContext';
import { t } from '@/lib/i18n';

export interface RoleFormValues {
  name: string;
  description?: string;
  permissions: string[];
  /**
   * RBAC-03 — client fields holders of this role may not see.
   *
   * RESTORED (13 Aug, owner's decision): the section was removed on 9 Aug as
   * "a second access model", which left masking enforced by the API and
   * configurable NOWHERE — the per-administrator editor had already gone, so
   * the only masks in existence were the two the seed wrote. A control nobody
   * can operate is not a simplification; it is the lock-with-no-key shape this
   * project keeps finding.
   *
   * The form always round-trips the full list (pre-filled on edit), so
   * "rename and save" cannot silently unmask a legacy role — the pre-fill
   * test is what guards that, replacing the omit-to-preserve pin.
   */
  maskedFields: string[];
}

/**
 * Create/edit form for a dynamic RBAC role — the body of /roles/new and
 * /roles/[id]/edit.
 *
 * This was `role-form-modal.tsx`, a fixed-position overlay. Moving it onto real
 * routes buys three things a modal could not have:
 *
 *  1. The editor is LINKABLE. "Look at the support role" is a URL, which on a
 *     screen whose audience is a handful of administrators talking to each
 *     other is most of its value.
 *  2. The permission matrix gets the full page. It is the largest control in
 *     the console, and it was living inside a `max-h-[90vh]` box with its own
 *     scrollbar nested in the page's.
 *  3. The list stops paying for the editor. /roles fetched the permission
 *     catalog and the client-field catalog on every visit purely so the modal
 *     could open instantly; those fetches now happen on the routes that render
 *     them.
 *
 * What it costs: unsaved edits do not survive navigating away, where a modal
 * kept them until dismissed. That is the ordinary trade for a real page, and
 * the browser's own "leave site?" prompt does not fire for client-side routing
 * — so nothing catches a mis-click on the sidebar. Worth knowing before someone
 * reports it as a bug.
 *
 * ── Why masking belongs HERE, on the role ─────────────────────────────────
 *
 * It is a property of the JOB. "Support agents do not see phone numbers" is
 * the same kind of statement as "support agents cannot approve withdrawals",
 * and the two belong on the same screen: an operator answering "what can a
 * support agent do and see" should not have to open twenty individual admins
 * and diff them. It also resolves LIVE, exactly as permissions do, so adding
 * a field here blinds every holder on their next request with no re-login.
 *
 * ── The superset rule, surfaced where the operator is looking ─────────────
 *
 * A non-master cannot save a role whose mask reveals a field hidden from
 * THEM (`assertMaskAllowed`) — otherwise creating a role would be the way
 * around your own mask. Fields in the submitter's own mask are therefore
 * pre-ticked and locked, with the reason on the control; the server refusal
 * through the alert box below is the backstop, not the experience.
 */
export function RoleForm({
  initial,
  catalog,
  fieldCatalog,
  busy,
  error,
  submitLabel,
  onSubmit,
}: {
  initial?: Pick<Role, 'name' | 'description' | 'permissions' | 'maskedFields'>;
  catalog: Record<string, PermissionModule>;
  /** RBAC-03 vocabulary, fetched — the frontend invents no keys (R-4.5). */
  fieldCatalog: Record<string, ClientFieldGroup>;
  busy: boolean;
  error: string;
  submitLabel: string;
  onSubmit: (values: RoleFormValues) => void;
}) {
  const { admin } = useAdmin();
  const ownMask = React.useMemo(() => admin?.maskedFields ?? [], [admin?.maskedFields]);

  const [name, setName] = React.useState(initial?.name ?? '');
  const [description, setDescription] = React.useState(initial?.description ?? '');
  const [permissions, setPermissions] = React.useState<string[]>(initial?.permissions ?? []);
  const [maskedFields, setMaskedFields] = React.useState<string[]>(() =>
    // The union: what the role hides, plus what the SUBMITTER cannot reveal.
    // The server would refuse anything narrower, so offering it would only
    // move the refusal from the checkbox to the save button.
    Array.from(new Set([...(initial?.maskedFields ?? []), ...ownMask])),
  );

  const toggle = (key: string) =>
    setPermissions((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
      permissions,
      maskedFields,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 text-xs">
      <div className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-card p-5 md:grid-cols-2">
        <div>
          <label className="font-semibold" htmlFor="role-name">
            {t('settings.roleName')}
          </label>
          <input
            id="role-name"
            type="text"
            required
            placeholder={t('settings.roleNamePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            className="mt-1 h-9 w-full rounded-lg border border-input bg-card px-3 disabled:opacity-60"
          />
        </div>
        <div>
          <label className="font-semibold" htmlFor="role-description">
            {t('settings.roleDescription')}
          </label>
          <input
            id="role-description"
            type="text"
            placeholder={t('settings.roleDescriptionPlaceholder')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={busy}
            className="mt-1 h-9 w-full rounded-lg border border-input bg-card px-3 disabled:opacity-60"
          />
        </div>
      </div>

      {/* The matrix is shared with the admin editor (RBAC-02), so a role and a
          direct grant always offer the same vocabulary. */}
      <PermissionMatrix catalog={catalog} selected={permissions} onToggle={toggle} />

      {/*
       * A <details> with an always-visible summary. Collapsed because most
       * roles hide nothing — but the summary line is on screen before it is
       * opened, because RBAC-03's failure mode is granting visibility you did
       * not realise you granted.
       */}
      <details className="rounded-lg border border-border bg-card p-3">
        <summary className="cursor-pointer list-none text-xs font-semibold focus-outline">
          <span className="flex items-center justify-between gap-3">
            {t('roles.maskSection')}
            <span className="text-[11px] font-normal text-muted-foreground">
              {maskedFields.length === 0
                ? t('roles.maskSummaryNone')
                : t('roles.maskSummary', { count: maskedFields.length })}
            </span>
          </span>
        </summary>
        <div className="pt-3">
          <p className="mb-2 text-[11px] text-muted-foreground">{t('roles.maskHint')}</p>
          <ToggleList
            options={Object.values(fieldCatalog)
              .flatMap((group) => group.fields)
              .map((field) => ({
                value: field.key,
                label: field.label,
                hint: field.key,
                // Shown and disabled WITH the reason, never omitted: an operator
                // hunting for "why can I not hide the status column" — or "why
                // can I not un-hide the email" — needs the answer where they
                // are looking.
                disabledReason: !field.maskable
                  ? field.reason
                  : ownMask.includes(field.key)
                    ? t('roles.maskLockedOwn')
                    : undefined,
              }))}
            selected={maskedFields}
            onToggle={(key) =>
              setMaskedFields((prev) =>
                prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
              )
            }
            disabled={busy}
          />
        </div>
      </details>

      {error && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
          role="alert"
        >
          {error}
        </div>
      )}

      {/*
       * Cancel then Save, right-aligned, above a hairline — the same footer
       * every modal in this console ends on, so the two screens that edit a
       * role finish the same way as the ones that edit an administrator.
       *
       * Cancel is a LINK inside a Button (`asChild`), not a button that calls
       * `router.back()`: this is a real route, and back is not the same thing as
       * "return to the list" once someone has arrived from a bookmark.
       */}
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button asChild variant="outline" size="sm">
          <Link href="/roles">{t('common.cancel')}</Link>
        </Button>
        <Button type="submit" size="sm" disabled={busy} aria-busy={busy}>
          {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
          {busy ? t('roles.saving') : submitLabel}
        </Button>
      </div>
    </form>
  );
}
