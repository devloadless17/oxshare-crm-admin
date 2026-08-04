// TWIN FILE — an identical copy lives at the same path in oxshare-crm-client.
// Behaviour changes belong in BOTH. Anything app-specific (cookie names,
// token lifetimes, redirect paths, endpoint patterns) goes in the config block
// at the top of the file, never inline — that is what keeps a diff between the
// two copies a signal rather than noise.

/**
 * Message from an API error, falling back to a caller-supplied default.
 *
 * Six auth pages each had this same `catch (err: any)` block inline, reaching
 * through `err.response.data.message` with no type at all. `any` there is not a
 * shortcut — it silences the compiler on the one value in the function whose
 * shape is genuinely unknown.
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  const response = (error as { response?: { data?: { message?: string | string[] } } })?.response;
  const message = response?.data?.message ?? (error as { message?: string })?.message ?? fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}

/**
 * The correlation id for a failed request, if the API returned one.
 *
 * PLATFORM-CONVENTIONS R-6.1. Every request carries an `X-Request-Id` generated
 * by `client.ts`; the API adopts it, stamps it on every log line it writes, and
 * returns it in the error envelope as `requestId`. Surfacing it next to an error
 * message is what turns "it failed" into a support ticket someone can actually
 * grep for — the backend's own 500 message asks the user to quote it.
 *
 * Reads the response header as well as the body, because a 502 from a proxy in
 * front of the API never reaches the exception filter and so has no body at all.
 */
export function apiErrorRequestId(error: unknown): string | undefined {
  const response = (
    error as {
      response?: {
        data?: { requestId?: unknown };
        headers?: Record<string, unknown>;
      };
    }
  )?.response;

  const fromBody = response?.data?.requestId;
  if (typeof fromBody === 'string' && fromBody.length > 0) return fromBody;

  const fromHeader = response?.headers?.['x-request-id'];
  return typeof fromHeader === 'string' && fromHeader.length > 0 ? fromHeader : undefined;
}
