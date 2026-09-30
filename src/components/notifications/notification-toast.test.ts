import { beforeEach, describe, expect, it, vi } from 'vitest';

const toast = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast }));

import { toastNotification } from './notification-toast';

/**
 * The arrival toast names the client the way this reader may see them: by
 * name and Portal ID when the scoped read returned a name, by Portal ID alone
 * when a role hides names — never a name the socket could have leaked.
 */

const arrival = {
  id: 'n-1',
  kind: 'admin.withdrawal.requested',
  subjectPortalId: 1000245,
  params: { transactionId: 'tx-1', amount: '1250.00000000', currency: 'USD' },
};

beforeEach(() => toast.mockClear());

describe('toastNotification', () => {
  it('names the client when this reader may see the name', () => {
    toastNotification(arrival, undefined, undefined, 'John Doe');
    expect(toast).toHaveBeenCalledWith(
      'Approve withdrawal',
      expect.objectContaining({ description: expect.stringMatching(/^John Doe · #1000245 · /) }),
    );
  });

  it('falls back to the Portal ID alone for a role that hides names', () => {
    toastNotification(arrival);
    expect(toast).toHaveBeenCalledWith(
      'Approve withdrawal',
      expect.objectContaining({ description: expect.stringMatching(/^#1000245 · /) }),
    );
  });
});
