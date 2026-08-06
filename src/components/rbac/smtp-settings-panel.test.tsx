import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { SmtpSettingsPanel, parsePort } from './smtp-settings-panel';

/**
 * The Email tab.
 *
 * What is pinned here is the THREE-STATE PASSWORD, because the failure mode is
 * silent: the natural implementation sends `password: null` whenever the field
 * is empty, which wipes a working credential every time an operator edits the
 * port. Nothing on screen says so, and the next verification email simply never
 * arrives.
 */

const { getSmtpSettings, updateSmtpSettings, sendSmtpTest } = vi.hoisted(() => ({
  getSmtpSettings: vi.fn(),
  updateSmtpSettings: vi.fn(),
  sendSmtpTest: vi.fn(),
}));

vi.mock('@/lib/api/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/admin')>();
  return {
    ...actual,
    adminApi: { ...actual.adminApi, getSmtpSettings, updateSmtpSettings, sendSmtpTest },
  };
});

const SAVED = {
  host: 'smtp.saved.test',
  port: 587,
  username: 'apikey',
  passwordSet: true,
  fromAddress: '"OxShare" <no-reply@oxshare.com>',
  secure: false,
  source: 'database' as const,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  getSmtpSettings.mockResolvedValue(SAVED);
  updateSmtpSettings.mockImplementation((body: Record<string, unknown>) =>
    Promise.resolve({ ...SAVED, ...body, passwordSet: body['password'] !== '' }),
  );
});

/** Waits for the form to have loaded before interacting with it. */
async function renderPanel() {
  renderWithProviders(<SmtpSettingsPanel />);
  await screen.findByLabelText(/^host$/i);
}

describe('the password is write-only', () => {
  it('never prefills the password field', async () => {
    // The API does not return it, so there is nothing to prefill. Rendering dots
    // would imply a value the operator can edit in place, when anything they
    // type REPLACES it.
    await renderPanel();

    expect(screen.getByLabelText(/^password$/i)).toHaveValue('');
  });

  it('says a password is stored without showing it', async () => {
    await renderPanel();

    expect(screen.getByText(/a password is stored/i)).toBeInTheDocument();
    expect(screen.getByText(/never shown again/i)).toBeInTheDocument();
  });

  it('says when no password is stored', async () => {
    getSmtpSettings.mockResolvedValue({ ...SAVED, passwordSet: false });
    await renderPanel();

    expect(screen.getByText(/no password is stored/i)).toBeInTheDocument();
    // Nothing to remove, so the remove control is not offered.
    expect(screen.queryByLabelText(/remove the stored password/i)).toBeNull();
  });
});

describe('the three states a save can carry', () => {
  it('OMITS password when the field is left empty', async () => {
    // The state that matters. Editing the port must not touch the credential.
    await renderPanel();

    await userEvent.clear(screen.getByLabelText(/^port$/i));
    await userEvent.type(screen.getByLabelText(/^port$/i), '2525');
    await userEvent.click(screen.getByRole('button', { name: /save mail settings/i }));

    await waitFor(() => expect(updateSmtpSettings).toHaveBeenCalled());
    const body = updateSmtpSettings.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body['password']).toBeUndefined();
    expect(body['port']).toBe(2525);
  });

  it('sends the new password when one is typed', async () => {
    await renderPanel();

    await userEvent.type(screen.getByLabelText(/^password$/i), 'new-secret');
    await userEvent.click(screen.getByRole('button', { name: /save mail settings/i }));

    await waitFor(() => expect(updateSmtpSettings).toHaveBeenCalled());
    const body = updateSmtpSettings.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body['password']).toBe('new-secret');
  });

  it('sends an empty string when the remove box is ticked', async () => {
    await renderPanel();

    await userEvent.click(screen.getByLabelText(/remove the stored password/i));
    await userEvent.click(screen.getByRole('button', { name: /save mail settings/i }));

    await waitFor(() => expect(updateSmtpSettings).toHaveBeenCalled());
    const body = updateSmtpSettings.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body['password']).toBe('');
  });

  it('disables the password field while remove is ticked', async () => {
    // The two are contradictory instructions. Letting both be expressed at once
    // means the code has to pick a winner, and the operator cannot tell which.
    await renderPanel();

    await userEvent.type(screen.getByLabelText(/^password$/i), 'typed');
    await userEvent.click(screen.getByLabelText(/remove the stored password/i));

    const field = screen.getByLabelText(/^password$/i);
    expect(field).toBeDisabled();
    expect(field).toHaveValue('');
  });
});

describe('the save button', () => {
  it('is disabled until something changes', async () => {
    await renderPanel();

    expect(screen.getByRole('button', { name: /save mail settings/i })).toBeDisabled();
  });

  it('enables once a field is edited', async () => {
    await renderPanel();

    await userEvent.type(screen.getByLabelText(/^host$/i), '.uk');

    expect(screen.getByRole('button', { name: /save mail settings/i })).toBeEnabled();
  });

  it('makes no request at all when the port is left empty', async () => {
    /*
     * `port` is a `required` `type="number"` input, so the BROWSER refuses the
     * submit before any handler runs — the trap admin/CLAUDE.md names: a page's
     * own validation branch is unreachable through the UI, so the honest
     * assertion is "no request was made" rather than a message.
     *
     * `parsePort` still refuses to guess (it returns NaN rather than falling
     * back to 587, which `Number(x) || 587` would do silently), and that is
     * covered as a unit below. This test pins the layer above it: an empty port
     * never reaches the network.
     */
    await renderPanel();

    await userEvent.clear(screen.getByLabelText(/^port$/i));
    await userEvent.type(screen.getByLabelText(/^host$/i), '.uk');
    await userEvent.click(screen.getByRole('button', { name: /save mail settings/i }));

    expect(updateSmtpSettings).not.toHaveBeenCalled();
  });
});

describe('parsePort refuses to guess', () => {
  /*
   * The idiom this exists to avoid is `Number(raw) || 587`, which turns every
   * bad input into a plausible default nobody chose — on a field that decides
   * whether mail is delivered at all. NaN fails the server's `@IsInt()` and
   * comes back naming the field.
   */
  it('parses a plain number', () => {
    expect(parsePort('587')).toBe(587);
    expect(parsePort('  2525  ')).toBe(2525);
  });

  it('returns NaN rather than a fallback for anything else', () => {
    for (const bad of ['', '   ', 'abc', '58a7', '58.7', '-1', '+587', '0x1f']) {
      expect(Number.isNaN(parsePort(bad)), `expected NaN for ${JSON.stringify(bad)}`).toBe(true);
    }
  });
});

describe('which configuration is live', () => {
  it('warns when nothing has been saved yet', async () => {
    // The form is prefilled from the server's start-up settings rather than left
    // blank, so without this line that reads as "already saved".
    getSmtpSettings.mockResolvedValue({ ...SAVED, source: 'environment', updatedAt: null });
    await renderPanel();

    expect(screen.getByText(/nothing has been saved here yet/i)).toBeInTheDocument();
  });

  it('reports saved settings once a row exists', async () => {
    await renderPanel();

    expect(screen.getByText(/saved settings, last changed/i)).toBeInTheDocument();
  });
});

describe('the test send', () => {
  it('surfaces the mail server’s own error', async () => {
    // "535 Authentication failed" is the entire value of the button; a generic
    // failure message would waste it.
    sendSmtpTest.mockRejectedValue(new Error('535 Authentication failed'));
    await renderPanel();

    await userEvent.click(screen.getByRole('button', { name: /send test email/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/535 Authentication failed/i);
  });

  it('reports success with the address it reached', async () => {
    sendSmtpTest.mockResolvedValue({ sentTo: 'admin@oxshare.com', source: 'database' });
    await renderPanel();

    await userEvent.click(screen.getByRole('button', { name: /send test email/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(/admin@oxshare\.com/);
  });

  it('warns that a test uses the SAVED settings when there are unsaved edits', async () => {
    // The endpoint reads the stored row, so testing with unsaved edits would
    // report on a configuration the operator is not looking at.
    await renderPanel();
    expect(screen.queryByText(/unsaved changes/i)).toBeNull();

    await userEvent.type(screen.getByLabelText(/^host$/i), '.uk');

    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
  });
});
