import { apiClient } from './client';

/**
 * Table exports — the one place a file is downloaded from the API.
 *
 * ## Why this is not just another `adminApi` method
 *
 * Every other method in `admin.ts` returns parsed JSON. An export returns a
 * FILE, and that changes three things at once: the response type, the error
 * handling, and what "success" means. Keeping it separate stops those three
 * exceptions from being copied into methods that do not need them.
 *
 * ## The resources, and why they are a closed union
 *
 * `ExportResource` is not `string`. The export endpoints are per-resource and
 * permission-gated on the backend, so a typo in a call site would produce a 404
 * that looks exactly like "the backend has not built this yet" — the one error
 * this app treats as somebody else's to-do rather than its own bug. A union
 * makes that a compile error instead.
 *
 * ## Contract expected of the backend
 *
 *   GET /admin/<resource>/export?format=csv&<the list screen's own filters>
 *
 * The filters are deliberately the SAME query parameters the list endpoint
 * takes, so "export what I am looking at" is `new URLSearchParams` reused
 * rather than a second, drifting filter language. The response is a file body
 * with `Content-Disposition: attachment; filename=…`.
 *
 * NONE OF THESE ENDPOINTS EXIST YET. `useExport` surfaces a 404 as its own
 * state (`unavailable`) and the export button renders as unavailable rather
 * than broken — the same rule `BackendPending` follows for whole screens.
 */
export type ExportResource =
  | 'clients'
  | 'withdrawals'
  | 'kyc'
  | 'audit-log'
  | 'currencies'
  | 'tags'
  | 'payment-methods'
  | 'ib/applications'
  | 'ib/partners'
  | 'admin-users'
  | 'roles';

export type ExportFormat = 'csv' | 'xlsx';

export interface ExportResult {
  blob: Blob;
  filename: string;
}

/**
 * Filename from the response, falling back to one we construct.
 *
 * The server's name is preferred because only the server knows what it put in
 * the file — a filtered export named `clients.csv` is indistinguishable from a
 * full one once it is sitting in a downloads folder.
 *
 * The fallback carries a date for the same reason. It is taken from the
 * response's own `Date` header when present rather than the client clock: an
 * operator whose machine is a day out would otherwise file the export under the
 * wrong day, and these are audit artefacts.
 */
function filenameFrom(
  headers: Record<string, unknown>,
  resource: ExportResource,
  format: ExportFormat,
): string {
  const disposition = headers['content-disposition'];

  if (typeof disposition === 'string') {
    /*
     * RFC 5987 `filename*=UTF-8''…` first, then plain `filename=`.
     *
     * The extended form is the one that survives non-ASCII, and a server that
     * sends both sends the plain one as a mangled fallback for ancient
     * clients — so reading `filename=` first would pick the worse of the two.
     */
    const extended = /filename\*=UTF-8''([^;\n]+)/i.exec(disposition);
    if (extended?.[1]) {
      try {
        return decodeURIComponent(extended[1]);
      } catch {
        // A malformed percent-escape is not worth failing a download over.
      }
    }

    const plain = /filename="?([^";\n]+)"?/i.exec(disposition);
    if (plain?.[1]) return plain[1].trim();
  }

  const served = headers['date'];
  const when = typeof served === 'string' ? new Date(served) : new Date();
  const stamp = Number.isNaN(when.getTime())
    ? new Date().toISOString().slice(0, 10)
    : when.toISOString().slice(0, 10);

  // `ib/applications` would otherwise produce a filename with a path separator.
  return `${resource.replace(/\//g, '-')}-${stamp}.${format}`;
}

/**
 * An error body that arrived as a Blob, turned back into an axios-shaped error.
 *
 * `responseType: 'blob'` applies to EVERY response, including the 403 and the
 * 500 — so axios never parses the JSON error envelope, and `apiErrorMessage`
 * reaches through `response.data.message` to find a Blob and reports the
 * fallback. Every failed export would say "Could not export", discarding the
 * API's own explanation, which on a permission-gated back office is the part
 * the operator needs.
 *
 * This reads the blob back, and if it is JSON, puts the parsed envelope where
 * the rest of the app already looks for it.
 */
async function rehydrateBlobError(error: unknown): Promise<unknown> {
  const response = (error as { response?: { data?: unknown } })?.response;
  if (!(response?.data instanceof Blob)) return error;

  try {
    const text = await response.data.text();
    response.data = JSON.parse(text) as unknown;
  } catch {
    // Not JSON — a proxy's HTML error page, say. Leave the error alone rather
    // than replacing a Blob with a misleading half-parse.
  }

  return error;
}

/**
 * Fetch an export as a blob. Does not touch the DOM — see `saveBlob`.
 *
 * Split from the download so the fetch can be tested without a document, and
 * so a caller that wants to do something else with the bytes is not forced
 * through an anchor click.
 */
export async function fetchExport(
  resource: ExportResource,
  format: ExportFormat = 'csv',
  filters?: URLSearchParams,
  signal?: AbortSignal,
): Promise<ExportResult> {
  const query = new URLSearchParams(filters);
  query.set('format', format);

  /*
   * Paging parameters are stripped. They belong to the screen, not to the
   * export: sending the list's `cursor`/`page`/`limit` through would produce a
   * file containing the twenty-five rows on display while the button says it
   * exports everything matching the filters.
   */
  for (const key of ['cursor', 'page', 'limit', 'pageSize', 'offset']) query.delete(key);

  try {
    const response = await apiClient.get<Blob>(`/admin/${resource}/export?${query.toString()}`, {
      responseType: 'blob',
      signal,
    });

    return {
      blob: response.data,
      filename: filenameFrom(response.headers ?? {}, resource, format),
    };
  } catch (error) {
    throw await rehydrateBlobError(error);
  }
}

/**
 * Hand a blob to the browser as a download.
 *
 * `revokeObjectURL` is not optional housekeeping: an un-revoked object URL pins
 * the whole blob in memory for the lifetime of the document, and an operator
 * exporting a large client list repeatedly would accumulate every copy.
 *
 * The revoke is deferred rather than immediate — Safari has historically
 * cancelled the download if the URL is revoked in the same task as the click.
 */
export function saveBlob({ blob, filename }: ExportResult): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';

  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Fetch and save in one step — what every export button calls. */
export async function downloadExport(
  resource: ExportResource,
  format: ExportFormat = 'csv',
  filters?: URLSearchParams,
  signal?: AbortSignal,
): Promise<void> {
  saveBlob(await fetchExport(resource, format, filters, signal));
}
