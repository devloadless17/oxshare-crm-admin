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
const { updateClientProfile, changeClientEmail, profileOptions } = vi.hoisted(() => ({
  updateClientProfile: vi.fn(),
  changeClientEmail: vi.fn(),
  profileOptions: vi.fn(),
}));
vi.mock('@/lib/api', () => {
  const api = { admin: { updateClientProfile, changeClientEmail, profileOptions } };
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
  profileOptions.mockResolvedValue({
    countries: ['Lebanon', 'United Arab Emirates'],
    nationalities: ['Emirati', 'Lebanese'],
  });
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

describe('EditClientProfileDialog — the whole profile (0139)', () => {
  it('offers the server’s lists, and sends the choice', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EditClientProfileDialog open onClose={vi.fn()} profile={PROFILE} />);

    const country = await screen.findByLabelText(/country of residence/i);
    await screen.findByRole('option', { name: 'United Arab Emirates' });
    await user.selectOptions(country, 'United Arab Emirates');
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(updateClientProfile).toHaveBeenCalledWith('c-1', { country: 'United Arab Emirates' });
  });

  it('edits the date of birth, nationality and address the client gave', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EditClientProfileDialog open onClose={vi.fn()} profile={PROFILE} />);

    const dob = await screen.findByLabelText(/date of birth/i);
    await user.type(dob, '1991-03-09');
    await screen.findByRole('option', { name: 'Lebanese' });
    await user.selectOptions(screen.getByLabelText(/nationality/i), 'Lebanese');
    await user.type(screen.getByLabelText(/^city/i), 'Beirut');
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(updateClientProfile).toHaveBeenCalledWith('c-1', {
      dateOfBirth: '1991-03-09',
      nationality: 'Lebanese',
      city: 'Beirut',
    });
  });

  it('a field the VERIFICATION locked is disabled, says where to change it, and is never sent', async () => {
    /*
     * The sentence is the SERVER's (`lockedFields`): the dialog renders it
     * rather than keeping a copy of the rule that could drift from the one
     * that refuses.
     */
    const user = userEvent.setup();
    const locked = {
      ...PROFILE,
      lockedFields: {
        firstName: 'First name was verified by KYC. Changing it needs a new verification.',
        dateOfBirth:
          'Date of birth was verified by KYC. Correct it from the client’s KYC review, where the change is checked again and recorded on the verification.',
      },
    } as unknown as ClientProfile;
    renderWithProviders(<EditClientProfileDialog open onClose={vi.fn()} profile={locked} />);

    const firstName = await screen.findByDisplayValue('Layla');
    expect(firstName).toBeDisabled();
    expect(screen.getByLabelText(/date of birth/i)).toBeDisabled();
    expect(screen.getByText(/needs a new verification/i)).toBeInTheDocument();
    expect(screen.getByText(/from the client’s KYC review/i)).toBeInTheDocument();

    // The phone is still the desk's.
    const phone = screen.getByDisplayValue('+9613111222');
    expect(phone).toBeEnabled();
    await user.clear(phone);
    await user.type(phone, '+961 71 000 111');
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(updateClientProfile).toHaveBeenCalledWith('c-1', { phone: '+961 71 000 111' });
  });

  it('puts the server’s refusal under the field it is about', async () => {
    updateClientProfile.mockRejectedValueOnce({
      response: {
        status: 400,
        data: {
          code: 'VALIDATION_FAILED',
          message: 'Enter a complete phone number…',
          fields: {
            phone: 'Enter a complete phone number, including the country code.',
          },
        },
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<EditClientProfileDialog open onClose={vi.fn()} profile={PROFILE} />);

    const phone = await screen.findByDisplayValue('+9613111222');
    await user.clear(phone);
    await user.type(phone, '+961 70 12');
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(
      await screen.findByText(/including the country code/i, { selector: '[role="alert"]' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^phone/i)).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows a lock that arrived AFTER the dialog opened the same way — under its field', async () => {
    // A submission sent while the operator was typing: the server answers 409
    // `PROFILE_LOCKED` naming the field, and the dialog says so where it applies.
    updateClientProfile.mockRejectedValueOnce({
      response: {
        status: 409,
        data: {
          code: 'PROFILE_LOCKED',
          message: 'First name is being checked…',
          fields: {
            firstName:
              "First name is being checked against the client's documents right now. It can change once the reviewer decides.",
          },
        },
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<EditClientProfileDialog open onClose={vi.fn()} profile={PROFILE} />);

    const firstName = await screen.findByDisplayValue('Layla');
    await user.clear(firstName);
    await user.type(firstName, 'Leila');
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByText(/once the reviewer decides/i)).toBeInTheDocument();
  });

  it('keeps a stored value the list does not hold, rather than silently replacing it', async () => {
    // Written before the rules ("Lebanon" as a nationality): shown as it is, and
    // an untouched select sends nothing.
    const user = userEvent.setup();
    const legacy = { ...PROFILE, nationality: 'Lebanon' } as unknown as ClientProfile;
    renderWithProviders(<EditClientProfileDialog open onClose={vi.fn()} profile={legacy} />);

    await screen.findByRole('option', { name: 'Lebanese' });
    expect(screen.getByLabelText(/nationality/i)).toHaveValue('Lebanon');
    const phone = screen.getByDisplayValue('+9613111222');
    await user.type(phone, '3');
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(updateClientProfile).toHaveBeenCalledWith('c-1', { phone: '+96131112223' });
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
