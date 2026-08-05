import { describe, expect, it } from 'vitest';
import { apiErrorCode, apiErrorMessage, apiErrorRequestId, isEmailUnverified } from './errors';

/**
 * TWIN FILE — an identical copy lives at the same path in the sibling app.
 *
 * The `error.message` case is the one that matters: the admin app's old inline
 * copy omitted it, so a network failure with no HTTP response silently rendered
 * as the generic fallback instead of the real reason.
 */
describe('apiErrorMessage', () => {
  it('prefers the API error body', () => {
    const err = { response: { data: { message: 'Insufficient available balance.' } } };
    expect(apiErrorMessage(err, 'fallback')).toBe('Insufficient available balance.');
  });

  it('joins a class-validator message array', () => {
    const err = {
      response: { data: { message: ['step should not be empty', 'data must be an object'] } },
    };
    expect(apiErrorMessage(err, 'fallback')).toBe(
      'step should not be empty, data must be an object',
    );
  });

  it('falls back to error.message when there is no HTTP response', () => {
    expect(apiErrorMessage(new Error('Network Error'), 'fallback')).toBe('Network Error');
  });

  it('uses the caller fallback when nothing else is available', () => {
    expect(apiErrorMessage({}, 'Could not load withdrawals.')).toBe('Could not load withdrawals.');
    expect(apiErrorMessage(null, 'Could not load withdrawals.')).toBe(
      'Could not load withdrawals.',
    );
  });

  it('prefers the body over error.message when both exist', () => {
    const err = Object.assign(new Error('Request failed with status code 400'), {
      response: { data: { message: 'Amount exceeds available balance.' } },
    });
    expect(apiErrorMessage(err, 'fallback')).toBe('Amount exceeds available balance.');
  });
});

/**
 * PLATFORM-CONVENTIONS R-6.1 — the correlation id has to survive all the way to
 * something a user can quote, or generating it was pointless.
 */
describe('apiErrorRequestId', () => {
  it('reads the id from the API error envelope', () => {
    const err = { response: { data: { requestId: '0f3c9a12-1c4e-4a77-9a4f-2b7f0c1d5e88' } } };
    expect(apiErrorRequestId(err)).toBe('0f3c9a12-1c4e-4a77-9a4f-2b7f0c1d5e88');
  });

  it('falls back to the response header when there is no envelope', () => {
    // A 502 from a proxy in front of the API never reaches the exception filter,
    // so it has no body at all — but the header still round-trips.
    const err = { response: { headers: { 'x-request-id': 'req-abc123' } } };
    expect(apiErrorRequestId(err)).toBe('req-abc123');
  });

  it('returns undefined rather than a placeholder when there is no id', () => {
    // An error UI must be able to omit the line entirely; a string like
    // "undefined" rendered next to "contact support" is worse than nothing.
    expect(apiErrorRequestId(new Error('Network Error'))).toBeUndefined();
    expect(apiErrorRequestId({ response: { data: {} } })).toBeUndefined();
    expect(apiErrorRequestId({ response: { data: { requestId: '' } } })).toBeUndefined();
    expect(apiErrorRequestId(null)).toBeUndefined();
  });

  it('ignores a non-string id rather than rendering an object', () => {
    expect(apiErrorRequestId({ response: { data: { requestId: { id: 1 } } } })).toBeUndefined();
  });
});

/**
 * `code`, not prose — R-2.2.
 *
 * The envelope always carried a machine-readable `code`; nothing consumed it,
 * because it was not in the OpenAPI document and so not in the generated types.
 * The portal branched on `message.includes('verify your email')` instead, which
 * holds only while the copy stays exactly as written and in English — so it
 * would have stopped working the day Arabic shipped (FSD §10, D-16).
 */
describe('apiErrorCode', () => {
  it('reads the code from the envelope', () => {
    expect(apiErrorCode({ response: { data: { code: 'EMAIL_NOT_VERIFIED' } } })).toBe(
      'EMAIL_NOT_VERIFIED',
    );
  });

  it('is undefined when there is no code to read', () => {
    // A 502 from a proxy never reaches the exception filter and has no body.
    expect(apiErrorCode({ response: {} })).toBeUndefined();
    expect(apiErrorCode(new Error('network'))).toBeUndefined();
    expect(apiErrorCode(undefined)).toBeUndefined();
    expect(apiErrorCode({ response: { data: { code: '' } } })).toBeUndefined();
  });

  it('identifies an unverified email without reading the message', () => {
    const err = {
      response: {
        data: {
          code: 'EMAIL_NOT_VERIFIED',
          // Deliberately NOT English: the whole point is that the decision does
          // not depend on the prose.
          message: 'يرجى التحقق من عنوان بريدك الإلكتروني',
        },
      },
    };
    expect(isEmailUnverified(err)).toBe(true);
  });

  it('does not mistake another 403 for an unverified email', () => {
    expect(isEmailUnverified({ response: { data: { code: 'FORBIDDEN' } } })).toBe(false);
  });
});
