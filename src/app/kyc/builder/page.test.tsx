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

/**
 * FR-CORE-15 / FR-IND-03: the identity, selfie, address and personal steps are
 * mandatory. The client portal submits by slug and the FSD's acceptance criteria
 * depend on them, so disabling or deleting one silently breaks onboarding for
 * every new client (DECISIONS D-29).
 *
 * That rule lived only in this screen's own conventions. These tests make it a
 * property of the code.
 */
describe('KYC builder — mandatory step protection', () => {
  it('cannot disable a mandatory step', async () => {
    renderWithProviders(<KycBuilderPage />);
    // Await a step, not the header button: the header renders during loading.
    await screen.findByText('Personal Information');

    // 'personal' is mandatory, so its Disable control is not operable.
    const disables = screen.getAllByRole('button', { name: /^disable$/i });
    expect(disables.length).toBeGreaterThan(0);
    expect(disables[0]).toBeDisabled();
    expect(disables[0]).toHaveAttribute('title', expect.stringMatching(/cannot be disabled/i));
  });

  it('cannot delete a mandatory step', async () => {
    renderWithProviders(<KycBuilderPage />);
    // Await a step, not the header button: the header renders during loading.
    await screen.findByText('Personal Information');

    const deletes = screen.getAllByTitle(/cannot be deleted|delete step/i);
    // Both seeded steps ('personal', 'document') are mandatory, so every delete
    // control is blocked and says why.
    for (const btn of deletes) {
      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute('title', expect.stringMatching(/cannot be deleted/i));
    }
  });

  it('marks mandatory steps in the list so a reviewer can see the rule', async () => {
    renderWithProviders(<KycBuilderPage />);
    // Await a step, not the header button: the header renders during loading.
    await screen.findByText('Personal Information');

    expect(screen.getAllByText(/required/i).length).toBeGreaterThan(0);
  });

  it('allows disabling and deleting a custom step', async () => {
    get.mockResolvedValue({
      data: [
        ...STEPS,
        {
          id: 'step-9',
          stepNumber: 3,
          slug: 'proof-of-income',
          title: 'Proof of Income',
          description: 'Optional extra step.',
          icon: 'FileText',
          enabled: true,
          fields: [],
        },
      ],
    });

    renderWithProviders(<KycBuilderPage />);
    // Await a step, not the header button: the header renders during loading.
    await screen.findByText('Personal Information');

    // The custom step's controls are the only operable ones.
    const enabledDeletes = screen
      .getAllByTitle(/^delete step$/i)
      .filter((b) => !(b as HTMLButtonElement).disabled);
    expect(enabledDeletes.length).toBe(1);

    const enabledDisables = screen
      .getAllByRole('button', { name: /^disable$/i })
      .filter((b) => !(b as HTMLButtonElement).disabled);
    expect(enabledDisables.length).toBe(1);
  });
});

describe('KYC builder — step ordering', () => {
  it('renumbers steps after a move, so stepNumber matches position', async () => {
    const user = userEvent.setup();
    renderWithProviders(<KycBuilderPage />);
    // Await a step, not the header button: the header renders during loading.
    await screen.findByText('Personal Information');

    // Move the second step up, then save and inspect what is sent.
    const downs = screen.getAllByTitle(/move step down/i);
    await user.click(downs[0]!);
    await user.click(screen.getByRole('button', { name: /save all changes/i }));

    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    const [, body] = put.mock.calls[0] as [
      string,
      { steps: { slug: string; stepNumber: number }[] },
    ];

    // The portal routes by stepNumber, so a gap or a duplicate sends a client to a
    // step that does not exist.
    expect(body.steps.map((s) => s.stepNumber)).toEqual([1, 2]);
    expect(body.steps[0]?.slug).toBe('document');
    expect(body.steps[1]?.slug).toBe('personal');
  });
});
