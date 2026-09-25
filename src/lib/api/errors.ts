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
  const text = Array.isArray(message) ? message.join(', ') : message;
  /*
   * A BLANK message is an absence, not an answer.
   *
   * `??` only falls through on null/undefined, so an empty string — or an array
   * that joins to nothing — counted as a message and beat the fallback. The
   * caller then rendered `role="alert"` containing no text: an alert that
   * announces nothing, which to a screen reader is worse than the generic
   * sentence it replaced, and on screen is an empty red line.
   *
   * Same class as the rest of this session's findings: a value carrying no
   * information being treated as a definite one.
   */
  return text.trim() === '' ? fallback : text;
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

/**
 * The machine-readable cause of an API error — R-2.2.
 *
 * `ErrorResponseDto` is now published in the OpenAPI document, so this reads a
 * GENERATED type rather than a hand-written picture of the envelope (R-1.1).
 *
 * Branch on this, never on `message`. The portal decided whether to offer
 * "resend verification" with `message.includes('verify your email')`, which
 * breaks the moment the wording changes and again on the day Arabic ships —
 * FSD §10 / D-16. A client should never have to read prose to make a decision.
 */
export function apiErrorCode(error: unknown): string | undefined {
  const code = (error as { response?: { data?: { code?: unknown } } })?.response?.data?.code;
  return typeof code === 'string' && code.length > 0 ? code : undefined;
}

/**
 * The API's per-field messages — `{ dateOfBirth: 'You must be at least 18…' }`.
 *
 * One shape whichever layer found the problem: the request validator
 * (`common/validation.config.ts`) and a service rule (`FieldValidationError`,
 * `ProfileLockedError`) both answer with a `fields` map keyed by the field's
 * name, so a form marks the right box instead of printing one sentence above
 * all of them. Anything that is not a string-to-string map reads as none.
 */
export function apiFieldErrors(error: unknown): Record<string, string> {
  const fields = (error as { response?: { data?: { fields?: unknown } } })?.response?.data?.fields;
  if (fields === null || typeof fields !== 'object' || Array.isArray(fields)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields as Record<string, unknown>)) {
    if (typeof value === 'string' && value.trim() !== '') out[key] = value;
  }
  return out;
}

/** True when the API refused because the caller's email is unverified. */
export function isEmailUnverified(error: unknown): boolean {
  return apiErrorCode(error) === 'EMAIL_NOT_VERIFIED';
}
