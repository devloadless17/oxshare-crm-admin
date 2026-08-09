import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { SmtpSettingsPanel, parsePort } from './smtp-settings-panel';

/**
 * The Email tab — the SMTP connection settings and nothing else.
 *
 * What is pinned here is the WRITE-ONLY PASSWORD, because the failure mode is
 * silent: the natural implementation sends `password: null` whenever the field
 * is empty, which wipes a working credential every time an operator edits the
 * port. Nothing on screen says so, and the next verification email simply never
 * arrives.
 *
 * The panel was cut back to six fields and Save. The test button, the
 * database-vs-environment banner, the "remove stored password" checkbox and the
 * unsaved-changes warning are gone, and the last block below pins that they
 * stay gone — those were the parts most likely to be reinstated by habit.
 */

const { getSmtpSettings, updateSmtpSettings } = vi.hoisted(() => ({
  getSmtpSettings: vi.fn(),
  updateSmtpSettings: vi.fn(),
}));

vi.mock('@/lib/api/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/admin')>();
  return {
    ...actual,
    adminApi: { ...actual.adminApi, getSmtpSettings, updateSmtpSettings },
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
    Promise.resolve({ ...SAVED, ...body }),
  );
});

/** Waits for the form to have loaded before interacting with it. */
async function renderPanel() {
  // `canManage` is required now: the panel took no permission before, because
  // reaching its tab WAS the permission (master-admin-only).
  renderWithProviders(<SmtpSettingsPanel canManage />);
  await screen.findByLabelText(/^host$/i);
}

describe('every field SMTP needs is on the form', () => {
  it('renders host, port, username, password, from address and TLS', async () => {
    await renderPanel();

    expect(screen.getByLabelText(/^host$/i)).toHaveValue('smtp.saved.test');
    expect(screen.getByLabelText(/^port$/i)).toHaveValue(587);
    expect(screen.getByLabelText(/^username$/i)).toHaveValue('apikey');
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/from address/i)).toHaveValue('"OxShare" <no-reply@oxshare.com>');
    expect(screen.getByLabelText(/implicit tls/i)).not.toBeChecked();
  });

  it('sends all of them on save', async () => {
    await renderPanel();

    await userEvent.type(screen.getByLabelText(/^host$/i), '.uk');
    await userEvent.click(screen.getByRole('button', { name: /save mail settings/i }));

    await waitFor(() => expect(updateSmtpSettings).toHaveBeenCalled());
    const body = updateSmtpSettings.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body).toMatchObject({
      host: 'smtp.saved.test.uk',
      port: 587,
      username: 'apikey',
      fromAddress: '"OxShare" <no-reply@oxshare.com>',
      secure: false,
    });
  });
});

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
  });

  it('says when no password is stored', async () => {
    getSmtpSettings.mockResolvedValue({ ...SAVED, passwordSet: false });
    await renderPanel();

    expect(screen.getByText(/no password is stored/i)).toBeInTheDocument();
  });

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

describe('what the panel deliberately no longer carries', () => {
  // Cut as unwanted scope. Pinned because each one is the kind of thing a later
  // change reinstates by reflex, and the point was to keep this to SMTP itself.
  it('has no test-send button', async () => {
    await renderPanel();

    expect(screen.queryByRole('button', { name: /send test/i })).toBeNull();
  });

  it('has no remove-stored-password control', async () => {
    await renderPanel();

    expect(screen.queryByLabelText(/remove the stored password/i)).toBeNull();
  });

  it('has no source banner, whichever source is live', async () => {
    getSmtpSettings.mockResolvedValue({ ...SAVED, source: 'environment', updatedAt: null });
    await renderPanel();

    expect(screen.queryByText(/nothing has been saved here yet/i)).toBeNull();
    expect(screen.queryByText(/saved settings, last changed/i)).toBeNull();
  });

  it('has no unsaved-changes warning', async () => {
    await renderPanel();

    await userEvent.type(screen.getByLabelText(/^host$/i), '.uk');

    expect(screen.queryByText(/unsaved changes/i)).toBeNull();
  });
});
