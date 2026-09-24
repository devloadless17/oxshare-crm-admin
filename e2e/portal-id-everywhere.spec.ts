import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { adminApi } from './helpers';

/**
 * A CLIENT IS IDENTIFIED BY PORTAL ID ALONE — on every screen, in every link,
 * in the address bar.
 *
 * The owner's rule (24 Sep 2026): administrators never meet a client's uuid,
 * "as if it was never created". The uuid still keys every row, so it is in
 * the API's payloads — and must never reach a person. Unit tests pin each
 * cell; this walks the running console, because a uuid leaks through the
 * places no cell test looks: a link's href, a filter chip, the URL itself.
 *
 * ## Why every client, and why their EXACT ids
 *
 * The screens legitimately show OTHER uuids (a transaction's id in the audit
 * trail). So the check is not "no uuid-shaped text" but "none of these
 * clients' ids" — every client on the platform, fetched first, so a leak on a
 * screen listing an old client is not missed because only the newest were
 * collected.
 */

const SCREENS = [
  '/dashboard',
  '/clients',
  '/kyc',
  '/transactions',
  '/approvals/deposits',
  '/approvals/ib',
  '/financial',
  '/ledger',
  '/wallets',
  '/trading-accounts',
  '/commissions',
  '/reconciliation',
  '/audit-log',
];

interface ClientRef {
  id: string;
  portalId: number;
}

/** Every client the signed-in admin can see, paged through to the end. */
async function everyClient(page: Page): Promise<ClientRef[]> {
  const admin = await adminApi(page.context());
  const all: ClientRef[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 100; guard += 1) {
    const qs: string = `limit=100&withTotal=false${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const res = await admin.get(`/admin/clients?${qs}`);
    expect(res.ok(), `the client index answered ${res.status()}`).toBe(true);
    const body = (await res.json()) as { items: ClientRef[]; nextCursor: string | null };
    all.push(...body.items.map(({ id, portalId }) => ({ id, portalId })));
    cursor = body.nextCursor;
    if (!cursor) break;
  }
  return all;
}

/**
 * What a person can see of the page: the URL, the text, and where links go.
 *
 * Minus `[data-external-ref]`: a provider's reference is somebody else's
 * identifier, printed exactly as they issued it — the console must not edit
 * it, so its content is not the console naming a client. (The one place a
 * client uuid ever got into one was an e2e fixture building a reference from
 * the client's id; `withdrawals-desk.spec.ts` no longer does.)
 */
async function visibleSurface(page: Page): Promise<string> {
  const seen = await page.evaluate(() => {
    const body = document.body.cloneNode(true) as HTMLElement;
    body.querySelectorAll('[data-external-ref]').forEach((el) => el.remove());
    document.body.appendChild(body);
    body.style.position = 'absolute';
    const text = body.innerText;
    body.remove();
    return {
      url: location.href,
      text,
      links: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href') ?? ''),
    };
  });
  return [seen.url, seen.text, ...seen.links].join('\n').toLowerCase();
}

async function settle(page: Page): Promise<void> {
  // Lists render after their fetch; `networkidle` is when the page has stopped
  // asking. The realtime socket is not a pending request, so it does not hold
  // this open.
  await page.waitForLoadState('networkidle');
}

test.describe('no screen shows a client uuid', () => {
  let clients: ClientRef[] = [];

  test.beforeEach(async ({ page }) => {
    // Fetched once per worker: paging the whole index before every test would
    // spend the API's per-minute budget on setup rather than on the screens.
    if (clients.length === 0) {
      await page.goto('/dashboard');
      clients = await everyClient(page);
    }
    expect(
      clients.length,
      'no clients to look for — every check below would be vacuous',
    ).toBeGreaterThan(0);
  });

  for (const screen of SCREENS) {
    test(`${screen}: no client uuid in the text, the links or the address bar`, async ({
      page,
    }) => {
      await page.goto(screen);
      await settle(page);

      const surface = await visibleSurface(page);
      const leaked = clients
        .filter((c) => surface.includes(c.id.toLowerCase()))
        .map((c) => c.portalId);
      expect(leaked, `${screen} shows the uuid of the clients with these Portal IDs`).toEqual([]);
    });
  }

  test('a client profile and their KYC review are reached, and addressed, by Portal ID', async ({
    page,
  }) => {
    // Opened the way an operator does: from the directory, by clicking.
    await page.goto('/clients');
    await settle(page);
    await page.locator('table a[href^="/clients/"]').first().click();
    await expect(page).toHaveURL(/\/clients\/\d+$/);
    await settle(page);

    const portalId = Number(new URL(page.url()).pathname.split('/').pop());
    const client = clients.find((c) => c.portalId === portalId);
    expect(client, `no client holds Portal ID ${portalId}`).toBeTruthy();

    let surface = await visibleSurface(page);
    expect(surface).toContain(String(portalId));
    expect(surface, 'the profile shows the client’s uuid').not.toContain(client!.id.toLowerCase());

    await page.goto(`/kyc/${portalId}`);
    await settle(page);
    surface = await visibleSurface(page);
    expect(surface, 'the KYC review shows the client’s uuid').not.toContain(
      client!.id.toLowerCase(),
    );
  });

  test('a Portal ID typed into the directory search finds exactly that client', async ({
    page,
  }) => {
    const target = clients.at(-1)!;
    await page.goto('/clients');
    await settle(page);
    await page.getByRole('searchbox', { name: /search clients/i }).fill(String(target.portalId));
    await expect(page.locator('table tbody tr')).toHaveCount(1);
    await expect(page.locator('table tbody tr').first()).toContainText(String(target.portalId));
  });
});
