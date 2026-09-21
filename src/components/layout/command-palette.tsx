'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CornerDownLeft, Search } from 'lucide-react';
import { NAV_SECTIONS, type NavItem } from '@/components/layout/admin-layout';
import { useAdmin } from '@/context/AdminAuthContext';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { canAccess } from '@/lib/permissions';
import { t } from '@/lib/i18n';

/**
 * Everywhere this operator can go, searchable, over the whole console.
 *
 * ## What was here before
 *
 * An `input type="search"` in the header with no state, no handler and no
 * results — typing in it did nothing at all. It is the same class of control
 * this header has already been cleared of twice: the hardcoded "System
 * Operational" pill that nothing measured, and the bell with a permanent unread
 * dot and no click handler. A search box that cannot search is worse than none,
 * because an operator who tries it concludes the CONSOLE cannot find things
 * rather than that this one control is decorative.
 *
 * ## It reads the SIDEBAR's own list, and its permission filter
 *
 * `NAV_SECTIONS` is the single record of where you can go and `canAccess` the
 * single answer to whether you may. A palette with its own list would drift,
 * and the drift has a precedent in this very file: `/commissions` was once
 * commented out of the nav and stayed reachable only by typing its URL.
 *
 * So an entry an admin cannot open is not listed. That is not tidiness: the
 * route guard denies it anyway, so offering it would navigate them into a "no
 * access" panel — and a palette that lists denied screens is enumerating what
 * somebody was specifically refused.
 *
 * ## Matching is on the WORDS an operator would type
 *
 * The label, the section and the path, case-insensitively, with EVERY typed
 * term required to match something. Requiring all of them is what makes a
 * second word narrow the list rather than widen it, which is how anyone who has
 * used a palette expects typing more to behave.
 *
 * The section is searched because "approvals" is how somebody looks for a queue
 * whose own name they have forgotten; the path because an operator who knows
 * the URL is usually the one in a hurry.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { admin } = useAdmin();
  const router = useRouter();
  const panelRef = React.useRef<HTMLDivElement>(null);
  const [query, setQuery] = React.useState('');
  const [active, setActive] = React.useState(0);

  useFocusTrap(panelRef, open, onClose);

  /*
   * Flattened once per ADMIN rather than per keystroke: the permission filter
   * is the expensive half and it cannot change while the palette is open.
   */
  const entries = React.useMemo(() => {
    if (!admin) return [];
    return NAV_SECTIONS.flatMap((section) =>
      section.items
        .filter((item) => canAccess(admin, item.href))
        .map((item) => ({ item, section: t(section.title), label: t(item.label) })),
    );
  }, [admin]);

  const results = React.useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return entries;

    return entries.filter((entry) => {
      const haystack = `${entry.label} ${entry.section} ${entry.item.href}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }, [entries, query]);

  /*
   * The highlighted row is an index into a list that SHRINKS as you type, so it
   * is clamped on every render rather than reset in an effect — an effect would
   * render one frame with the stale index pointing past the end of the list.
   */
  const selected = results.length === 0 ? -1 : Math.min(active, results.length - 1);

  const go = React.useCallback(
    (entry: { item: NavItem }) => {
      onClose();
      router.push(entry.item.query ? `${entry.item.href}?${entry.item.query}` : entry.item.href);
    },
    [onClose, router],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[12vh] backdrop-blur-sm"
      /* Only from the backdrop itself: a drag that ends outside the panel must
         not dismiss what the operator is reading. */
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('nav.searchAria')}
        className="flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            /*
             * `text`, NOT `search`. A search input renders the browser clear
             * button, whose Escape behaviour is the browser's: the first Escape
             * empties the field instead of closing the dialog, so an operator
             * presses it twice and the palette feels stuck.
             */
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              /* A new query is a new list; keeping the index would leave the
                 highlight on whatever row lands in that position. */
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((n) => (results.length === 0 ? 0 : (n + 1) % results.length));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((n) =>
                  results.length === 0 ? 0 : (n - 1 + results.length) % results.length,
                );
              } else if (e.key === 'Enter') {
                /*
                 * Read the row BEFORE acting on it. `selected >= 0` is not
                 * enough for the compiler under `noUncheckedIndexedAccess`, and
                 * it is not enough in fact either: the index is clamped against
                 * a list that changed on the same keystroke.
                 */
                const chosen = selected >= 0 ? results[selected] : undefined;
                if (chosen) {
                  e.preventDefault();
                  go(chosen);
                }
              }
              /* Escape belongs to the focus trap, so it closes from anywhere in
                 the panel rather than only from this field. */
            }}
            aria-label={t('nav.searchAria')}
            placeholder={t('nav.searchPlaceholder')}
            className="h-14 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {results.length === 0 ? (
            /* Names what was typed, so it reads as an answer about this query
               rather than as a console that can find nothing. */
            <p className="px-3 py-8 text-center text-xs text-muted-foreground">
              {t('nav.searchNoResults', { query })}
            </p>
          ) : (
            <ul role="listbox" aria-label={t('nav.searchResultsAria')}>
              {results.map((entry, index) => {
                const Icon = entry.item.icon;
                const isActive = index === selected;
                return (
                  <li key={entry.item.href}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => go(entry)}
                      className={`flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-start transition-colors ${
                        isActive ? 'bg-muted text-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-foreground">
                          {entry.label}
                        </span>
                        {/* The SECTION, so two similarly named entries are told
                            apart by where they live. */}
                        <span className="block truncate text-[11px]">{entry.section}</span>
                      </span>
                      {isActive && (
                        <CornerDownLeft className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* The keys, stated. A palette whose shortcuts are undiscoverable is one
            most people drive with the mouse, which is the thing it exists to
            save them from. */}
        <div className="flex items-center gap-4 border-t border-border bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
          <span>{t('nav.searchHintNavigate')}</span>
          <span>{t('nav.searchHintOpen')}</span>
          <span>{t('nav.searchHintClose')}</span>
        </div>
      </div>
    </div>
  );
}
