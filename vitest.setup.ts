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
