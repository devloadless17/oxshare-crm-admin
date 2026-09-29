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

/*
 * The signed-in admin — the lock notice's link depends on what they hold.
 * Real keys: `hasPermission` has no wildcard.
 */
const session = vi.hoisted(() => ({ permissions: [] as string[] }));
vi.mock('@/context/AdminAuthContext', () => ({
  useAdmin: () => ({
    admin: {
      id: 'a-1',
      email: 'desk@oxshare.com',
      role: 'admin',
      permissions: session.permissions,
    },
  }),
}));

const PROFILE = {
  id: 'c-1',
  email: 'layla@example.com',
  firstName: 'Layla',
  lastName: 'Hadad',
  phone: '+9613111222',
  country: 'Lebanon',
  portalId: 1000142,
  type: 'individual',
  status: 'active',
  verificationLevel: 1,
  emailVerified: true,
  tags: [],
  maskedFields: [],
} as unknown as ClientProfile;

beforeEach(() => {
  vi.clearAllMocks();
  session.permissions = ['clients.edit'];
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
    await user.clear(await screen.findByLabelText(/^phone/i));
    await user.click(screen.getByRole('button', { name: /save/i }));

    // The picker keeps its country, but a dial code alone is no number.
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
    const phone = await screen.findByLabelText(/^phone/i);
    await user.clear(phone);
    await user.type(phone, '3 999 888');
    await user.click(screen.getByRole('button', { name: /save/i }));

    /*
     * `toHaveBeenCalledWith` an EXACT object already proves the negative: a
     * patch carrying `lastName` would not match this. Asserted that way rather
     * than by indexing into `mock.calls`, which is possibly-undefined under
     * the type-checked lint rules and says the same thing less directly.
     */
    expect(updateClientProfile).toHaveBeenCalledWith('c-1', { phone: '+961 3 999 888' });
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
    const phone = screen.getByLabelText(/^phone/i);
    expect(phone).toBeEnabled();
    await user.clear(phone);
    await user.type(phone, '71 000 111');
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(updateClientProfile).toHaveBeenCalledWith('c-1', { phone: '+961 71 000 111' });
  });

  it('puts the server’s refusal under the field it is about', async () => {
    updateClientProfile.mockRejectedValueOnce({
      response: {
        status: 400,
        data: {
          code: 'VALIDATION_FAILED',
          message: 'This phone number is too short. Enter all the digits after +961.',
          fields: {
            phone: 'This phone number is too short. Enter all the digits after +961.',
          },
        },
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<EditClientProfileDialog open onClose={vi.fn()} profile={PROFILE} />);

    const phone = await screen.findByLabelText(/^phone/i);
    await user.clear(phone);
    await user.type(phone, '70 12');
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(
      await screen.findByText(/too short/i, { selector: '[role="alert"]' }),
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
    const phone = screen.getByLabelText(/^phone/i);
    await user.type(phone, '3');
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(updateClientProfile).toHaveBeenCalledWith('c-1', { phone: '+961 3 111 2223' });
  });
});

describe('EditClientProfileDialog — the phone picker (owner, 26 Sep 2026)', () => {
  it('shows a stored number as the portal does: its country, and the number grouped', async () => {
    renderWithProviders(<EditClientProfileDialog open onClose={vi.fn()} profile={PROFILE} />);

    expect(await screen.findByLabelText(/^phone/i)).toHaveValue('3 111 222');
    expect(screen.getByRole('button', { name: /country code — lebanon/i })).toHaveTextContent(
      '+961',
    );
  });

  it('changes the country, and sends the number under the new code', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EditClientProfileDialog open onClose={vi.fn()} profile={PROFILE} />);

    await user.click(await screen.findByRole('button', { name: /country code — lebanon/i }));
    await user.type(screen.getByRole('textbox', { name: /search country/i }), 'United Arab');
    await user.click(screen.getByRole('button', { name: /united arab emirates/i }));
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(updateClientProfile).toHaveBeenCalledWith('c-1', { phone: '+971 3 111 222' });
  });
});

/*
 * A VERIFIED client (owner, 26 and 28 Sep 2026). A verified detail is edited
 * ON THE CLIENT: by an admin who may correct verified details, with a reason —
 * or it is held, with the server's sentence saying why, in place. Nothing here
 * sends the admin to another screen: that link was reported as a bad
 * experience, and it is gone.
 */
describe('EditClientProfileDialog — a verified client', () => {
  const VERIFIED_HELD =
    'was verified by KYC. Only an admin who may correct verified details can change it.';
  const HELD = {
    ...PROFILE,
    dateOfBirth: null,
    kyc: { status: 'approved', submittedAt: '2026-09-04T00:00:00.000Z' },
    lockedFields: {
      firstName: `First name ${VERIFIED_HELD}`,
      dateOfBirth: `Date of birth ${VERIFIED_HELD}`,
    },
    correctableFields: [],
  } as unknown as ClientProfile;
  const CORRECTABLE = {
    ...PROFILE,
    kyc: { status: 'approved', submittedAt: '2026-09-04T00:00:00.000Z' },
    lockedFields: {},
    correctableFields: ['firstName', 'lastName', 'dateOfBirth', 'nationality', 'country'],
  } as unknown as ClientProfile;

  it('holds verified details for an admin who may not correct — said once, a label under each', async () => {
    renderWithProviders(<EditClientProfileDialog open onClose={vi.fn()} profile={HELD} />);

    expect(
      await screen.findByText(/only an admin who may correct verified details can change them/i),
    ).toBeVisible();
    expect(screen.getAllByText('Verified by KYC')).toHaveLength(2);
    expect(screen.getByLabelText(/^first name/i)).toBeDisabled();
    // The server's own sentence is still there for a screen reader, on the field.
    expect(screen.getByLabelText(/^first name/i)).toHaveAccessibleDescription(
      /First name was verified by KYC/,
    );
    // …and nothing sends the admin elsewhere to edit the client.
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('lets a corrector change a verified detail HERE — the reason is asked for, and sent', async () => {
    session.permissions = ['clients.edit', 'kyc.review', 'kyc.identity.correct'];
    const user = userEvent.setup();
    renderWithProviders(<EditClientProfileDialog open onClose={vi.fn()} profile={CORRECTABLE} />);

    expect(await screen.findByText(/you can correct them here/i)).toBeVisible();
    const surname = screen.getByLabelText(/^last name/i);
    expect(surname).toBeEnabled();
    expect(screen.queryByRole('link')).toBeNull();

    // No reason box until a verified detail changes.
    expect(screen.queryByLabelText(/reason for changing verified details/i)).toBeNull();
    await user.clear(surname);
    await user.type(surname, 'Haddad');
    const save = screen.getByRole('button', { name: /^save$/i });
    expect(save, 'a verified detail was saved without a reason').toBeDisabled();

    await user.type(screen.getByLabelText(/reason for changing verified details/i), ' Typo ');
    expect(save).toBeEnabled();
    await user.click(save);

    expect(updateClientProfile).toHaveBeenCalledWith('c-1', { lastName: 'Haddad', reason: 'Typo' });
  });

  it('asks no reason when only the phone changes — it is contact, not identity', async () => {
    session.permissions = ['clients.edit', 'kyc.identity.correct'];
    const user = userEvent.setup();
    renderWithProviders(<EditClientProfileDialog open onClose={vi.fn()} profile={CORRECTABLE} />);

    const phone = await screen.findByLabelText(/^phone/i);
    await user.clear(phone);
    await user.type(phone, '71 000 111');
    expect(screen.queryByLabelText(/reason for changing verified details/i)).toBeNull();
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(updateClientProfile).toHaveBeenCalledWith('c-1', { phone: '+961 71 000 111' });
  });

  it('puts the server’s refusal of the reason under the reason box', async () => {
    session.permissions = ['clients.edit', 'kyc.identity.correct'];
    updateClientProfile.mockRejectedValueOnce({
      response: {
        status: 400,
        data: {
          code: 'VALIDATION_FAILED',
          message: 'A verified detail changes only with a reason.',
          fields: { reason: 'Give a reason for changing a verified detail.' },
        },
      },
      isAxiosError: true,
    });
    const user = userEvent.setup();
    renderWithProviders(<EditClientProfileDialog open onClose={vi.fn()} profile={CORRECTABLE} />);

    const surname = await screen.findByLabelText(/^last name/i);
    await user.clear(surname);
    await user.type(surname, 'Haddad');
    await user.type(screen.getByLabelText(/reason for changing verified details/i), 'x');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(await screen.findByText('Give a reason for changing a verified detail.')).toBeVisible();
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
