import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { adminApi } from './helpers';

/**
 * A CLIENT IS IDENTIFIED BY PORTAL ID ALONE — on every screen, in every link,
 * in the address bar.
 *
 * Until backend 0159 this walked every console screen hunting for client
 * uuids, because the uuid keyed every row and could leak through an href, a
 * filter chip or the URL. 0159 removed it (D-83): the Portal ID IS the
 * primary key, so there is no second identifier left to leak and that sweep
 * would pass vacuously. What remains worth driving is the journey itself —
 * an operator reaches a client and their KYC review by the number they quote,
 * and finds them by typing it.
 */

interface ClientRef {
  id: number;
}

/** The newest clients the signed-in admin can see. */
async function someClients(page: Page): Promise<ClientRef[]> {
  const admin = await adminApi(page.context());
  const res = await admin.get('/admin/clients?limit=100&withTotal=false');
  expect(res.ok(), `the client index answered ${res.status()}`).toBe(true);
  const body = (await res.json()) as { items: ClientRef[] };
  return body.items.map(({ id }) => ({ id }));
}

async function settle(page: Page): Promise<void> {
  // Lists render after their fetch; `networkidle` is when the page has stopped
  // asking. The realtime socket is not a pending request, so it does not hold
  // this open.
  await page.waitForLoadState('networkidle');
}

test.describe('a client is addressed by Portal ID', () => {
  let clients: ClientRef[] = [];

  test.beforeEach(async ({ page }) => {
    // Fetched once per worker: paging the whole index before every test would
    // spend the API's per-minute budget on setup rather than on the screens.
    if (clients.length === 0) {
      await page.goto('/dashboard');
      clients = await someClients(page);
    }
    expect(
      clients.length,
      'no clients to look for — every check below would be vacuous',
    ).toBeGreaterThan(0);
  });

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
    expect(
      clients.some((c) => c.id === portalId),
      `no client holds Portal ID ${portalId}`,
    ).toBe(true);
    await expect(page.locator('main')).toContainText(String(portalId));

    await page.goto(`/kyc/${portalId}`);
    await settle(page);
    await expect(page).toHaveURL(new RegExp(`/kyc/${portalId}$`));
  });

  test('a Portal ID typed into the directory search finds exactly that client', async ({
    page,
  }) => {
    const target = clients.at(-1)!;
    await page.goto('/clients');
    await settle(page);
    await page.getByRole('searchbox', { name: /search clients/i }).fill(String(target.id));
    await expect(page.locator('table tbody tr')).toHaveCount(1);
    await expect(page.locator('table tbody tr').first()).toContainText(String(target.id));
  });
});
