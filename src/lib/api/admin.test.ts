import { describe, expect, it } from 'vitest';
import { CLIENT_SORT_KEYS, clientListSearchParams, type ClientListParams } from './admin';

/**
 * The client list's query string.
 *
 * Worth its own test because two of its rules are silent when broken: a blank
 * filter reaching the API is a DIFFERENT request from an absent one, and a sort
 * key outside the backend allowlist produces a 400 rather than rows (R-2.5
 * makes an unrecognised sort an error, never a silent fallback).
 */

const params = (over: Partial<ClientListParams> = {}): ClientListParams => ({
  limit: 25,
  ...over,
});

describe('clientListSearchParams', () => {
  it('always sends the limit', () => {
    expect(clientListSearchParams(params()).get('limit')).toBe('25');
  });

  it('OMITS an empty filter rather than sending it blank', () => {
    // `?country=` arrives as an empty string. A filter that is present but
    // blank is one nobody can see and nobody meant — and on an enum parameter
    // it is a 400.
    const query = clientListSearchParams(params({ country: '', q: '', tag: '' }));
    expect(query.has('country')).toBe(false);
    expect(query.has('q')).toBe(false);
    expect(query.has('tag')).toBe(false);
  });

  it('sends the filters that are set', () => {
    const query = clientListSearchParams(
      params({ q: 'alpha', status: 'active', country: 'Lebanon', tag: 'high-risk' }),
    );
    expect(query.get('q')).toBe('alpha');
    expect(query.get('status')).toBe('active');
    expect(query.get('country')).toBe('Lebanon');
    expect(query.get('tag')).toBe('high-risk');
  });

  it('sends both halves of a sort', () => {
    const query = clientListSearchParams(params({ sort: 'email', order: 'asc' }));
    expect(query.get('sort')).toBe('email');
    expect(query.get('order')).toBe('asc');
  });

  it('passes the cursor through opaquely', () => {
    // A cursor is a server-owned token. Parsing or reshaping it here would tie
    // the frontend to a format the API is free to change.
    const cursor = 'eyJzb3J0IjoiY3JlYXRlZEF0In0';
    expect(clientListSearchParams(params({ cursor })).get('cursor')).toBe(cursor);
  });
});

describe('CLIENT_SORT_KEYS', () => {
  it('matches the backend allowlist exactly', () => {
    /*
     * Hand-kept, and the reason it is asserted rather than trusted: the API
     * answers 400 for a sort key it does not recognise, so a column here that
     * the backend dropped turns a header click into an error page instead of a
     * reordered list.
     *
     * Kept in step by `client-list-indexes.spec.ts` on the other side, which
     * derives its cases from `CLIENT_SORT_COLUMNS` and fails when a key has no
     * index. Between the two, a key can only be added deliberately.
     */
    expect([...CLIENT_SORT_KEYS].sort()).toEqual([
      'country',
      'createdAt',
      'email',
      'firstName',
      'status',
      'type',
      'verificationLevel',
    ]);
  });
});
