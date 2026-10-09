import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  walletListSearchParams,
  tradingAccountListSearchParams,
  type WalletListParams,
  type TradingAccountListParams,
} from './admin';

/**
 * EVERY FILTER A LIST ACCEPTS REACHES THE QUERY STRING.
 *
 * ## The production defect this exists to stop repeating
 *
 * The owner reported that search did nothing on `/wallets` and
 * `/trading-accounts`. The pages were right, the backend was right, and the
 * request went out with no `q` at all: both builders are ALLOWLISTS, and the
 * line copying `q` into the query string was never written.
 *
 * Three mechanisms that should have caught it did not, and each for its own
 * reason — which is why this file asserts on the QUERY STRING and nothing else:
 *
 *   the COMPILER  `params` is a variable at the call site rather than an object
 *                 literal, so TypeScript's excess-property check never runs. The
 *                 page passed `q`, the type did not declare it, and it compiled.
 *   the PAGE TEST it mocks `api.admin.getWallets` and asserts the params OBJECT
 *                 — the page's intent, not the request. It passed throughout.
 *   the BACKEND   Nest ignores a query parameter no handler declares, so an
 *                 unfiltered answer is indistinguishable from a working filter.
 *                 No error, no warning, no 400.
 *
 * The lesson is the one the query-key registry already records in this repo:
 * **a silent no-op is worse than a failure**, and the only defence is to assert
 * the thing that actually travels.
 */

const wallet = (over: Partial<WalletListParams> = {}): WalletListParams => ({ limit: 25, ...over });
const account = (over: Partial<TradingAccountListParams> = {}): TradingAccountListParams => ({
  limit: 25,
  ...over,
});

describe('walletListSearchParams', () => {
  it('sends the CLIENT SEARCH — the parameter that was missing in production', () => {
    expect(walletListSearchParams(wallet({ q: 'alexandra' })).get('q')).toBe('alexandra');
  });

  it('sends every other filter it accepts', () => {
    const query = walletListSearchParams(
      wallet({ page: 3, userId: 'u-1', currency: 'USD', sort: 'balance', order: 'asc' }),
    );
    expect(query.get('page')).toBe('3');
    expect(query.get('userId')).toBe('u-1');
    expect(query.get('currency')).toBe('USD');
    expect(query.get('sort')).toBe('balance');
    expect(query.get('order')).toBe('asc');
    expect(query.get('limit')).toBe('25');
  });

  it('sends the cursor and the direction — Previous / Last would otherwise go nowhere', () => {
    const query = walletListSearchParams(wallet({ cursor: 'abc', dir: 'prev' }));
    expect(query.get('cursor')).toBe('abc');
    expect(query.get('dir')).toBe('prev');
  });

  it('OMITS an empty filter rather than sending it blank', () => {
    // `?q=` reaches the API as an empty string, and a present-but-empty filter
    // is a different request from an absent one.
    const query = walletListSearchParams(wallet({ q: '', userId: '', currency: '' }));
    expect(query.has('q')).toBe(false);
    expect(query.has('userId')).toBe(false);
    expect(query.has('currency')).toBe(false);
  });

  it('sends `order` only with the `sort` it orders', () => {
    // `order` alone describes an ordering of no column, and the API is entitled
    // to reject it.
    const query = walletListSearchParams(wallet({ order: 'asc' }));
    expect(query.has('order')).toBe(false);
  });
});

describe('tradingAccountListSearchParams', () => {
  it('sends the CLIENT SEARCH — the second screen with the same defect', () => {
    expect(tradingAccountListSearchParams(account({ q: 'alexandra' })).get('q')).toBe('alexandra');
  });

  it('sends every other filter it accepts', () => {
    const query = tradingAccountListSearchParams(
      account({
        page: 2,
        userId: 'u-1',
        environment: 'live',
        status: 'active',
        sort: 'balance',
        order: 'desc',
      }),
    );
    expect(query.get('page')).toBe('2');
    expect(query.get('userId')).toBe('u-1');
    expect(query.get('environment')).toBe('live');
    expect(query.get('status')).toBe('active');
    expect(query.get('sort')).toBe('balance');
    expect(query.get('order')).toBe('desc');
  });

  it('OMITS an empty filter rather than sending it blank', () => {
    const query = tradingAccountListSearchParams(account({ q: '', userId: '' }));
    expect(query.has('q')).toBe(false);
    expect(query.has('userId')).toBe(false);
  });
});

/**
 * THE GENERAL FORM, so the next filter cannot be forgotten the same way.
 *
 * The two cases above are about `q` because `q` is what broke. This is about the
 * SHAPE: a field declared on a list-params interface that its builder never
 * reads is a control the operator can set and the server will never see. Derived
 * from the source, so a field added tomorrow is covered without anyone editing
 * this file.
 */
describe('no list-params field is accepted and then dropped', () => {
  const source = readFileSync('src/lib/api/admin.ts', 'utf8');

  function fieldsOf(name: string): string[] {
    const match = new RegExp(`interface ${name}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(source);
    expect(match, `${name} is not an interface in admin.ts any more`).toBeTruthy();
    const fields = [...(match?.[1] ?? '').matchAll(/^\s*(\w+)\??:/gm)];
    return fields.map((m) => m[1] ?? '').filter(Boolean);
  }

  function builderBody(name: string): string {
    const at = source.indexOf(`export function ${name}(`);
    expect(at, `${name} is not exported from admin.ts any more`).toBeGreaterThan(-1);
    const start = source.indexOf('{', source.indexOf(')', at));
    let depth = 0;
    for (let i = start; i < source.length; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') {
        depth--;
        if (depth === 0) return source.slice(start, i + 1);
      }
    }
    return source.slice(start);
  }

  it.each([
    ['WalletListParams', 'walletListSearchParams'],
    ['TradingAccountListParams', 'tradingAccountListSearchParams'],
  ])('%s is fully read by %s', (iface, builder) => {
    const fields = fieldsOf(iface);
    // The floor: a regex that stopped matching would pass this vacuously.
    expect(fields.length, `${iface} parsed as empty`).toBeGreaterThan(3);

    const body = builderBody(builder);
    const dropped = fields.filter((f) => !new RegExp(`params\\.${f}\\b`).test(body));
    expect(
      dropped,
      `${builder} never reads ${dropped.join(', ')} — the operator can set it and the ` +
        'server will never see it, exactly as `q` was for a day.',
    ).toEqual([]);
  });
});
