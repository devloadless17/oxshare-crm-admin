import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `GET /admin/ib/partners/:id` answers a client who is NOT a partner with 200
 * and an EMPTY body, which axios hands back as `''`. `getPartnerDetail` is
 * typed `IbPartnerDetail | null`, so it must turn that into `null`: kept as
 * `''`, a caller checking `partner === null` read every individual as a
 * partner and hid "Record referring partner" on their Network tab (13 Oct
 * 2026). The page tests mock this function and return `null` themselves, so
 * only a test at the transport can see it.
 */
const get = vi.hoisted(() => vi.fn());

vi.mock('./client', () => ({
  apiClient: { get },
  idempotent: vi.fn(),
}));

const { adminApi } = await import('./admin');

beforeEach(() => {
  get.mockReset();
});

describe('getPartnerDetail', () => {
  it('reads an empty body as "not a partner" — null, never an empty string', async () => {
    get.mockResolvedValue({ data: '' });
    expect(await adminApi.getPartnerDetail(1000245)).toBeNull();
  });

  it('passes a partner through', async () => {
    const partner = { userId: 1000245, level: 1 };
    get.mockResolvedValue({ data: partner });
    expect(await adminApi.getPartnerDetail(1000245)).toEqual(partner);
  });
});
