import { describe, expect, it } from 'vitest';
import {
  CLIENT_SORT_KEYS,
  KYC_SORT_KEYS,
  WITHDRAWAL_SORT_KEYS,
  clientListSearchParams,
  type ClientListParams,
} from './admin';

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

  /*
   * `page` and `withTotal` are asserted because the loop that copies the
   * filters tests `typeof value === 'string'` — so both of these, being a
   * number and a boolean, were silently dropped when they were first added.
   * A page parameter that vanishes on the way out looks exactly like a pager
   * that does not work, and nothing else in the stack would have caught it.
   */
  it('sends the page number', () => {
    expect(clientListSearchParams(params({ page: 7 })).get('page')).toBe('7');
  });

  it('omits the page when none is given', () => {
    expect(clientListSearchParams(params()).has('page')).toBe(false);
  });

  it('asks for the total, which numbered pages cannot be drawn without', () => {
    // `ClientListResponseDto.total` is OPTIONAL — the endpoint counts only when
    // asked, because counting ~219,000 rows is a full scan. A pager handed no
    // total draws one page and hides the rest of the list.
    expect(clientListSearchParams(params({ withTotal: true })).get('withTotal')).toBe('true');
  });

  it('omits withTotal when it is false rather than sending the string "false"', () => {
    // `?withTotal=false` is a truthy string on the wire. Sending it would ask
    // for exactly the full scan the flag exists to make opt-in.
    expect(clientListSearchParams(params({ withTotal: false })).has('withTotal')).toBe(false);
  });
});

describe('CLIENT_SORT_KEYS', () => {
  it('matches the backend allowlist exactly', () => {
    /*
     * ⚠️ THIS TEST USED TO CONTAIN THE BUG IT EXISTS TO CATCH.
     *
     * Its expected list was a LITERAL, and that literal included `'type'` —
     * which `CLIENT_SORT_COLUMNS` has never contained. So the guard passed
     * happily while the console offered a sortable "Type" header, and the
     * operator's click returned R-2.5's 400 and replaced the whole client
     * directory with an error card. Reported from the running app.
     *
     * The header above it claimed the pair was "kept in step by
     * `client-list-indexes.spec.ts` on the other side". That backend test
     * DERIVES its cases from `CLIENT_SORT_COLUMNS`, so it was right all along;
     * this one restated a hand-written list from memory, and a test that
     * restates a list cannot detect that the list is wrong.
     *
     * The real guard is now a TYPE: `CLIENT_SORT_KEYS` is
     * `satisfies readonly SortKeysOf<'AdminClientsController_listClients'>[]`,
     * read off the generated OpenAPI contract, so an offered key the API
     * refuses no longer compiles. What is left worth asserting at runtime is
     * the thing a type cannot say — that the list is not empty, and that the
     * specific key which shipped broken is gone.
     */
    expect(CLIENT_SORT_KEYS.length).toBeGreaterThan(0);
    expect([...CLIENT_SORT_KEYS], 'the sort that took the client list down').not.toContain('type');
    // Every key it does offer is one a column is allowed to claim.
    expect([...CLIENT_SORT_KEYS].sort()).toEqual([
      'country',
      'createdAt',
      'email',
      'firstName',
      'status',
      'verificationLevel',
    ]);
  });
});

/*
 * The same assertion for the other two lists that have one, and for the same
 * reason: these are hand-kept mirrors of backend constants, and a key the
 * backend does not recognise is a 400 rather than a fallback (R-2.5). A header
 * that claims to sort and instead produces an error page is the failure mode
 * these three tests exist to catch at build time.
 *
 * Only clients, withdrawals and KYC appear here because they are the only admin
 * list endpoints that accept `sort`/`order` at all. Audit-log, ib/applications,
 * ib/partners, admin-users and roles each hardcode their ordering — so they
 * have no allowlist to mirror, and every column on those screens is explicitly
 * `sortable: false`.
 */
describe('WITHDRAWAL_SORT_KEYS', () => {
  it('matches the backend WITHDRAWAL_SORT_COLUMNS exactly', () => {
    expect([...WITHDRAWAL_SORT_KEYS].sort()).toEqual([
      'amount',
      'createdAt',
      'state',
      'userEmail',
      'userFirstName',
    ]);
  });

  it('has no destination key, which the queue must therefore not offer', () => {
    // The destination column declared `sortKey: 'destination'` while sorting
    // client-side. Pointed at the server it would be a 400.
    expect([...WITHDRAWAL_SORT_KEYS]).not.toContain('destination');
  });
});

describe('KYC_SORT_KEYS', () => {
  it('matches the backend KYC_SORT_COLUMNS exactly', () => {
    expect([...KYC_SORT_KEYS].sort()).toEqual([
      'createdAt',
      'status',
      'submittedAt',
      'userEmail',
      'userFirstName',
    ]);
  });

  it('has neither userId nor country, which the review queue used to claim', () => {
    // `country` lives in a JSON blob rather than a column, so there is nothing
    // to order by; `userId` is an opaque UUID nobody sorts a queue on.
    expect([...KYC_SORT_KEYS]).not.toContain('userId');
    expect([...KYC_SORT_KEYS]).not.toContain('country');
  });
});
