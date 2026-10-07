'use client';

import * as React from 'react';
import { Search } from 'lucide-react';
import type { PermissionModule } from '@/lib/api/admin';
import { Checkbox } from '@/components/ui/checkbox';
import { NAV, isNavGroup } from '@/components/layout/navigation';
import { t } from '@/lib/i18n';
import { labelOf, modulesByGroup, setKeys, toggleKey, type ToggleResult } from './permission-rules';

/**
 * The permission matrix, laid out EXACTLY LIKE THE SIDEBAR (Oct 2026 audit).
 *
 * The buyer configuring his staff could not tell what a tick would put in front
 * of somebody: 19 cards in the catalog's file order, each headed by engineering
 * prose, every tile showing its raw key, and one checkbox ("View Partners,
 * Applications & Commission Levels") that opened five pages. Now:
 *
 *  - Sections are the sidebar's groups, with its labels and icons, and each card
 *    is ONE menu item: its view key is marked "Menu" — the only key that puts the
 *    page in somebody's sidebar — and the rest are what may be done there.
 *  - Ticking an action brings the page it needs; turning a page off takes its
 *    actions with it and says which (`permission-rules.ts`, the API's own rule).
 *  - A key the editor does not hold is greyed out: the API refuses to grant it.
 *  - Search, select all (per group and overall), and permission codes hidden
 *    behind a toggle for whoever supports the console.
 *
 * The catalog is DATA from the API, never a hardcoded list — a permission the
 * backend does not enforce must not be offerable here, and one it gained must
 * appear without a frontend release. Shared by the role editor and the API key
 * form, so both offer the same vocabulary.
 */
export function PermissionMatrix({
  catalog,
  selected,
  onChange,
  grantable = () => true,
  disabled = false,
}: {
  catalog: Record<string, PermissionModule>;
  selected: string[];
  onChange: (next: string[]) => void;
  /** False for a key the editor may not grant (they do not hold it). */
  grantable?: (key: string) => boolean;
  disabled?: boolean;
}) {
  const [query, setQuery] = React.useState('');
  const [showCodes, setShowCodes] = React.useState(false);
  const [cleared, setCleared] = React.useState<string[]>([]);

  const apply = (result: ToggleResult) => {
    onChange(result.next);
    setCleared(result.cleared);
  };
  const usable = (keys: string[]) => keys.filter((k) => grantable(k));

  const sections = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return modulesByGroup(catalog)
      .map(({ group, modules }) => ({
        group,
        modules: modules
          .map(([id, mod]): [string, PermissionModule] => {
            if (!q || mod.moduleName.toLowerCase().includes(q)) return [id, mod];
            return [
              id,
              {
                ...mod,
                permissions: mod.permissions.filter((p) => p.label.toLowerCase().includes(q)),
              },
            ];
          })
          .filter(([, mod]) => mod.permissions.length > 0),
      }))
      .filter((section) => section.modules.length > 0);
  }, [catalog, query]);

  const allKeys = usable(Object.values(catalog).flatMap((m) => m.permissions.map((p) => p.key)));
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selected.includes(k));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h4 className="me-auto text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {t('rbac.matrixTitle', { count: selected.length })}
        </h4>
        <label className="relative">
          <span className="sr-only">{t('rbac.search')}</span>
          <Search
            className="pointer-events-none absolute start-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('rbac.search')}
            className="h-9 w-56 rounded-lg border border-input bg-card ps-8 pe-3 text-xs"
          />
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground">
          <Checkbox checked={showCodes} onCheckedChange={(v) => setShowCodes(v === true)} />
          {t('rbac.showCodes')}
        </label>
        <button
          type="button"
          disabled={disabled}
          onClick={() => apply(setKeys(catalog, selected, allKeys, !allSelected))}
          className="focus-outline text-xs font-semibold text-link hover:underline disabled:opacity-50"
        >
          {allSelected ? t('settings.clearAll') : t('settings.selectAll')}
        </button>
      </div>

      {cleared.length > 0 && (
        <p
          role="status"
          className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground"
        >
          {t('rbac.alsoCleared', { keys: cleared.map((k) => labelOf(catalog, k)).join(', ') })}
        </p>
      )}

      {sections.length === 0 && (
        <p className="text-xs text-muted-foreground">{t('rbac.noMatch', { query })}</p>
      )}

      {sections.map(({ group, modules }) => {
        const nav = NAV.find((entry) => isNavGroup(entry) && entry.id === group);
        const Icon = nav?.icon;
        const groupKeys = usable(modules.flatMap(([, m]) => m.permissions.map((p) => p.key)));
        const groupAll = groupKeys.length > 0 && groupKeys.every((k) => selected.includes(k));
        return (
          <section key={group} aria-labelledby={`perm-group-${group}`} className="space-y-2">
            <div className="flex items-center gap-2 border-b border-border pb-1.5">
              {Icon && <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />}
              <h5 id={`perm-group-${group}`} className="text-sm font-bold text-foreground">
                {nav ? t(nav.label) : group}
              </h5>
              <button
                type="button"
                disabled={disabled || groupKeys.length === 0}
                onClick={() => apply(setKeys(catalog, selected, groupKeys, !groupAll))}
                className="focus-outline ms-auto text-[11px] font-semibold text-link hover:underline disabled:opacity-50"
              >
                {groupAll ? t('settings.clearAll') : t('settings.selectAll')}
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {modules.map(([id, mod]) => (
                <ModuleCard
                  key={id}
                  mod={mod}
                  selected={selected}
                  showCodes={showCodes}
                  disabled={disabled}
                  grantable={grantable}
                  onToggle={(key) => apply(toggleKey(catalog, selected, key))}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ModuleCard({
  mod,
  selected,
  showCodes,
  disabled,
  grantable,
  onToggle,
}: {
  mod: PermissionModule;
  selected: string[];
  showCodes: boolean;
  disabled: boolean;
  grantable: (key: string) => boolean;
  onToggle: (key: string) => void;
}) {
  // The page key(s) first: the switch for whether the item is in the menu at all.
  const pages = mod.permissions.filter((p) => p.opens && p.opens.length > 0);
  const actions = mod.permissions.filter((p) => !p.opens || p.opens.length === 0);
  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
      <div>
        <p className="text-xs font-bold text-foreground">{mod.moduleName}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{mod.description}</p>
      </div>
      <div className="space-y-1.5">
        {[...pages, ...actions].map((p) => {
          const isPage = pages.includes(p);
          const locked = !grantable(p.key);
          const checked = selected.includes(p.key);
          const id = `perm-${p.key}`;
          return (
            <label
              key={p.key}
              htmlFor={id}
              title={locked ? t('rbac.notGrantable') : undefined}
              className={`flex items-start gap-2.5 rounded-md border px-2.5 py-2 ${
                disabled || locked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
              } ${checked ? 'border-ring bg-primary/10' : 'border-border bg-card hover:bg-muted'} ${
                isPage ? '' : 'ms-5'
              }`}
            >
              <Checkbox
                id={id}
                checked={checked}
                disabled={disabled || locked}
                onCheckedChange={() => onToggle(p.key)}
                className="mt-0.5 shrink-0"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold leading-tight text-foreground">
                    {p.label}
                  </span>
                  {isPage && (
                    <span className="shrink-0 rounded border border-primary/20 bg-primary/10 px-1.5 text-[9px] font-semibold uppercase tracking-wide text-link">
                      {t('rbac.menuChip')}
                    </span>
                  )}
                </span>
                {locked && (
                  <span className="block text-[10px] text-muted-foreground">
                    {t('rbac.notGrantable')}
                  </span>
                )}
                {showCodes && (
                  <span className="block truncate font-mono text-[10px] text-muted-foreground">
                    {p.key}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
