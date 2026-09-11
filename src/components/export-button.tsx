'use client';

import * as React from 'react';
import { Download, FileSpreadsheet, FileText, ServerOff } from 'lucide-react';
import { downloadExport, type ExportFormat, type ExportResource } from '@/lib/api/export';
import { apiErrorMessage } from '@/lib/api/errors';
import { httpStatusOf } from '@/hooks/use-resource';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { t } from '@/lib/i18n';

/**
 * The export control, on every table that has one.
 *
 * ## It exports the FILTERS, not the page
 *
 * `filters` is the same `URLSearchParams` the screen builds for its list query,
 * minus paging (stripped in `fetchExport`). That is the whole reason the export
 * is a server call rather than a client-side serialisation of the rows in
 * memory: the rows in memory are one page, and an export that quietly contained
 * twenty-five of four thousand rows is the kind of thing discovered during an
 * audit rather than here. The menu says so, in `export.scopeNote`.
 *
 * ## A missing endpoint is a distinct state
 *
 * A 404 means "not built" rather than "broken", exactly as `useResource` treats
 * it for whole screens — so the button says so and stops offering itself,
 * instead of showing a red failure that invites the operator to retry forever.
 * Every other status keeps the API's own message: on a permission-gated back
 * office, "you do not have permission to export clients" is the useful half of
 * a 403.
 *
 * ⚠️ This paragraph opened with "None of the `/export` routes exist on the
 * backend yet" until 11 Sep 2026, long after they all shipped — and
 * `lib/api/export.ts` had already corrected itself ("EVERY ONE OF THESE NOW
 * EXISTS"), so the two files beside each other said opposite things. A reader
 * of this one concluded the whole export surface was somebody else's to-do.
 *
 * The button is NOT hidden pre-emptively while an endpoint is missing. Hiding
 * it would mean nobody notices the day it starts working, and the endpoint list
 * would drift out of the UI the way `BackendPending` exists to prevent. That
 * rule is worth stating in the other direction too, because that is the way it
 * actually failed: `/admin/audit-log/export` was served, permission-gated and
 * covered by an e2e spec for months while NO SCREEN RENDERED THIS BUTTON for
 * it. Drift does not need a missing endpoint — a missing call site is enough.
 */
export function ExportButton({
  resource,
  filters,
  /*
   * CSV ONLY, deliberately.
   *
   * The default used to be `['csv', 'xlsx']`, which put an "Export as Excel"
   * item in every one of these menus. The backend supports no such thing: no
   * spreadsheet library is installed, and `format=xlsx` is answered with a 400
   * naming csv as the supported value (R-2.5 — never a silent substitution).
   *
   * So the menu offered an option that could only ever fail. Removing it is the
   * honest fix; adding xlsx to the API is the other one, and it is a real
   * decision (a dependency, and a second serialiser to keep in step with the
   * CSV columns) rather than something to slip in behind a menu item.
   *
   * With one format the component renders a plain button rather than a
   * dropdown — see `single` below — so there is no menu of one.
   */
  formats = ['csv'],
  disabled = false,
  label,
}: {
  resource: ExportResource;
  /** The list screen's own filter params. Paging keys are stripped. */
  filters?: URLSearchParams;
  /**
   * Offered formats. Pass a single-entry array for a plain button.
   *
   * Typed as non-empty, so "an export button offering no formats" — a control
   * that could only ever do nothing — cannot be constructed.
   *
   * Only `csv` is served today; see the default above before passing `xlsx`.
   */
  formats?: [ExportFormat, ...ExportFormat[]];
  /** Set when there is provably nothing to export, e.g. an empty result. */
  disabled?: boolean;
  label?: string;
}) {
  const [busy, setBusy] = React.useState(false);
  const [unavailable, setUnavailable] = React.useState(false);

  /*
   * The filters as a string, so identity changes do not read as changes. Most
   * callers build a fresh `URLSearchParams` every render, and comparing the
   * objects would say "the filters changed" on every single one.
   */
  const filterKey = filters?.toString() ?? '';

  /*
   * The failure REMEMBERS which filters produced it, rather than being cleared
   * by an effect when they change.
   *
   * A changed filter set is a different export, so a stale message must not sit
   * under a button that would now behave. Doing that with `useEffect` +
   * `setError(null)` costs a second render pass on every filter keystroke, and
   * for one frame the old error is still on screen under the new filters. Here
   * staleness is derived during render, so it is simply never displayed —
   * `react-hooks/set-state-in-effect` is pointing at a real bug, not a style
   * preference.
   */
  const [failure, setFailure] = React.useState<{ message: string; forFilters: string } | null>(
    null,
  );
  const error = failure && failure.forFilters === filterKey ? failure.message : null;

  const run = async (format: ExportFormat) => {
    setBusy(true);
    setFailure(null);

    try {
      await downloadExport(resource, format, filters);
    } catch (err) {
      if (httpStatusOf(err) === 404) {
        setUnavailable(true);
      } else {
        setFailure({
          message: apiErrorMessage(err, t('export.failed')),
          // The filters as they were when the export was STARTED. Reading
          // `filterKey` here would capture whatever they are now, which after
          // an await is not necessarily the same thing.
          forFilters: filterKey,
        });
      }
    } finally {
      setBusy(false);
    }
  };

  if (unavailable) {
    return (
      <span
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-dashed border-border px-3 text-xs font-medium text-muted-foreground"
        title={`GET /admin/${resource}/export`}
      >
        <ServerOff className="h-3.5 w-3.5" aria-hidden="true" />
        {t('export.unavailable')}
      </span>
    );
  }

  const single = formats.length === 1;

  return (
    <div className="flex flex-col items-end gap-1">
      {single ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9"
          loading={busy}
          disabled={disabled}
          onClick={() => void run(formats[0])}
          /*
           * The scope note follows the control.
           *
           * It lived in the dropdown, which a single-format export no longer
           * renders — so the one sentence answering "did I get the page or
           * everything?" would have disappeared with the menu. A `title` is a
           * weaker home than a menu label, but a weaker home is not the same as
           * none, and this is the claim an operator checks after clicking.
           */
          title={t('export.scopeNote')}
        >
          {!busy && <Download className="h-3.5 w-3.5" aria-hidden="true" />}
          {busy ? t('export.exporting') : (label ?? t('export.button'))}
        </Button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9"
              loading={busy}
              disabled={disabled}
            >
              {!busy && <Download className="h-3.5 w-3.5" aria-hidden="true" />}
              {busy ? t('export.exporting') : (label ?? t('export.button'))}
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-64">
            {formats.includes('csv') && (
              <DropdownMenuItem onSelect={() => void run('csv')}>
                <FileText aria-hidden="true" />
                <span>{t('export.csv')}</span>
              </DropdownMenuItem>
            )}
            {formats.includes('xlsx') && (
              <DropdownMenuItem onSelect={() => void run('xlsx')}>
                <FileSpreadsheet aria-hidden="true" />
                <span>{t('export.xlsx')}</span>
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />

            {/* Not a DropdownMenuItem: it is not actionable, and as an item it
                would take keyboard focus on the way to the formats. */}
            <DropdownMenuLabel className="text-[11px] font-normal leading-relaxed text-muted-foreground whitespace-normal">
              {t('export.scopeNote')}
            </DropdownMenuLabel>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {error && (
        <p role="alert" className="max-w-xs text-end text-[11px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
