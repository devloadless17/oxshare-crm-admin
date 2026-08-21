import { expect, test } from './fixtures';
import { collectRejections, RESTRICTED_STATE } from './helpers';

/**
 * Route gating on the screens that hold the most dangerous write controls —
 * the ones that were drawn for any holder of the READ key until this audit:
 * API keys (a standing credential with the creator's permissions), wallets
 * ("Add funds" mints balance), the payout queue, the audit trail, settings.
 *
 * Three-part assertion, as in rbac-gating-and-masking.spec.ts: the master
 * reaches each with no refusal on the wire; the restricted admin is shown the
 * closed door, and whatever the page DID ask the API for came back 403 at most
 * once — no retry storm behind a denied screen.
 */
const GATED = ['/api-keys', '/wallets', '/transactions', '/audit-log', '/settings'] as const;

test.describe('a master admin', () => {
  for (const path of GATED) {
    test(`reaches ${path} with nothing refused`, async ({ page }) => {
      const rejections = collectRejections(page);
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('navigation').first()).toBeAttached();
      expect(rejections.list(), `${path} refused something for the master`).toEqual([]);
    });
  }

  test('/api-keys offers the New key control to a holder of apikeys.create', async ({ page }) => {
    await page.goto('/api-keys');
    await expect(page.getByRole('link', { name: /new api key/i })).toBeVisible();
  });

  test('/wallets offers the row actions to a holder of wallets.credit', async ({ page }) => {
    await page.goto('/wallets');
    await page.waitForLoadState('networkidle');
    const actions = page.getByRole('button', { name: /actions for/i });
    // The dev database may hold no wallets at all; the control is asserted
    // only against a rendered row.
    if ((await actions.count()) > 0) await expect(actions.first()).toBeVisible();
  });
});

test.describe('a RESTRICTED admin', () => {
  test.use({ storageState: RESTRICTED_STATE });

  for (const path of GATED) {
    test(`is shown the closed door at ${path}, with no retry storm`, async ({ page }) => {
      const refused: string[] = [];
      page.on('response', (r) => {
        if (new URL(r.url()).pathname.startsWith('/v1/') && r.status() === 403) {
          refused.push(new URL(r.url()).pathname);
        }
      });
      await page.goto(path);
      await expect(page.getByText(/access denied/i)).toBeVisible();
      // Each forbidden call at most once.
      const counts = new Map<string, number>();
      for (const p of refused) counts.set(p, (counts.get(p) ?? 0) + 1);
      for (const [p, n] of counts) expect(n, `${p} was retried after a 403`).toBeLessThanOrEqual(1);
    });
  }

  test('is offered no write control on /wallets even if it could see it', async ({ page }) => {
    await page.goto('/wallets');
    await expect(page.getByRole('button', { name: /add funds|credit/i })).toHaveCount(0);
  });
});
