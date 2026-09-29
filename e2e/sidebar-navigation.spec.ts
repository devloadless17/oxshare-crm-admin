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
/*
 * A main item's ARROW — the button that opens its list, named "<Group> pages".
 * Its NAME beside it is a link to the section's main page.
 */
const header = (page: import('@playwright/test').Page, name: RegExp) =>
  nav(page).getByRole('button', { name });

interface MenuRecorder {
  __menuStates: { path: string; state: string }[];
}

/**
 * Holds every client-side page load (Next's RSC requests) for `ms`, so a state
 * the menu passes through for a frame on a fast machine is held long enough to
 * be recorded.
 */
async function slowPageLoads(page: import('@playwright/test').Page, ms: number): Promise<void> {
  await page.route('**/*', async (route) => {
    const headers = route.request().headers();
    if (headers['rsc'] === '1' && !headers['next-router-prefetch']) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
    await route.fallback();
  });
}

/**
 * From now on, records every DISTINCT state the menu shows: which main items
 * are open, which row is selected, which page is current.
 */
async function recordMenu(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const name = (el: Element) =>
      (el.getAttribute('aria-label') ?? el.getAttribute('title') ?? el.textContent ?? '')
        .split(',')[0]!
        .replace(/\d+/g, '')
        .trim()
        .replace(/\s+pages$/, '');
    const snap = () => {
      const menu = document.querySelector('aside nav');
      if (!menu) return 'no menu';
      return JSON.stringify({
        open: [...menu.querySelectorAll('button[aria-expanded="true"]')].map(name),
        selected: [...menu.querySelectorAll('[data-selected]')].map(name),
        current: [...menu.querySelectorAll('[aria-current="page"]')].map(name),
      });
    };
    const w = window as unknown as MenuRecorder;
    w.__menuStates = [];
    let last = snap();
    new MutationObserver(() => {
      const state = snap();
      if (state === last) return;
      last = state;
      w.__menuStates.push({ path: location.pathname, state });
    }).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-expanded', 'data-selected', 'aria-current', 'class'],
    });
  });
}

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

  test('shows where a click is going at once, and nothing moves when the page lands', async ({
    page,
  }) => {
    /*
     * Reported: "when I press on an item it closes the expanded menu then
     * expands it again, and sometimes makes another main item active for
     * milliseconds". The menu forgot the operator's choice on the click and
     * waited for `pathname`, which changes only when the next page lands — so
     * for the whole load it showed the page being LEFT. Page loads are held
     * here so that window is long enough to see.
     */
    await page.goto('/products');
    await slowPageLoads(page, 1500);
    await header(page, /^clients/i).click();
    await recordMenu(page);

    await nav(page)
      .getByRole('link', { name: /^all clients/i })
      .click();
    await page.waitForURL(/\/clients$/);
    await page.waitForLoadState('networkidle');

    const states = await page.evaluate(() => (window as unknown as MenuRecorder).__menuStates);
    // ONE change, straight to the destination — Trading never lights up again
    // and Clients never folds on the way…
    expect(states).toHaveLength(1);
    expect(JSON.parse(states[0]?.state ?? '{}')).toEqual({
      open: ['Clients'],
      selected: ['Clients'],
      current: ['All clients'],
    });
    // …made while Products was still on screen: the menu answered the click.
    expect(states[0]?.path).toBe('/products');
  });

  test('highlights ONE row, and it moves to the main item opened', async ({ page }) => {
    // The owner's report: opening a main item left the old one looking active.
    await page.goto('/dashboard');
    const selected = nav(page).locator('[data-selected]');
    await expect(selected).toHaveCount(1);
    await expect(selected).toContainText(/dashboard/i);

    await header(page, /^system/i).click();
    await expect(selected).toHaveCount(1);
    await expect(selected).toContainText(/system/i);
    // The page is still the page, for a screen reader.
    await expect(nav(page).getByRole('link', { name: /^dashboard$/i })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('keeps a closed group’s pages away from the keyboard and assistive tech', async ({
    page,
  }) => {
    await page.goto('/dashboard');

    // Folded to zero height AND hidden: no role query finds them…
    await expect(nav(page).getByRole('link', { name: /^ledger/i })).toHaveCount(0);

    // …and Tab goes from one main item to the next — Clients' arrow to the
    // next main item's name — never into a closed panel.
    await header(page, /^clients/i).focus();
    await page.keyboard.press('Tab');
    await expect(nav(page).getByRole('link', { name: /^introducing brokers/i })).toBeFocused();
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
    // Introducing brokers holds the Referrals page (0974b17), which is a list of
    // referred CLIENTS and asks for `clients.view` alone — so it is theirs too.
    await expect(headers).toHaveCount(3);
    await expect(headers.nth(0)).toHaveAccessibleName(/^clients/i);
    await expect(headers.nth(1)).toHaveAccessibleName(/^introducing brokers/i);
    await expect(headers.nth(2)).toHaveAccessibleName(/^system/i);
    await expect(nav(page).getByRole('link', { name: /^dashboard$/i })).toBeVisible();
    // A main item's name opens the first page in it THIS admin may open —
    // Client tags, not Settings, for someone holding `tags.view` alone there.
    await expect(nav(page).getByRole('link', { name: /^system/i })).toHaveAttribute(
      'href',
      '/tags',
    );
  });
});
