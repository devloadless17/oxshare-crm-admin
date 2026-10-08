import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { NewClientButton } from './new-client-dialog';

/**
 * "New client" (backend 0211). The server judges every value; what the form
 * owns is the wiring: only what was filled is sent, one Idempotency-Key covers
 * every attempt while it is open, a refusal lands under its field, and the main
 * action carries on to Complete KYC.
 */

const { createClient, profileOptions, push } = vi.hoisted(() => ({
  createClient: vi.fn(),
  profileOptions: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@/lib/api', () => {
  const api = { admin: { createClient, profileOptions } };
  return { api, default: api };
});
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
// The real picker is a country list plus a number; a plain box is enough to drive the form.
vi.mock('@/components/ui/phone-input', () => ({
  PhoneInput: (props: { id: string; value: string; onChange: (v: string) => void }) => (
    <input id={props.id} value={props.value} onChange={(e) => props.onChange(e.target.value)} />
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  profileOptions.mockResolvedValue({ countries: ['Lebanon'], nationalities: ['Lebanese'] });
});

async function fill() {
  const user = userEvent.setup();
  renderWithProviders(<NewClientButton />);
  await user.click(screen.getByRole('button', { name: 'New client' }));
  await user.type(screen.getByLabelText(/^Email/), 'samir@example.com');
  await user.type(screen.getByLabelText(/^First name/), 'Samir');
  await user.type(screen.getByLabelText(/^Last name/), 'Khoury');
  await user.type(screen.getByLabelText(/^Date of birth/), '1948-03-02');
  await screen.findByRole('option', { name: 'Lebanese' });
  await user.selectOptions(screen.getByLabelText(/^Nationality/), 'Lebanese');
  // The real picker emits the whole number with its dial code at once.
  await user.click(screen.getByLabelText(/^Phone/));
  await user.paste('+961 70555123');
  await user.selectOptions(screen.getByLabelText(/^Country of residence/), 'Lebanon');
  return user;
}

describe('New client', () => {
  it('sends only what was filled, and goes on to Complete KYC', async () => {
    createClient.mockResolvedValue({ id: 1000300 });
    const user = await fill();
    await user.click(screen.getByRole('button', { name: 'Create and complete KYC' }));

    expect(createClient).toHaveBeenCalledTimes(1);
    const [body, key] = createClient.mock.calls[0] as [Record<string, string>, string];
    expect(body).toEqual({
      email: 'samir@example.com',
      firstName: 'Samir',
      lastName: 'Khoury',
      dateOfBirth: '1948-03-02',
      nationality: 'Lebanese',
      phone: '+961 70555123',
      country: 'Lebanon',
      locale: 'en',
    });
    expect(key).toEqual(expect.any(String));
    expect(push).toHaveBeenCalledWith('/clients/1000300/kyc');
  });

  it('puts a refusal under its field, and a corrected retry keeps the same key', async () => {
    createClient
      .mockRejectedValueOnce({
        response: {
          status: 409,
          data: {
            code: 'PHONE_ALREADY_REGISTERED',
            message: 'Another client already uses this phone number.',
            fields: { phone: 'Another client already uses this phone number.' },
          },
        },
      })
      .mockResolvedValueOnce({ id: 1000301 });
    const user = await fill();
    await user.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByText('Another client already uses this phone number.')).toBeVisible();

    const phone = screen.getByLabelText(/^Phone/);
    await user.clear(phone);
    await user.click(phone);
    await user.paste('+961 70555124');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    expect(createClient).toHaveBeenCalledTimes(2);
    const [first, retry] = createClient.mock.calls as [unknown, string][];
    expect(retry?.[1]).toBe(first?.[1]);
    expect(push).toHaveBeenCalledWith('/clients/1000301');
  });
});
