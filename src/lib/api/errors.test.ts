import { describe, expect, it } from 'vitest';
import { apiErrorMessage } from './errors';

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
