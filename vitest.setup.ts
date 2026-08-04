import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

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
