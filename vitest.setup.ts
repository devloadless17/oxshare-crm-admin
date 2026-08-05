import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

/*
 * `findBy*` and `waitFor` poll for 5s, not testing-library's default 1s.
 *
 * The default left the harness self-contradictory: vitest allows 20s per test
 * (`testTimeout` in vitest.config.mts), while every async DOM query inside it
 * gave up after ONE second. A screen whose React Query promise had not resolved
 * in that window failed with "Unable to find an element with the text …" and a
 * DOM dump still showing the loading spinner — which reads as a rendering bug in
 * the component, not as a query that was never given time to settle.
 *
 * That is exactly how it presented: the admin directory's suspended-status test
 * failed on a loaded machine while the other thirteen in the same file passed,
 * and passed again on re-run. Time spent reading it as a product defect is the
 * real cost of the mismatch.
 *
 * 10s is a polling CEILING, not a delay — a query that resolves immediately still
 * returns immediately, so the suite does not get slower. It keeps a 2x margin
 * under `testTimeout` so a genuinely stuck query still fails as a timeout with a
 * useful message rather than hitting the outer limit.
 *
 * The first test in a file is the one that fails, which is the tell: it pays the
 * module-import and first-render cost inside its own polling budget. On a busy
 * machine that import bill runs to minutes of CPU across workers, so 1s — and
 * even 5s — could be spent before the component had rendered at all.
 */
configure({ asyncUtilTimeout: 10_000 });

// TWIN FILE — an identical copy lives at the same path in oxshare-crm-client.
//
// Without this cleanup, a component mounted in one test stays in the document for
// the next, and getByRole starts matching the wrong element — the kind of failure
// that reads as a flaky test rather than a missing teardown.
afterEach(() => {
  cleanup();
});

/*
 * jsdom shims that Radix UI needs.
 *
 * Radix's Select (and Dropdown, Popover…) drives its open/close through the
 * Pointer Events API and scrolls the highlighted item into view. jsdom implements
 * none of these, so without the stubs below a `click` on a SelectTrigger does
 * nothing at all: the portal never mounts, no `option` role ever appears, and a
 * test asserting on the menu fails as though the component were broken.
 *
 * These are the four the components in this app actually reach for. Keep them here
 * rather than per-test, because Select is on a dozen screens.
 */
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => undefined;
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => undefined;
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => undefined;
}
