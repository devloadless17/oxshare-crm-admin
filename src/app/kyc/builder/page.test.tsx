import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import KycBuilderPage, { type KycStepConfig } from './page';

/**
 * Guards the payload shape of `PUT /admin/kyc-config`.
 *
 * This screen shipped sending the bare `steps` array where the endpoint takes
 * `{ steps }`, so "Save All Changes" returned 400 for every user of the KYC step
 * configurator. It stayed invisible because the catch block discarded the error
 * and rendered a fixed "Error saving configuration." string, which read like a
 * server fault rather than a client bug.
 *
 * Type-checking cannot catch it: `api.put` takes an unknown body, and the
 * generated request type is not applied at the call site. Only an assertion on
 * what actually goes over the wire does.
 */

const { get, put, post } = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  post: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  default: { get, put, post },
}));

const STEPS: KycStepConfig[] = [
  {
    id: 'step-1',
    stepNumber: 1,
    slug: 'personal',
    title: 'Personal Information',
    description: 'Legal identity details.',
    icon: 'User',
    enabled: true,
    fields: [{ id: 'f-1', name: 'firstName', label: 'First Name', type: 'text', required: true }],
  },
  {
    id: 'step-2',
    stepNumber: 2,
    slug: 'document',
    title: 'Identity Document',
    description: 'Government photo ID.',
    icon: 'FileText',
    enabled: true,
    fields: [],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue({ data: STEPS });
  put.mockResolvedValue({ data: STEPS });
});

describe('KYC builder — save payload', () => {
  it('wraps the steps array in { steps }, not sending it bare', async () => {
    const user = userEvent.setup();
    renderWithProviders(<KycBuilderPage />);

    const save = await screen.findByRole('button', { name: /save all changes/i });
    await user.click(save);

    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));

    const [url, body] = put.mock.calls[0] as [string, unknown];
    expect(url).toBe('/admin/kyc-config');

    // The assertion that matters. A bare array here is the bug.
    expect(Array.isArray(body)).toBe(false);
    expect(body).toEqual({ steps: STEPS });
  });

  it('surfaces the API message on failure instead of a fixed string', async () => {
    // What the endpoint actually answered while the bug was live.
    put.mockRejectedValueOnce({
      response: { data: { message: ['steps must be an array'] } },
    });

    const user = userEvent.setup();
    renderWithProviders(<KycBuilderPage />);

    await user.click(await screen.findByRole('button', { name: /save all changes/i }));

    // A blind catch is what let the payload bug survive, so the real reason has
    // to reach the screen.
    expect(await screen.findByText(/steps must be an array/i)).toBeInTheDocument();
  });

  it('reports success only after the request resolves', async () => {
    const user = userEvent.setup();
    renderWithProviders(<KycBuilderPage />);

    await user.click(await screen.findByRole('button', { name: /save all changes/i }));

    expect(await screen.findByText(/updated successfully/i)).toBeInTheDocument();
  });
});
