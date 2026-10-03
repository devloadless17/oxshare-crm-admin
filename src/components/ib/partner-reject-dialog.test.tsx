import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { PartnerRejectDialog } from './partner-reject-dialog';

/**
 * Turning a partner application down: the label is PICKED (its Arabic comes
 * from the catalogue, on the server), and the reviewer's typed note may carry
 * an Arabic twin (0179). Blank, it is left out.
 */

const { getRejectionReasons } = vi.hoisted(() => ({ getRejectionReasons: vi.fn() }));

vi.mock('@/lib/api', () => {
  const api = { admin: { getRejectionReasons } };
  return { api, default: api };
});

beforeEach(() => {
  vi.clearAllMocks();
  getRejectionReasons.mockResolvedValue([]);
});

async function rejectWith(arabic: string) {
  const user = userEvent.setup();
  const onConfirm = vi.fn();
  renderWithProviders(
    <PartnerRejectDialog
      open
      applicantName="Ada Client"
      saving={false}
      onCancel={vi.fn()}
      onConfirm={onConfirm}
    />,
  );
  await user.type(
    screen.getByPlaceholderText('Anything specific to this applicant.'),
    'Add your website',
  );
  const ar = screen.getByLabelText('Your note in Arabic (optional)');
  expect(ar).toHaveAttribute('dir', 'rtl');
  expect(ar).toHaveAttribute('maxLength', '1000');
  if (arabic) await user.type(ar, arabic);
  await user.click(screen.getByRole('button', { name: 'Reject application' }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
  return onConfirm.mock.calls[0]![0] as Record<string, unknown>;
}

describe('rejecting a partner application, in Arabic too', () => {
  it('sends the note’s Arabic typed, trimmed', async () => {
    const body = await rejectWith(' يُرجى إضافة موقعك ');
    expect(body).toEqual({ note: 'Add your website', noteAr: 'يُرجى إضافة موقعك' });
  });

  it('leaves it out when blank', async () => {
    const body = await rejectWith('');
    expect(body.noteAr).toBeUndefined();
  });
});
