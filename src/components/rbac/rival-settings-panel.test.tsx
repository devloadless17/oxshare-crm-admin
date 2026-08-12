import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { RivalSettingsPanel } from './rival-settings-panel';

/**
 * The Payments tab — the Rival connection.
 *
 * Two behaviours carry the weight:
 *
 *  - THE THREE-STATE API KEY (the SMTP password's defect class): an untouched
 *    field must send `undefined`, because sending anything else silently wipes
 *    the credential the whole payments pipe authenticates with.
 *  - THE SHOWN-ONCE WEBHOOK KEY: the mint modal is the only place the
 *    plaintext ever exists, so the flow around it — appears with the key,
 *    closes, and only the fingerprint remains — is the contract.
 */

const { getRivalSettings, updateRivalSettings, mintRivalWebhookKey, testRivalConnection } =
  vi.hoisted(() => ({
    getRivalSettings: vi.fn(),
    updateRivalSettings: vi.fn(),
    mintRivalWebhookKey: vi.fn(),
    testRivalConnection: vi.fn(),
  }));

vi.mock('@/lib/api/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/admin')>();
  return {
    ...actual,
    adminApi: {
      ...actual.adminApi,
      getRivalSettings,
      updateRivalSettings,
      mintRivalWebhookKey,
      testRivalConnection,
    },
  };
});

const SAVED = {
  baseUrl: 'https://portal.rivalpayments.test/v1',
  apiKeySet: true,
  webhookKeyFingerprint: '3fa1b2c4',
  enabled: true,
  lastEventAt: '2026-08-12T10:00:00.000Z',
  source: 'database' as const,
  webhookEndpoint: 'https://api.oxshare.test/v1/payments/rival/webhook',
  updatedAt: '2026-08-12T09:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  getRivalSettings.mockResolvedValue(SAVED);
  updateRivalSettings.mockImplementation((body: Record<string, unknown>) =>
    Promise.resolve({ ...SAVED, ...body }),
  );
});

describe('the three-state API key', () => {
  it('an untouched key field sends undefined — the stored key survives a toggle', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RivalSettingsPanel canManage />);

    // Flip `enabled` only; never type into the key field.
    const toggle = await screen.findByLabelText(/route deposits and payouts/i);
    await user.click(toggle);
    await user.click(screen.getByRole('button', { name: /save connection/i }));

    await waitFor(() => expect(updateRivalSettings).toHaveBeenCalledTimes(1));
    const body = updateRivalSettings.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body.enabled).toBe(false);
    // The load-bearing assertion: the KEY of the payments pipe was not touched.
    expect(body.apiKey).toBeUndefined();
  });

  it('a typed key is sent, and the field empties again after saving', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RivalSettingsPanel canManage />);

    const keyField = await screen.findByLabelText(/company api key/i);
    await user.type(keyField, 'tsk_new_key');
    await user.click(screen.getByRole('button', { name: /save connection/i }));

    await waitFor(() => expect(updateRivalSettings).toHaveBeenCalledTimes(1));
    expect((updateRivalSettings.mock.calls[0]?.[0] as { apiKey: string }).apiKey).toBe(
      'tsk_new_key',
    );
    // Never re-rendered as dots: the stored key is not readable, and a field
    // that looks editable-in-place would be lying about that.
    await waitFor(() => expect(keyField).toHaveValue(''));
  });

  it('says a key is stored, without ever containing it', async () => {
    renderWithProviders(<RivalSettingsPanel canManage />);
    expect(await screen.findByText(/a key is stored/i)).toBeInTheDocument();
  });

  it('read-only holders get disabled fields, not a form that 403s on save', async () => {
    renderWithProviders(<RivalSettingsPanel canManage={false} />);
    expect(await screen.findByLabelText(/company api key/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /save connection/i })).toBeDisabled();
  });
});

describe('the shown-once webhook key', () => {
  it('mints, shows the plaintext once in the modal, and closing leaves only the fingerprint', async () => {
    mintRivalWebhookKey.mockResolvedValue({
      webhookKey: 'whk_shown_exactly_once_abcdef',
      fingerprint: 'deadbeef',
      endpoint: SAVED.webhookEndpoint,
    });
    const user = userEvent.setup();
    renderWithProviders(<RivalSettingsPanel canManage />);

    await user.click(await screen.findByRole('button', { name: /rotate webhook key/i }));

    // The one appearance of the plaintext.
    expect(await screen.findByText('whk_shown_exactly_once_abcdef')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /i have pasted it into rival/i }));
    await waitFor(() =>
      expect(screen.queryByText('whk_shown_exactly_once_abcdef')).not.toBeInTheDocument(),
    );
  });

  it('warns that rotating cuts over immediately when a key already exists', async () => {
    renderWithProviders(<RivalSettingsPanel canManage />);
    expect(await screen.findByText(/rotating cuts over immediately/i)).toBeInTheDocument();
  });

  it('shows the endpoint to paste and the liveness stamp', async () => {
    renderWithProviders(<RivalSettingsPanel canManage />);
    expect(
      await screen.findByText('https://api.oxshare.test/v1/payments/rival/webhook'),
    ).toBeInTheDocument();
    expect(screen.getByText(/last event received/i)).toBeInTheDocument();
  });
});

describe('test connection', () => {
  it('reports agreement between the two sides in one sentence', async () => {
    testRivalConnection.mockResolvedValue({
      ok: true,
      rivalCrmConfig: { apiUrl: SAVED.webhookEndpoint, hasApiKey: true, enabled: true },
      expectedApiUrl: SAVED.webhookEndpoint,
    });
    const user = userEvent.setup();
    renderWithProviders(<RivalSettingsPanel canManage />);

    await user.click(await screen.findByRole('button', { name: /test connection/i }));
    expect(await screen.findByText(/both sides agree/i)).toBeInTheDocument();
  });

  it('names both URLs when the sides disagree — the actionable half', async () => {
    testRivalConnection.mockResolvedValue({
      ok: true,
      rivalCrmConfig: { apiUrl: 'https://old.example/hook', hasApiKey: true, enabled: true },
      expectedApiUrl: SAVED.webhookEndpoint,
    });
    const user = userEvent.setup();
    renderWithProviders(<RivalSettingsPanel canManage />);

    await user.click(await screen.findByRole('button', { name: /test connection/i }));
    const verdict = await screen.findByText(/disagree about the webhook/i);
    expect(verdict.textContent).toContain('https://old.example/hook');
    expect(verdict.textContent).toContain(SAVED.webhookEndpoint);
  });
});
