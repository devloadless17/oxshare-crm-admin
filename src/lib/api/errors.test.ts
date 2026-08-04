import { describe, expect, it } from 'vitest';
import { apiErrorMessage, apiErrorRequestId } from './errors';

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
