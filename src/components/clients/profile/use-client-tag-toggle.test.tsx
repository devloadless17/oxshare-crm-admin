import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { useClientTagToggle } from './use-client-tag-toggle';

const { assignTag, unassignTag, push, toastError, toastSuccess } = vi.hoisted(() => ({
  assignTag: vi.fn(),
  unassignTag: vi.fn(),
  push: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/lib/api', () => {
  const api = { admin: { assignTag, unassignTag } };
  return { api, default: api };
});
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/lib/toast', () => ({ toastError, toastSuccess }));

const leavesScope = () =>
  Object.assign(new Error('leaves scope'), {
    response: { status: 409, data: { code: 'TAG_CHANGE_LEAVES_SCOPE', message: 'x' } },
  });

function Harness({ attached = false, onHandedOver = () => {} }) {
  const tags = useClientTagToggle({
    clientId: '1000245',
    portalId: 1000245,
    labelOf: () => 'Gulf Desk',
    onHandedOver,
  });
  return (
    <button type="button" onClick={() => void tags.toggle('tag-1', attached)}>
      toggle
    </button>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useClientTagToggle', () => {
  it('adds a tag that keeps the client in view without asking anything', async () => {
    assignTag.mockResolvedValue({ assignments: [], stillVisible: true });
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    await user.click(screen.getByRole('button', { name: 'toggle' }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(assignTag).toHaveBeenCalledTimes(1);
    expect(assignTag).toHaveBeenCalledWith('1000245', 'tag-1', { confirmLeavesScope: undefined });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  it('asks before a change that hands the client over, and moves them only when confirmed', async () => {
    const onHandedOver = vi.fn();
    unassignTag
      .mockRejectedValueOnce(leavesScope())
      .mockResolvedValueOnce({ assignments: [], stillVisible: false });
    const user = userEvent.setup();
    renderWithProviders(<Harness attached onHandedOver={onHandedOver} />);

    await user.click(screen.getByRole('button', { name: 'toggle' }));
    const dialog = await screen.findByRole('alertdialog');
    // Named by Portal ID — the one identifier a mask never hides.
    expect(within(dialog).getByText(/hand #1000245 over\?/i)).toBeInTheDocument();
    // The question is not an error.
    expect(toastError).not.toHaveBeenCalled();
    expect(unassignTag).toHaveBeenCalledTimes(1);

    await user.click(within(dialog).getByRole('button', { name: /hand over/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/clients'));
    expect(unassignTag).toHaveBeenLastCalledWith('1000245', 'tag-1', {
      confirmLeavesScope: true,
    });
    expect(onHandedOver).toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledWith(expect.stringMatching(/#1000245 was handed over/));
  });

  it('does nothing more when the operator cancels — nothing is written, nothing reported', async () => {
    assignTag.mockRejectedValueOnce(leavesScope());
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    await user.click(screen.getByRole('button', { name: 'toggle' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(assignTag).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('reports any other refusal as a failure, and never asks', async () => {
    assignTag.mockRejectedValueOnce(
      Object.assign(new Error('nope'), {
        response: { status: 404, data: { code: 'CLIENT_NOT_FOUND' } },
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    await user.click(screen.getByRole('button', { name: 'toggle' }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
