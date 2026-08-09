'use client';

import * as React from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import type { PermissionModule, Role } from '@/lib/api/admin';
import { PermissionMatrix } from './permission-matrix';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';

export interface RoleFormValues {
  name: string;
  description?: string;
  permissions: string[];
  /*
   * No `maskedFields`.
   *
   * A role is a set of PERMISSIONS. The field-masking half — which client
   * fields holders of this role may not see — has been removed from the
   * console: it was a second, parallel access model that had to be reasoned
   * about alongside permissions on every screen, and it was configurable in two
   * places (here, and per-administrator) with different semantics in each.
   *
   * `PUT /admin/roles/:id` still accepts `maskedFields` and the API still
   * enforces whatever is stored, so a role that carries one keeps it: omitting
   * the field from the request leaves it untouched rather than clearing it.
   * Existing masks are therefore still applied and no longer editable from any
   * screen — a data cleanup, not a UI one.
   */
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
 * ── A role is PERMISSIONS, and nothing else ───────────────────────────────
 *
 * There was a second section here for field masking — which client fields
 * holders of this role may not see — argued for on the grounds that it is a
 * property of the job, like a permission. It was removed along with its
 * per-administrator counterpart in the admin editor.
 *
 * The reason is that it was a SECOND access model running beside the first,
 * with its own vocabulary, its own catalog fetch and its own override
 * semantics, and every screen that showed client data had to reason about
 * both. One model answers "what may this person do", and that is the one this
 * form configures.
 */
export function RoleForm({
  initial,
  catalog,
  busy,
  error,
  submitLabel,
  onSubmit,
}: {
  initial?: Pick<Role, 'name' | 'description' | 'permissions'>;
  catalog: Record<string, PermissionModule>;
  busy: boolean;
  error: string;
  submitLabel: string;
  onSubmit: (values: RoleFormValues) => void;
}) {
  const [name, setName] = React.useState(initial?.name ?? '');
  const [description, setDescription] = React.useState(initial?.description ?? '');
  const [permissions, setPermissions] = React.useState<string[]>(initial?.permissions ?? []);

  const toggle = (key: string) =>
    setPermissions((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
      permissions,
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
