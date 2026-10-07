import type { PermissionModule } from '@/lib/api/admin';
import { NAV, groupOf, isNavGroup, navLeaves } from '@/components/layout/navigation';

/**
 * THE RULES THE ROLE EDITOR APPLIES WHILE YOU TICK — pure, so they are tested
 * without rendering anything.
 *
 * The backend catalog (one module per console page, Oct 2026 audit) says, for
 * every key, which keys it `requires`: an action needs the page it is taken
 * on. The API closes every save over those requirements, so the editor does the
 * same thing in front of the operator rather than surprising them after Save:
 *
 *   - ticking a key ticks what it requires (approving deposits brings the
 *     Deposits page with it);
 *   - unticking a key unticks everything that requires it, and SAYS which —
 *     turning a page off cannot leave an action behind that has nowhere to run.
 */

type Catalog = Record<string, PermissionModule>;

export const GROUP_ORDER = [
  'clients',
  'introducing-brokers',
  'finance',
  'trading',
  'system',
  'security',
] as const;

function requiresOf(catalog: Catalog): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const mod of Object.values(catalog)) {
    for (const p of mod.permissions) map.set(p.key, p.requires ?? []);
  }
  return map;
}

/** `keys` plus everything they require, transitively — the API's own closure. */
export function withRequirements(catalog: Catalog, keys: readonly string[]): string[] {
  const requires = requiresOf(catalog);
  const out = new Set<string>();
  const visit = (key: string) => {
    if (out.has(key)) return;
    out.add(key);
    for (const r of requires.get(key) ?? []) visit(r);
  };
  keys.forEach(visit);
  return [...out];
}

/** Every key that (transitively) requires `key` — what turning it off takes with it. */
function dependentsOf(catalog: Catalog, key: string): Set<string> {
  const requires = requiresOf(catalog);
  const out = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const [k, needs] of requires) {
      if (out.has(k)) continue;
      if (needs.includes(key) || needs.some((n) => out.has(n))) {
        out.add(k);
        grew = true;
      }
    }
  }
  return out;
}

export interface ToggleResult {
  next: string[];
  /** Keys switched OFF because they required the one turned off. */
  cleared: string[];
}

export function toggleKey(
  catalog: Catalog,
  selected: readonly string[],
  key: string,
): ToggleResult {
  if (!selected.includes(key)) {
    return { next: withRequirements(catalog, [...selected, key]), cleared: [] };
  }
  const dependents = dependentsOf(catalog, key);
  const cleared = selected.filter((k) => dependents.has(k));
  return { next: selected.filter((k) => k !== key && !dependents.has(k)), cleared };
}

/** Turn a set of keys on or off together (select all / clear), with the same rules. */
export function setKeys(
  catalog: Catalog,
  selected: readonly string[],
  keys: readonly string[],
  on: boolean,
): ToggleResult {
  if (on) return { next: withRequirements(catalog, [...selected, ...keys]), cleared: [] };
  const gone = new Set(keys);
  for (const k of keys) for (const d of dependentsOf(catalog, k)) gone.add(d);
  const cleared = selected.filter((k) => gone.has(k) && !keys.includes(k));
  return { next: selected.filter((k) => !gone.has(k)), cleared };
}

/**
 * The catalog's modules grouped as the SIDEBAR groups them, in sidebar order.
 *
 * The section comes from `NAV` — the group holding the route the module's view
 * key `opens` — so moving a page between sidebar groups moves it in the role
 * editor too, with nothing else to edit. The catalog's own `group` is used only
 * for a module whose page is not in the menu (the bridge diagnostics).
 */
export function modulesByGroup(
  catalog: Catalog,
): { group: (typeof GROUP_ORDER)[number]; modules: [string, PermissionModule][] }[] {
  const sectionOf = (mod: PermissionModule): string => {
    for (const p of mod.permissions) {
      for (const route of p.opens ?? []) {
        const group = groupOf(route);
        if (group) return group.id;
      }
    }
    return mod.group;
  };
  const order: string[] = NAV.filter(isNavGroup).map((g) => g.id);
  return order
    .map((group) => ({
      group: group as (typeof GROUP_ORDER)[number],
      modules: Object.entries(catalog)
        .filter(([, mod]) => sectionOf(mod) === group)
        // Within a group, the sidebar's own order.
        .sort(([, a], [, b]) => position(a) - position(b)),
    }))
    .filter((section) => section.modules.length > 0);
}

function position(mod: PermissionModule): number {
  const leaves = navLeaves(NAV).map((leaf) => leaf.href);
  const at = mod.permissions
    .flatMap((p) => p.opens ?? [])
    .map((route) => leaves.indexOf(route))
    .filter((i) => i >= 0);
  return at.length > 0 ? Math.min(...at) : Number.MAX_SAFE_INTEGER;
}

/** A key's label, for messages that name keys ("Also turned off: …"). */
export function labelOf(catalog: Catalog, key: string): string {
  for (const mod of Object.values(catalog)) {
    const found = mod.permissions.find((p) => p.key === key);
    if (found) return found.label;
  }
  return key;
}
