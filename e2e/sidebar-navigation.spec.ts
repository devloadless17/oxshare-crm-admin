import { expect, test } from './fixtures';
import { RESTRICTED_STATE } from './helpers';

/**
 * THE SIDEBAR, driven the way an operator drives it.
 *
 * Main items that open onto their pages (the owner's request, 25 Sep 2026),
 * one open at a time and following the page; a collapsed rail whose items are
 * menus; a phone drawer that behaves as the modal it is; and a shell that
 * mirrors for a right-to-left console.
 *
 * The unit tests pin the same rules in jsdom, which applies no CSS: nothing
 * there can see that a closed group is actually invisible, that the drawer's
 * links are out of the tab order while it is shut, or that the sidebar sits on
 * the right under `dir="rtl"`. Those are this file's reason to exist.
 */

const nav = (page: import('@playwright/test').Page) => page.getByRole('navigation').first();
const header = (page: import('@playwright/test').Page, name: RegExp) =>
  nav(page).getByRole('button', { name });

test.describe('the sidebar — main items with sub-items', () => {
  test('opens one main item at a time, and it follows the page', async ({ page }) => {
    await page.goto('/kyc/builder');

    // Arriving on a page opens the group holding it — the builder is System's.
    await expect(header(page, /^system/i)).toHaveAttribute('aria-expanded', 'true');
    await expect(header(page, /^finance/i)).toHaveAttribute('aria-expanded', 'false');

    // Opening another closes the first.
    await header(page, /^finance/i).click();
    await expect(header(page, /^finance/i)).toHaveAttribute('aria-expanded', 'true');
    await expect(header(page, /^system/i)).toHaveAttribute('aria-expanded', 'false');

    // And moving inside it keeps it open, with exactly one page marked current.
    await nav(page)
      .getByRole('link', { name: /^ledger/i })
      .click();
    await page.waitForURL(/\/ledger$/);
    await expect(header(page, /^finance/i)).toHaveAttribute('aria-expanded', 'true');
    await expect(nav(page).locator('[aria-current="page"]')).toHaveCount(1);
    await expect(nav(page).locator('[aria-current="page"]')).toContainText(/ledger/i);
  });

  test('keeps a closed group’s pages away from the keyboard and assistive tech', async ({
    page,
  }) => {
    await page.goto('/dashboard');

    // Folded to zero height AND hidden: no role query finds them…
    await expect(nav(page).getByRole('link', { name: /^ledger/i })).toHaveCount(0);

    // …and Tab goes from one main item to the next, never into a closed panel.
    await header(page, /^clients/i).focus();
    await page.keyboard.press('Tab');
    await expect(header(page, /^introducing brokers/i)).toBeFocused();
  });

  test('collapses to a rail whose menus work from the keyboard, and remembers it', async ({
    page,
  }) => {
    await page.goto('/currencies');
    try {
      await page.getByRole('button', { name: /collapse the sidebar/i }).click();

      const finance = page.getByRole('button', { name: /^finance/i });
      await finance.focus();
      await page.keyboard.press('Enter');

      const menu = page.getByRole('menu');
      await expect(menu).toBeVisible();
      await expect(menu.getByRole('menuitem', { name: 'Currencies' })).toHaveAttribute(
        'aria-current',
        'page',
      );

      // Escape closes the menu and hands focus back to its trigger.
      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();
      await expect(finance).toBeFocused();

      // The rail is a PREFERENCE: a reload keeps it.
      await page.reload();
      await expect(page.getByRole('button', { name: /expand the sidebar/i })).toBeVisible();
    } finally {
      // Leave the browser as the next spec expects it.
      await page.evaluate(() => window.localStorage.removeItem('oxshare-admin-sidebar'));
    }
  });

  test('mirrors the whole shell for a right-to-left console', async ({ page }) => {
    await page.goto('/currencies');
    try {
      await page.evaluate(() => window.localStorage.setItem('oxshare-admin-locale', 'ar'));
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

      const aside = page.locator('aside');
      const box = await aside.boundingBox();
      const width = page.viewportSize()?.width ?? 0;
      // Flush against the RIGHT edge — the inline start of an RTL page.
      expect(box && Math.round(box.x + box.width)).toBe(width);

      const overflow = await page.evaluate(
        () =>
          Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) -
          document.documentElement.clientWidth,
      );
      expect(overflow, 'the mirrored console scrolls sideways').toBeLessThanOrEqual(1);
    } finally {
      await page.evaluate(() => window.localStorage.removeItem('oxshare-admin-locale'));
    }
  });
});

test.describe('the sidebar on a phone', () => {
  test.use({ viewport: { width: 400, height: 800 } });

  test('is a proper modal drawer: named, focused, and closed by Escape', async ({ page }) => {
    await page.goto('/ledger');
    const open = page.getByRole('button', { name: 'Open the menu' });

    // Shut, its links are out of reach — not merely translated off-screen.
    await expect(nav(page).getByRole('link', { name: /^dashboard$/i })).toHaveCount(0);

    await open.click();
    const drawer = page.getByRole('dialog', { name: 'Menu' });
    await expect(drawer).toBeVisible();
    await expect(open).toHaveAttribute('aria-expanded', 'true');
    // Focus moved INTO the drawer, rather than staying behind the overlay.
    await expect
      .poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))))
      .toBe(true);
    // It SLIDES — Tailwind v4 moves it with `translate`, which the transition
    // must name, or the drawer snaps.
    expect(await drawer.evaluate((el) => getComputedStyle(el).transitionProperty)).toContain(
      'translate',
    );

    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(open).toBeFocused();
  });

  test('navigates from the drawer and closes it behind the tap', async ({ page }) => {
    await page.goto('/ledger');
    await page.getByRole('button', { name: 'Open the menu' }).click();

    const drawer = page.getByRole('dialog', { name: 'Menu' });
    await drawer.getByRole('button', { name: /^security/i }).click();
    await drawer.getByRole('link', { name: /^audit log/i }).click();

    await page.waitForURL(/\/audit-log/);
    await expect(page.getByRole('dialog', { name: 'Menu' })).toBeHidden();
  });
});

test.describe('the sidebar for a restricted administrator', () => {
  test.use({ storageState: RESTRICTED_STATE });

  test('offers only the main items holding pages they may open', async ({ page }) => {
    // `clients.view`, `kyc.review` and `tags.view` — see E2E_RESTRICTED.
    await page.goto('/dashboard');
    const headers = nav(page).getByRole('button');
    await expect(headers).toHaveText([/^clients/i, /^system/i]);
    await expect(nav(page).getByRole('link', { name: /^dashboard$/i })).toBeVisible();
  });
});
