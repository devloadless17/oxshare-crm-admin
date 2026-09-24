import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import type { ClientProfile } from '@/lib/api/admin';
import { ChangeClientEmailDialog, EditClientProfileDialog } from './client-edit-dialogs';

/**
 * CORE-18's two dialogs, and the two properties that are easy to get wrong.
 *
 *  1. The profile form sends only what CHANGED. Echoing every field back would
 *     let this form's stale copy of a phone number overwrite whatever another
 *     screen wrote a second ago, and the API would record four changes each
 *     time an operator fixed one.
 *  2. The email dialog cannot be submitted by clicking through it. It is the
 *     one control on this surface that hands an account over, so the typed
 *     confirmation is load-bearing rather than decorative.
 */

// BOTH exports, per this repo's mocking note — components reach for `api` as
// named and default interchangeably, and mocking one leaves the other undefined.
const { updateClientProfile, changeClientEmail } = vi.hoisted(() => ({
  updateClientProfile: vi.fn(),
  changeClientEmail: vi.fn(),
}));
vi.mock('@/lib/api', () => {
  const api = { admin: { updateClientProfile, changeClientEmail } };
  return { api, default: api };
});

const PROFILE = {
  id: 'c-1',
  email: 'layla@example.com',
  firstName: 'Layla',
  lastName: 'Hadad',
  phone: '+9613111222',
  country: 'Lebanon',
  type: 'individual',
  status: 'active',
  verificationLevel: 1,
  emailVerified: true,
  tags: [],
  maskedFields: [],
} as unknown as ClientProfile;

beforeEach(() => {
  vi.clearAllMocks();
  updateClientProfile.mockResolvedValue({ ...PROFILE });
  changeClientEmail.mockResolvedValue({ ...PROFILE });
});

describe('EditClientProfileDialog', () => {
  it('sends only the field that changed', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EditClientProfileDialog open onClose={vi.fn()} profile={PROFILE} />);

    const firstName = await screen.findByDisplayValue('Layla');
    await user.clear(firstName);
    await user.type(firstName, 'Leila');
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(updateClientProfile).toHaveBeenCalledWith('c-1', { firstName: 'Leila' });
  });

  it('sends an empty string to clear a field, rather than omitting it', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EditClientProfileDialog open onClose={vi.fn()} profile={PROFILE} />);

    // Omitting it would mean "leave it alone"; the empty string is what the API
    // reads as "remove what is there".
    await user.clear(await screen.findByDisplayValue('+9613111222'));
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(updateClientProfile).toHaveBeenCalledWith('c-1', { phone: '' });
  });

  it('a MASKED field cannot block the form, and cannot be overwritten', async () => {
    /*
     * REPORTED FROM PRODUCTION.
     *
     * A masked field is removed from the payload, so `lastName` arrived
     * undefined and the box rendered EMPTY — which reads as "this client has no
     * last name". `required` then refused to submit until the operator typed
     * something into it, so changing a PHONE NUMBER meant overwriting a last
     * name they were not allowed to read. The mask coerced exactly the
     * corruption it exists to prevent.
     */
    const user = userEvent.setup();
    const masked = {
      ...PROFILE,
      lastName: undefined,
      maskedFields: ['client.lastName'],
    } as unknown as ClientProfile;

    renderWithProviders(<EditClientProfileDialog open onClose={vi.fn()} profile={masked} />);

    // It says WHY the box is empty, rather than looking like a client with no
    // last name.
    expect(await screen.findByText(/hidden from you/i)).toBeInTheDocument();

    // And it cannot be typed into at all.
    const lastName = screen.getByLabelText(/last name/i);
    expect(lastName).toBeDisabled();

    // The whole point: another field is still editable and the form still saves.
    const phone = await screen.findByDisplayValue('+9613111222');
    await user.clear(phone);
    await user.type(phone, '+9613999888');
    await user.click(screen.getByRole('button', { name: /save/i }));

    /*
     * `toHaveBeenCalledWith` an EXACT object already proves the negative: a
     * patch carrying `lastName` would not match this. Asserted that way rather
     * than by indexing into `mock.calls`, which is possibly-undefined under
     * the type-checked lint rules and says the same thing less directly.
     */
    expect(updateClientProfile).toHaveBeenCalledWith('c-1', { phone: '+9613999888' });
  });

  it('cannot be saved when nothing has changed', async () => {
    renderWithProviders(<EditClientProfileDialog open onClose={vi.fn()} profile={PROFILE} />);

    // The API answers 400 to an empty patch, so a live button here would only
    // ever produce an error message.
    expect(await screen.findByRole('button', { name: /save/i })).toBeDisabled();
  });
});

describe('ChangeClientEmailDialog', () => {
  it('states the three consequences before anything is sent', async () => {
    renderWithProviders(<ChangeClientEmailDialog open onClose={vi.fn()} profile={PROFILE} />);

    // All three are invisible to the operator otherwise, and the third causes a
    // support call if nobody expected it.
    expect(await screen.findByText(/signed out everywhere/i)).toBeInTheDocument();
    expect(screen.getByText(/starts unverified/i)).toBeInTheDocument();
    expect(screen.getByText(/previous address is emailed/i)).toBeInTheDocument();
  });

  it('stays disabled until the confirmation word is typed', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ChangeClientEmailDialog open onClose={vi.fn()} profile={PROFILE} />);

    const submit = await screen.findByRole('button', { name: /change it/i });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText(/new address/i), 'moved@example.com');
    // A valid address alone is not enough — that is the entire point.
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText(/type change to confirm/i), 'CHANGE');
    expect(submit).toBeEnabled();
  });

  it('refuses the address the client already has', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ChangeClientEmailDialog open onClose={vi.fn()} profile={PROFILE} />);

    await user.type(await screen.findByLabelText(/new address/i), PROFILE.email!);
    await user.type(screen.getByLabelText(/type change to confirm/i), 'CHANGE');

    expect(screen.getByRole('button', { name: /change it/i })).toBeDisabled();
    expect(changeClientEmail).not.toHaveBeenCalled();
  });

  it('sends the new address once confirmed', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ChangeClientEmailDialog open onClose={vi.fn()} profile={PROFILE} />);

    await user.type(await screen.findByLabelText(/new address/i), 'moved@example.com');
    await user.type(screen.getByLabelText(/type change to confirm/i), 'CHANGE');
    await user.click(screen.getByRole('button', { name: /change it/i }));

    expect(changeClientEmail).toHaveBeenCalledWith('c-1', 'moved@example.com');
  });
});
