import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import type { IbPartnerDetail } from '@/lib/api/admin';
import { SubPartnerTermsDialog } from './client-partner-dialogs';

/**
 * A sub-partner's own commission and rebate (0197). The owner's rule: the
 * sub-partner takes their share and the main partner above them the rest, so
 * the dialog shows both sides of the split while the number is typed.
 */
const { setIbPartnerTerms } = vi.hoisted(() => ({ setIbPartnerTerms: vi.fn() }));

vi.mock('@/lib/api', () => {
  const api = { admin: { setIbPartnerTerms } };
  return { api, default: api };
});

function partner(over: Partial<IbPartnerDetail> = {}): IbPartnerDetail {
  return {
    userId: 1007184,
    level: 2,
    levelCommissionShare: '30.0000',
    levelRebateShare: '30.0000',
    commissionShareOverride: null,
    rebateShareOverride: null,
    referralCode: 'OX-1234',
    ...over,
  } as unknown as IbPartnerDetail;
}

function renderDialog(p = partner()) {
  return renderWithProviders(
    <SubPartnerTermsDialog open onClose={vi.fn()} partner={p} name="Ali" />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setIbPartnerTerms.mockResolvedValue({});
});

describe('a sub-partner’s own commission and rebate', () => {
  it('shows the level default split before anything is typed', () => {
    renderDialog();
    expect(screen.getByText(/sub-partner 30% · main partner 70%/i)).toBeInTheDocument();
  });

  it('shows the main partner taking the rest as the share is typed', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.type(screen.getByLabelText(/sub-partner earns/i), '50');
    expect(screen.getByText(/sub-partner 50% · main partner 50%/i)).toBeInTheDocument();
  });

  it('sends both shares as typed', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.type(screen.getByLabelText(/sub-partner earns/i), '50');
    await user.type(screen.getByLabelText(/clients get back/i), '20');
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() =>
      expect(setIbPartnerTerms).toHaveBeenCalledWith(1007184, {
        commissionShare: '50',
        rebateShare: '20',
      }),
    );
  });

  it('sends null for an emptied field — back to the level default', async () => {
    const user = userEvent.setup();
    renderDialog(partner({ commissionShareOverride: '50.0000', rebateShareOverride: '20.0000' }));
    await user.clear(screen.getByLabelText(/sub-partner earns/i));
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() =>
      expect(setIbPartnerTerms).toHaveBeenCalledWith(1007184, {
        commissionShare: null,
        rebateShare: '20',
      }),
    );
  });

  it('refuses a share above 100% and sends nothing', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.type(screen.getByLabelText(/sub-partner earns/i), '150');
    expect(screen.getByRole('alert')).toHaveTextContent(/0 to 100/);
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled();
    expect(setIbPartnerTerms).not.toHaveBeenCalled();
  });
});
