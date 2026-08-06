'use client';

import * as React from 'react';
import type {
  AdminUser,
  ClientFieldGroup,
  ClientTagWithCount,
  PermissionModule,
  Role,
} from '@/lib/api/admin';
import { PermissionMatrix } from './permission-matrix';
import { AdminFieldMaskPanel, AdminTagScopePanel } from './admin-visibility-panels';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { t } from '@/lib/i18n';

export interface AdminFormValues {
  name?: string;
  roleId?: string;
  permissions?: string[];
  /** RBAC-03 mask override. `null` clears it — back to inheriting the role. */
  maskedFields?: string[] | null;
  /** RBAC-03 territory. An EMPTY ARRAY means unrestricted, not none. */
  scopedTagIds?: string[];
}

/** Order- and duplicate-insensitive membership equality. */
function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const left = new Set(a);
  return b.every((value) => left.has(value));
}

const DIRECT = '__direct__';

/**
 * Edit one administrator — FR-RBAC-07's "edit" and FR-RBAC-02's per-sub-admin half.
 *
 * `PATCH /admin/users/:id` has always accepted `{ name, roleId, permissions }`.
 * The directory only ever sent `roleId`, so granting a single extra permission to
 * one person meant inventing a role for them — and the FSD asks for permissions
 * "assigned individually to a sub-admin", not only through roles.
 *
 * THE RULE THIS UI MUST NOT HIDE: roleId and direct permissions are exclusive.
 * The API copies a role's permissions onto the admin and records the roleId, or
 * takes a direct list and clears the roleId — never both. An admin on a role
 * tracks that role as it is edited; one on direct grants does not. Presenting
 * them as two independent fields would let someone believe they had done both,
 * so the choice is a single control and the consequence is stated in the form.
 */
export function AdminFormModal({
  admin,
  roles,
  catalog,
  tags,
  fieldCatalog,
  currentScope,
  canScope,
  busy,
  error,
  onSubmit,
  onClose,
}: {
  admin: AdminUser;
  roles: Role[];
  catalog: Record<string, PermissionModule>;
  /** RBAC-03 vocabularies, both fetched — the frontend invents no keys (R-4.5). */
  tags: ClientTagWithCount[];
  fieldCatalog: Record<string, ClientFieldGroup>;
  /** This admin's current territory, resolved server-side. */
  currentScope: string[];
  /** A separate permission from users.edit — see the panels. */
  canScope: boolean;
  busy: boolean;
  error: string;
  onSubmit: (values: AdminFormValues) => void;
  onClose: () => void;
}) {
  const [name, setName] = React.useState(admin.name);
  // '__direct__' rather than '' — an empty Select value is indistinguishable
  // from "nothing chosen yet", and this is a deliberate choice with consequences.
  const [source, setSource] = React.useState<string>(admin.roleId ?? DIRECT);
  const [permissions, setPermissions] = React.useState<string[]>(admin.permissions ?? []);
  const [scopedTagIds, setScopedTagIds] = React.useState<string[]>(currentScope);
  /*
   * `null` is a real value here, not a placeholder: it is what puts this
   * administrator back on their role's mask. An `undefined` state could not
   * express it, and the operator would have no way to undo an override.
   */
  const [maskedFields, setMaskedFields] = React.useState<string[] | null>(
    admin.maskedFieldsOverride ?? null,
  );

  const assignable = roles.filter((r) => !r.isSystem);
  const usingDirect = source === DIRECT;
  const nameChanged = name.trim() !== admin.name;

  const toggle = (key: string) =>
    setPermissions((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    // Send only what changed. A roleId echoed back unchanged still rewrites the
    // permission snapshot and lands another entry in the audit log against a
    // named administrator.
    const values: AdminFormValues = {};
    if (nameChanged) values.name = name.trim();
    if (usingDirect) {
      values.permissions = permissions;
    } else if (source !== admin.roleId) {
      values.roleId = source;
    }
    /*
     * The two visibility dimensions are compared as SETS, and only sent when
     * they actually differ.
     *
     * A `scopedTagIds` echoed back unchanged is a whole-set replace on the
     * scope table and another audit row against a named administrator — and,
     * because the panel presents order-free chips, the array order alone would
     * otherwise make every save look like a change.
     */
    if (!sameSet(scopedTagIds, currentScope)) values.scopedTagIds = scopedTagIds;

    const inheritingNow = maskedFields === null;
    const inheritingBefore = (admin.maskedFieldsOverride ?? null) === null;
    if (inheritingNow !== inheritingBefore) {
      values.maskedFields = maskedFields;
    } else if (maskedFields !== null && !sameSet(maskedFields, admin.maskedFieldsOverride ?? [])) {
      values.maskedFields = maskedFields;
    }

    if (Object.keys(values).length === 0) {
      onClose();
      return;
    }
    onSubmit(values);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      {/*
       * `role="dialog"` + `aria-modal`, which this hand-rolled overlay was
       * missing entirely — so a screen reader announced it as an ordinary
       * region and gave no indication that the rest of the page was inert.
       * `ui/modal.tsx` has always done this; this component predates it and
       * never caught up.
       */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-form-title"
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-2xl space-y-5"
      >
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h3 id="admin-form-title" className="text-base font-bold">
              {t('adminUsers.editTitle')}
            </h3>
            <p className="font-mono text-[11px] text-muted-foreground mt-0.5">{admin.email}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="text-muted-foreground hover:text-foreground focus-outline rounded-sm"
          >
            {t('table.close')}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 text-xs">
          <div>
            <label className="font-semibold" htmlFor="admin-name">
              {t('adminUsers.nameLabel')}
            </label>
            <input
              id="admin-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3"
            />
          </div>

          <div>
            <label className="font-semibold" htmlFor="admin-source">
              {t('adminUsers.accessLabel')}
            </label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger id="admin-source" className="mt-1 h-9 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {assignable.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
                <SelectItem value={DIRECT}>{t('adminUsers.directOption')}</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {usingDirect ? t('adminUsers.directHint') : t('adminUsers.roleHint')}
            </p>
          </div>

          {/* Only when granting directly. Showing the matrix under a role would
              imply the ticks are editable, when the role owns them and edits to
              it overwrite whatever is shown here. */}
          {usingDirect && (
            <PermissionMatrix catalog={catalog} selected={permissions} onToggle={toggle} />
          )}

          {/*
           * `<details>` with an ALWAYS-VISIBLE summary, not tabs.
           *
           * RBAC-07's failure mode is granting access you did not realise you
           * granted, and a tab hides the summary of the tab you are not on. A
           * summary line you cannot avoid reading is the whole point — so
           * "3 tags · 2 fields hidden" is on screen before anything is opened.
           *
           * Native `<details>` is keyboard- and screen-reader-correct with no
           * dependency, which is why this is not a Radix accordion.
           */}
          {canScope && (
            <div className="space-y-2 rounded-lg border border-border">
              <details className="group p-3">
                <summary className="cursor-pointer list-none font-semibold focus-outline">
                  <span className="flex items-center justify-between gap-3">
                    {t('adminUsers.scopeSection')}
                    <span className="font-normal text-[11px] text-muted-foreground">
                      {scopedTagIds.length === 0
                        ? t('adminUsers.scopeSummaryAll')
                        : t('adminUsers.scopeSummary', { count: scopedTagIds.length })}
                    </span>
                  </span>
                </summary>
                <div className="pt-3">
                  <AdminTagScopePanel
                    tags={tags}
                    selected={scopedTagIds}
                    onToggle={(tagId) =>
                      setScopedTagIds((prev) =>
                        prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
                      )
                    }
                    disabled={busy}
                    disabledReason={
                      admin.role === 'master_admin' ? t('adminUsers.masterExempt') : undefined
                    }
                  />
                </div>
              </details>

              <details className="group border-t border-border p-3">
                <summary className="cursor-pointer list-none font-semibold focus-outline">
                  <span className="flex items-center justify-between gap-3">
                    {t('adminUsers.maskSection')}
                    <span className="font-normal text-[11px] text-muted-foreground">
                      {maskedFields === null
                        ? t('adminUsers.maskSummaryInherited')
                        : maskedFields.length === 0
                          ? t('adminUsers.maskSummaryNone')
                          : t('adminUsers.maskSummary', { count: maskedFields.length })}
                    </span>
                  </span>
                </summary>
                <div className="pt-3">
                  <AdminFieldMaskPanel
                    catalog={fieldCatalog}
                    selected={maskedFields ?? []}
                    inheriting={maskedFields === null}
                    onResetToRole={() => setMaskedFields(null)}
                    onToggle={(key) =>
                      setMaskedFields((prev) => {
                        // The first tick on an inheriting admin CREATES the
                        // override, starting from what they can see today
                        // rather than from nothing.
                        const base = prev ?? [];
                        return base.includes(key) ? base.filter((k) => k !== key) : [...base, key];
                      })
                    }
                    disabled={busy}
                    disabledReason={
                      admin.role === 'master_admin' ? t('adminUsers.masterExempt') : undefined
                    }
                  />
                </div>
              </details>
            </div>
          )}

          {error && (
            <div
              className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
              role="alert"
            >
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="h-9 px-4 rounded-lg border border-input bg-card font-medium hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed focus-outline"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={busy}
              aria-busy={busy}
              className="h-9 px-4 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed focus-outline"
            >
              {busy ? t('common.saving') : t('common.saveChanges')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
