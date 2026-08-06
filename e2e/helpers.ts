import type { Page, Response } from '@playwright/test';

/**
 * The admin the E2E SUITE owns — seeded master, permissions `["*"]`.
 *
 * Deliberately NOT `admin@oxshare.com`. That is the account a developer is
 * signed into while working, and the portal suite learned what sharing costs
 * within a single run: repeated test logins exhausted the per-minute cap and
 * answered a human's own sign-in with 429, and two parties rotating refresh
 * tokens for one identity is exactly what reuse detection exists to punish.
 *
 * Master-level on purpose. This suite walks the whole console, and a fixture
 * that 403s halfway would be testing the fixture. Permission SPLITS are asserted
 * against purpose-made roles, not by crippling the fixture.
 */
export const E2E_ADMIN = {
  email: 'e2e-admin@oxshare.com',
  password: 'admin123',
} as const;

/** Where the signed-in session is cached between specs. See `auth.setup.ts`. */
export const STORAGE_STATE = 'e2e/.auth/admin.json';

/**
 * Sign in through the real form.
 *
 * Used ONCE per run by `auth.setup.ts`, not per test. Nothing here plants a
 * cookie: the session is httpOnly and the login response carries no token, so
 * there is nothing to plant — driving the form is the only way in.
 */
export async function signIn(
  page: Page,
  credentials: { email: string; password: string } = E2E_ADMIN,
): Promise<void> {
  await page.goto('/login');
  await page.locator('#email').fill(credentials.email);
  await page.locator('#password').fill(credentials.password);

  /*
   * Watch the login RESPONSE, not just the URL.
   *
   * Admin login is rate limited, and a suite that signs in more than once will
   * meet that — especially while somebody is iterating on a spec. Waiting only
   * on the URL turns it into a bare timeout that reads as "login is broken" and
   * sends whoever sees it looking in the wrong place. The portal suite paid for
   * that lesson twice; this one starts with it.
   */
  const [response] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes('/api/admin/auth/login') && res.request().method() === 'POST',
      { timeout: 30_000 },
    ),
    page
      .getByRole('button', { name: /sign in|log ?in/i })
      .first()
      .click(),
  ]);

  if (response.status() === 429) {
    throw new Error(
      `Rate limited signing in as ${credentials.email}: the admin login answered 429. ` +
        'That cap is not the thing under test — wait a minute and re-run.',
    );
  }
  if (!response.ok()) {
    throw new Error(
      `Could not sign in as ${credentials.email}: admin login answered ${response.status()}. ` +
        'Is the backend seeded? This fixture is created by runSeeds() on boot.',
    );
  }

  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

/**
 * Every API response the page received that the server refused.
 *
 * The reason to reach for a browser at all: a unit test cannot see that a layout
 * fires a forbidden request on every navigation. This lets a spec assert about
 * the traffic the UI produced without knowing which component produced it.
 *
 * On ADMIN, a 403 is the interesting one. The API enforces per-permission 403s
 * and the nav is gated client-side from the same catalogue, so a 403 means those
 * two disagree — the console offered something the API refuses.
 */
export function collectRejections(page: Page): { list: () => string[] } {
  const rejected: string[] = [];

  page.on('response', (response: Response) => {
    const url = response.url();
    if (!url.includes('/api/')) return;
    const status = response.status();
    if (status === 401 || status === 403) {
      rejected.push(`${status} ${new URL(url).pathname}`);
    }
  });

  return { list: () => [...rejected] };
}
