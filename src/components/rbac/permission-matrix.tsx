'use client';

import type { PermissionModule } from '@/lib/api/admin';
import { Checkbox } from '@/components/ui/checkbox';
import { t } from '@/lib/i18n';

/**
 * The per-action permission matrix, built from the backend catalog
 * (GET /admin/permissions).
 *
 * Extracted from RoleFormModal when a second screen needed it: RBAC-02 asks for
 * permissions "assigned individually to a sub-admin", so the admin editor grants
 * from the same vocabulary a role does. Copying the markup was the alternative,
 * and a copy is exactly how the old /roles page drifted out of step with the
 * Settings tab it duplicated.
 *
 * The catalog is DATA from the API, never a hardcoded list — a permission the
 * backend does not enforce must not be offerable here, and one it gained must
 * appear without a frontend release.
 *
 * ── Real checkboxes, not icon buttons ──────────────────────────────────────
 *
 * Each row was a `<button aria-pressed>` with a `CheckSquare`/`Square` icon.
 * That reads to a screen reader as a toggle button rather than a checkbox, and
 * it reimplements — in two icons and a class ternary — a control the design
 * system already ships. `Checkbox` is Radix underneath, so the box, the label
 * pairing and the keyboard behaviour come from one place.
 *
 * The whole row is still clickable: the label is `htmlFor` the box, so a click
 * anywhere on it toggles, which is what made the button version feel right.
 */
export function PermissionMatrix({
  catalog,
  selected,
  onToggle,
  onSelectAll,
  disabled = false,
}: {
  catalog: Record<string, PermissionModule>;
  selected: string[];
  onToggle: (key: string) => void;
  /**
   * Select-all / clear, per module and overall.
   *
   * OPTIONAL, so the two role screens that predate it are unchanged and render
   * exactly as before. Given `keys` and the intended state, the caller decides
   * how to apply it — this component never owns the selection.
   */
  onSelectAll?: (keys: string[], nextSelected: boolean) => void;
  disabled?: boolean;
}) {
  const allKeys = Object.values(catalog).flatMap((mod) => mod.permissions.map((p) => p.key));
  const allSelected = allKeys.length > 0 && allKeys.every((key) => selected.includes(key));
  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground">
          {t('settings.permissionMatrix', {
            count: selected.length,
            noun: selected.length === 1 ? t('settings.action') : t('settings.actions'),
          })}
        </h4>

        {onSelectAll && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSelectAll(allKeys, !allSelected)}
            className="focus-outline text-xs font-semibold text-link hover:underline disabled:opacity-50"
          >
            {allSelected ? t('settings.clearAll') : t('settings.selectAll')}
          </button>
        )}
      </div>

      <div className="space-y-4">
        {Object.entries(catalog).map(([modKey, mod]) => {
          const moduleKeys = mod.permissions.map((p) => p.key);
          const moduleAllSelected = moduleKeys.every((key) => selected.includes(key));
          return (
            <div key={modKey} className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-foreground text-xs">{mod.moduleName}</span>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-muted-foreground">{mod.description}</span>
                  {onSelectAll && (
                    // Per module as well as overall: granting "everything under
                    // Clients" is the shape of the decision an operator actually
                    // makes, and doing it one box at a time is where they stop
                    // reading what they are granting.
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onSelectAll(moduleKeys, !moduleAllSelected)}
                      className="focus-outline shrink-0 text-[11px] font-semibold text-link hover:underline disabled:opacity-50"
                    >
                      {moduleAllSelected ? t('settings.clearAll') : t('settings.selectAll')}
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 pt-2 sm:grid-cols-2 xl:grid-cols-3">
                {mod.permissions.map((p) => {
                  const isChecked = selected.includes(p.key);
                  const id = `perm-${p.key}`;
                  return (
                    <label
                      key={p.key}
                      htmlFor={id}
                      className={`flex w-full cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 text-left ${
                        disabled ? 'cursor-not-allowed opacity-50' : ''
                      } ${
                        isChecked
                          ? 'border-ring bg-primary/10'
                          : 'border-border bg-card hover:bg-muted'
                      }`}
                    >
                      <Checkbox
                        id={id}
                        checked={isChecked}
                        disabled={disabled}
                        // Radix hands back the new value, not an event, and it
                        // can be 'indeterminate' — neither matters here because
                        // the parent owns the list and only needs the toggle.
                        onCheckedChange={() => onToggle(p.key)}
                        className="mt-0.5 shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold leading-tight text-foreground">
                          {p.label}
                        </p>
                        <p className="truncate font-mono text-[10px] text-muted-foreground">
                          {p.key}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
