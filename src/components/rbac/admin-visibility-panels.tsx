'use client';

import { AlertTriangle } from 'lucide-react';
import type { ClientFieldGroup, ClientTagWithCount } from '@/lib/api/admin';
import { ToggleList, type ToggleListOption } from '@/components/ui/toggle-list';
import { t } from '@/lib/i18n';

/**
 * RBAC-03's two configuration surfaces, on one administrator.
 *
 * Both are gated on `users.scope` rather than `users.edit`, and that separation
 * is the point: reusing `users.edit` would mean anyone who can RENAME an
 * administrator can also widen that administrator's view of the entire client
 * base. Those are not the same size of act.
 */

/**
 * Which clients this administrator may see.
 *
 * ── The empty case is stated in words, never left to inference ──────────────
 *
 * An empty scope means UNRESTRICTED — every client — following RBAC-08's empty
 * allowlist and D-10, so that introducing the feature cannot blind every
 * existing sub-admin. Both readings of "no tags selected" are plausible and one
 * of them is a data breach, so the panel says which it is rather than hoping
 * the operator guesses right.
 */
export function AdminTagScopePanel({
  tags,
  selected,
  onToggle,
  disabled,
  disabledReason,
}: {
  tags: readonly ClientTagWithCount[];
  selected: readonly string[];
  onToggle: (tagId: string) => void;
  disabled?: boolean;
  /** Why the whole panel is inert — e.g. this is the master admin. */
  disabledReason?: string;
}) {
  const options: ToggleListOption[] = tags.map((tag) => ({
    value: tag.id,
    label: tag.label,
    hint: t('adminUsers.scopeTagHint', { count: tag.clientCount }),
  }));

  return (
    <div className="space-y-3">
      {disabledReason ? (
        <p className="text-[11px] text-muted-foreground">{disabledReason}</p>
      ) : (
        <>
          <p className="text-[11px] text-muted-foreground">{t('adminUsers.scopeHint')}</p>

          <ToggleList
            options={options}
            selected={selected}
            onToggle={onToggle}
            disabled={disabled}
            emptyMessage={t('adminUsers.scopeNoTags')}
          />

          {selected.length === 0 && (
            <p
              className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-[11px] text-warning"
              role="note"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{t('adminUsers.scopeEmptyWarning')}</span>
            </p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Which client fields this administrator may NOT see.
 *
 * The catalog is FETCHED (`GET /admin/client-fields`), never a frontend
 * constant — the same rule as the permission catalog (R-4.5). A key the backend
 * does not mask must not be offerable, and one it gains must appear without a
 * frontend release. A mask key with no backend counterpart is not a cosmetic
 * bug: it is a field an operator ticked a box for and believes they hid.
 */
export function AdminFieldMaskPanel({
  catalog,
  selected,
  onToggle,
  disabled,
  disabledReason,
  inheriting,
  onResetToRole,
}: {
  catalog: Record<string, ClientFieldGroup>;
  selected: readonly string[];
  onToggle: (key: string) => void;
  disabled?: boolean;
  disabledReason?: string;
  /** True while this admin has no override and follows their role. */
  inheriting: boolean;
  onResetToRole: () => void;
}) {
  const fields = Object.values(catalog).flatMap((group) => group.fields);

  const options: ToggleListOption[] = fields.map((field) => ({
    value: field.key,
    label: field.label,
    hint: field.key,
    // Unmaskable fields are SHOWN and disabled WITH THEIR REASON, not omitted.
    // An operator hunting for "why can I not hide the status column" needs the
    // answer where they are looking, not absence.
    disabledReason: field.maskable ? undefined : field.reason,
  }));

  return (
    <div className="space-y-3">
      {disabledReason ? (
        <p className="text-[11px] text-muted-foreground">{disabledReason}</p>
      ) : (
        <>
          <p className="text-[11px] text-muted-foreground">
            {inheriting ? t('adminUsers.maskInheriting') : t('adminUsers.maskOverriding')}
          </p>

          <ToggleList
            options={options}
            selected={selected}
            onToggle={onToggle}
            disabled={disabled}
          />

          {!inheriting && (
            <button
              type="button"
              onClick={onResetToRole}
              disabled={disabled}
              className="text-[11px] font-semibold text-link hover:underline focus-outline disabled:opacity-50"
            >
              {/*
               * Clearing the override is a distinct action from "select
               * nothing", and the API distinguishes them: `null` means inherit
               * the role, `[]` means explicitly mask nothing for this person.
               * Without this control the second is reachable and the first is
               * not, so an admin could never be put back on their role.
               */}
              {t('adminUsers.maskResetToRole')}
            </button>
          )}
        </>
      )}
    </div>
  );
}
