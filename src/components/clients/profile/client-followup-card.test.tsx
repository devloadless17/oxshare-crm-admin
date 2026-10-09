import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import type { ClientFollowUp } from '@/lib/api/admin';
import { ClientFollowUpCard } from './client-followup-card';

/**
 * A client's Follow-up and Result (backend 0212). The property that matters:
 * nothing typed is lost without a word — a colleague's newer save is SHOWN
 * beside this draft, never silently taken or silently overwritten.
 */

const { getClientFollowUp, saveClientFollowUp } = vi.hoisted(() => ({
  getClientFollowUp: vi.fn(),
  saveClientFollowUp: vi.fn(),
}));
vi.mock('@/lib/api', () => {
  const api = { admin: { getClientFollowUp, saveClientFollowUp } };
  return { api, default: api };
});
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

// Real keys: `hasPermission` has no wildcard.
const session = vi.hoisted(() => ({ permissions: [] as string[] }));
vi.mock('@/context/AdminAuthContext', () => ({
  useAdmin: () => ({
    admin: { id: 'a-1', email: 'desk@oxshare.com', permissions: session.permissions },
  }),
}));

const SAVED: ClientFollowUp = {
  followUp: 'Call back after payday',
  result: 'Interested',
  followUpAt: null,
  version: 1,
  updatedAt: '2026-10-09T08:00:00.000Z',
  updatedBy: { id: 'a-2', name: 'Sara Khalil' },
};

beforeEach(() => {
  vi.clearAllMocks();
  getClientFollowUp.mockResolvedValue(SAVED);
});

describe('ClientFollowUpCard', () => {
  it('shows the notes as text to a reader who may not edit them', async () => {
    session.permissions = ['clients.view'];
    renderWithProviders(<ClientFollowUpCard clientId={1000245} />);

    expect(await screen.findByText('Call back after payday')).toBeInTheDocument();
    expect(screen.getByText('Interested')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save notes' })).not.toBeInTheDocument();
  });

  it('saves the notes from the version they were edited from', async () => {
    session.permissions = ['clients.view', 'clients.followup.edit'];
    saveClientFollowUp.mockResolvedValue({ ...SAVED, result: 'Deposited', version: 2 });
    const user = userEvent.setup();
    renderWithProviders(<ClientFollowUpCard clientId={1000246} />);

    const result = await screen.findByLabelText('Result');
    await user.clear(result);
    await user.type(result, 'Deposited');
    await user.click(screen.getByRole('button', { name: 'Save notes' }));

    await waitFor(() =>
      expect(saveClientFollowUp).toHaveBeenCalledWith(1000246, {
        followUp: 'Call back after payday',
        result: 'Deposited',
        followUpAt: null,
        version: 1,
      }),
    );
  });

  it("keeps the draft and shows a colleague's newer notes when the save is refused as stale", async () => {
    session.permissions = ['clients.view', 'clients.followup.edit'];
    const theirs = {
      ...SAVED,
      result: 'No answer',
      version: 2,
      updatedBy: { id: 'a-3', name: 'Omar Farah' },
    };
    getClientFollowUp.mockResolvedValueOnce(SAVED).mockResolvedValue(theirs);
    saveClientFollowUp
      .mockRejectedValueOnce({
        response: { status: 409, data: { code: 'FOLLOWUP_STALE', message: 'stale' } },
      })
      .mockResolvedValueOnce({ ...theirs, result: 'Deposited', version: 3 });
    const user = userEvent.setup();
    renderWithProviders(<ClientFollowUpCard clientId={1000247} />);

    const result = await screen.findByLabelText('Result');
    await user.clear(result);
    await user.type(result, 'Deposited');
    await user.click(screen.getByRole('button', { name: 'Save notes' }));

    expect(
      await screen.findByText('Omar Farah changed these notes while you were editing.'),
    ).toBeInTheDocument();
    expect(screen.getByText('No answer')).toBeInTheDocument();
    // The editor's own words are still in the box, unsaved.
    expect(screen.getByLabelText('Result')).toHaveValue('Deposited');

    await user.click(screen.getByRole('button', { name: 'Save mine instead' }));
    await waitFor(() =>
      expect(saveClientFollowUp).toHaveBeenLastCalledWith(
        1000247,
        expect.objectContaining({ result: 'Deposited', version: 2 }),
      ),
    );
  });
});
