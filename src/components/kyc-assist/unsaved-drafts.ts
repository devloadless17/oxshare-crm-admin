/**
 * Unsaved answers on "Complete KYC", kept IN MEMORY while the console is open.
 *
 * The leave guard (`use-unsaved-guard.ts`) asks before a link or a closing tab
 * throws typing away. The browser's Back button it cannot ask about: in this
 * router that is a page change the console hears of only afterwards. So the
 * answers wait here instead, and the page offers them back on return.
 *
 * Memory, never storage: they are a client's personal details. They die with
 * the tab and with signing out (a full page load), so there is nothing to
 * expire and nothing on disk. Kept per ADMINISTRATOR as well as per client: a
 * colleague signing in on the same machine never sees answers typed in another
 * session, nor a detail their own role hides.
 */

/** Unsaved answers, by step slug then question name. */
export type Drafts = Record<string, Record<string, string>>;

const kept = new Map<string, Drafts>();

const keyOf = (adminId: string, clientId: string) => `${adminId}:${clientId}`;

/** The answers this administrator left unsaved on this client's page, if any. */
export function keptDrafts(adminId: string, clientId: string): Drafts | undefined {
  return kept.get(keyOf(adminId, clientId));
}

/** Remembers the unsaved answers; with none left, forgets them. */
export function keepDrafts(adminId: string, clientId: string, drafts: Drafts): void {
  const changed = Object.fromEntries(
    Object.entries(drafts).filter(([, answers]) => Object.keys(answers).length > 0),
  );
  if (Object.keys(changed).length === 0) kept.delete(keyOf(adminId, clientId));
  else kept.set(keyOf(adminId, clientId), changed);
}
