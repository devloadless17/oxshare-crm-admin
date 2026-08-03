/**
 * Message from an API error, falling back to a caller-supplied default.
 *
 * TWIN FILE — an identical copy lives at the same path in oxshare-crm-client.
 * Behaviour changes belong in both.
 *
 * This used to live in hooks/use-resource.ts, which mixed a fetch primitive with
 * an error formatter, and that copy silently dropped `error.message` — so a
 * network failure with no HTTP response rendered as the generic fallback. The
 * portal's version had the fallback; this is that version.
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  const response = (error as { response?: { data?: { message?: string | string[] } } })?.response;
  const message = response?.data?.message ?? (error as { message?: string })?.message ?? fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}
