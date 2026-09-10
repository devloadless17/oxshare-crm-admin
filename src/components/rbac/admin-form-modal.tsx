'use client';

import * as React from 'react';
import type { AdminUser, ClientFieldGroup, ClientTagWithCount, Role } from '@/lib/api/admin';
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
  /*
   * No `permissions` field.
   *
   * `PATCH /admin/users/:id` still accepts a direct permission list — the API
   * has not changed — but this console no longer sends one. Access here is a
   * ROLE, always. See the note on the component.
   */
  /** RBAC-03 mask override. `null` clears it — back to inheriting the role. */
  maskedFields?: string[] | null;
  /** RBAC-03 territory. An EMPTY ARRAY means unrestricted, not none. */
  scopedTagIds?: string[];
  /** D-60 — sees the intake pool (clients with no tags yet). */
  seesUntriaged?: boolean;
}

/** Order- and duplicate-insensitive membership equality. */
function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const left = new Set(a);
  return b.every((value) => left.has(value));
}

/**
 * Edit one administrator — FR-RBAC-07's "edit" half.
 *
 * ## Access is a ROLE. There is no per-person permission list.
 *
 * `PATCH /admin/users/:id` accepts either a `roleId` or a direct `permissions`
 * array, and this modal used to offer both through one "Access" select: pick a
 * role, or pick "Individual permissions" and tick a matrix. That option is gone
 * and the matrix with it.
 *
 * The two grant paths are exclusive on the API — it copies a role's permissions
 * onto the admin and records the roleId, or takes a direct list and CLEARS the
 * roleId — and the second one produces an administrator whose access is a
 * snapshot belonging to nobody. It does not track the role as the role is
 * edited, it appears in no roles screen, and answering "who can approve
 * withdrawals?" stops being a question about roles and becomes an audit of
 * every individual account. On a permission set that gates money movement, one
 * place to look is worth more than the convenience of granting one extra key.
 *
 * Needing a permission combination no role has is a signal to create the role,
 * which is a screen this console already has.
 */
export function AdminFormModal({
  admin,
  roles,
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
  /** The tag vocabulary, FETCHED — the frontend invents no keys (R-4.5). */
  tags: ClientTagWithCount[];
  /** The maskable-field vocabulary, FETCHED — same rule (R-4.5). */
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
  /*
   * Empty when this administrator holds no role — a real state for accounts
   * created before roles were mandatory here. It shows as the select's
   * placeholder, so the form reads as "no role chosen" rather than silently
   * defaulting somebody onto the first role in the list.
   */
  const [roleId, setRoleId] = React.useState<string>(admin.roleId ?? '');
  const [scopedTagIds, setScopedTagIds] = React.useState<string[]>(currentScope);
  const [seesUntriaged, setSeesUntriaged] = React.useState<boolean>(admin.seesUntriaged ?? false);
  /*
   * `null` = inheriting the role's mask; a list = this person's override.
   * The DTO serves both halves (`maskedFields` is the EFFECTIVE mask,
   * `maskedFieldsOverride` the stored override) precisely so this form can
   * tell "inherits the role" from "has an identical override" — and offer the
   * way back.
   */
  const [maskOverride, setMaskOverride] = React.useState<string[] | null>(
    admin.maskedFieldsOverride ?? null,
  );
  const inheriting = maskOverride === null;
  // What the panel shows: the override when there is one, the role's mask
  // through the glass when there is not.
  const effectiveMask = maskOverride ?? admin.maskedFields ?? [];

  const toggleMaskField = (key: string) => {
    // The first toggle FORKS the role's mask into an override — the operator
    // edits what they see, not an invisible empty list.
    setMaskOverride((prev) => {
      const base = prev ?? admin.maskedFields ?? [];
      return base.includes(key) ? base.filter((k) => k !== key) : [...base, key];
    });
  };

  /*
   * Every role is assignable, INCLUDING system ones.
   *
   * This filtered `isSystem` out, which meant the one role holding the whole
   * permission catalog could not be handed to anybody. Combined with the same
   * filter on the roles list, "full access" became something the console could
   * neither show nor grant — the exact failure that got `Master Admin` deleted.
   *
   * `isSystem` bounds who may EDIT a role, not who may HOLD it: the API refuses
   * to modify or delete one, and `permission-drift.ts` keeps its permissions in
   * step with the catalog. Assigning it is an ordinary act, and the upward-reach
   * rule (D-59) already stops an operator granting a role above their own.
   */
  const assignable = roles;
  const nameChanged = name.trim() !== admin.name;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    // Send only what changed. A roleId echoed back unchanged still rewrites the
    // permission snapshot and lands another entry in the audit log against a
    // named administrator.
    const values: AdminFormValues = {};
    if (nameChanged) values.name = name.trim();
    if (roleId && roleId !== admin.roleId) values.roleId = roleId;
    /*
     * The scope is compared as a SET, and only sent when it actually differs.
     *
     * A `scopedTagIds` echoed back unchanged is a whole-set replace on the
     * scope table and another audit row against a named administrator — and,
     * because the panel presents order-free chips, the array order alone would
     * otherwise make every save look like a change.
     */
    if (!sameSet(scopedTagIds, currentScope)) values.scopedTagIds = scopedTagIds;
    if (seesUntriaged !== (admin.seesUntriaged ?? false)) values.seesUntriaged = seesUntriaged;
    /*
     * The override is sent only when it CHANGED, with `null` meaning "clear it
     * — follow the role again". `[]` is a real value (explicitly mask nothing
     * for this person), which is why the comparison cannot collapse the two.
     */
    const storedOverride = admin.maskedFieldsOverride ?? null;
    const overrideChanged =
      inheriting !== (storedOverride === null) ||
      (!inheriting && !sameSet(maskOverride ?? [], storedOverride ?? []));
    if (overrideChanged) values.maskedFields = maskOverride;

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
              className="mt-1 h-9 w-full rounded-lg border border-input bg-card px-3"
            />
          </div>

          <div>
            <label className="font-semibold" htmlFor="admin-source">
              {t('adminUsers.accessLabel')}
            </label>
            {/*
             * Roles only. The "Individual permissions" option and the matrix
             * under it are gone — see the note on this component.
             */}
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger id="admin-source" className="mt-1 h-9 w-full text-xs">
                <SelectValue placeholder={t('adminUsers.rolePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {assignable.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1.5 text-[11px] text-muted-foreground">{t('adminUsers.roleHint')}</p>
          </div>

          {/*
           * Both RBAC-03 surfaces, open rather than collapsed: which CLIENTS
           * this person sees (territory) and which FIELDS of them (the mask
           * override — restored 13 Aug; the role's mask is the default and
           * `/roles` is where it normally lives, this is the one-person
           * exception with a stated way back).
           */}
          {canScope && (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <p className="font-semibold">{t('adminUsers.scopeSection')}</p>
              <AdminTagScopePanel
                tags={tags}
                selected={scopedTagIds}
                onToggle={(tagId) =>
                  setScopedTagIds((prev) =>
                    prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
                  )
                }
                disabled={busy}
              />
              {/*
               * D-60 — the intake grant, INSIDE the scope section because it is
               * territory: "the clients nobody has triaged yet" sits beside the
               * tag territories it complements. Derived, not a tag, so it is a
               * checkbox rather than an entry in the tag select. (No master
               * exemption: that tier is gone; an unrestricted admin is simply
               * one with no territory rows, and the grant is then moot.)
               */}
              {
                <div className="border-t border-border pt-2.5">
                  <label className="flex cursor-pointer items-start gap-2 text-xs font-medium">
                    <input
                      type="checkbox"
                      checked={seesUntriaged}
                      onChange={(e) => setSeesUntriaged(e.target.checked)}
                      disabled={busy}
                      className="mt-0.5 h-3.5 w-3.5 accent-primary"
                    />
                    <span>
                      {t('adminUsers.seesUntriaged')}
                      <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
                        {t('adminUsers.seesUntriagedHint')}
                      </span>
                    </span>
                  </label>
                </div>
              }
            </div>
          )}

          {canScope && (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <p className="font-semibold">
                {t('adminUsers.maskSection')}
                <span className="ms-2 font-normal text-[11px] text-muted-foreground">
                  {inheriting
                    ? t('adminUsers.maskSummaryInherited')
                    : effectiveMask.length === 0
                      ? t('adminUsers.maskSummaryNone')
                      : t('adminUsers.maskSummary', { count: effectiveMask.length })}
                </span>
              </p>
              <AdminFieldMaskPanel
                catalog={fieldCatalog}
                selected={effectiveMask}
                onToggle={toggleMaskField}
                disabled={busy}
                inheriting={inheriting}
                onResetToRole={() => setMaskOverride(null)}
              />
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
