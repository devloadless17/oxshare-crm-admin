import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { ALL_PERMISSIONS } from '@/test/permissions';
import KycBuilderPage, { type KycFieldConfig, type KycStepConfig } from './page';

/**
 * The KYC builder (the identity core, 26 Sep 2026).
 *
 * The report behind it: deleting First Name from Personal Information and
 * adding it back made a CUSTOM box, and the client's real first name stopped
 * being asked. The client's identity, the four built-in steps and the identity
 * and address documents are the platform's now — served marked `system` /
 * `core`, rendered locked — and everything else is the broker's. These cases
 * pin both halves, and the save: `{ steps }` with the version it was read at,
 * each refusal under the step or field it names, a stale save reported rather
 * than silently overwriting somebody else's.
 */

const { get, put, post } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => {
  const api = { get, put, post };
  return { api, default: api };
});

const permissions = { current: ALL_PERMISSIONS };
vi.mock('@/context/AdminAuthContext', () => ({
  useAdmin: () => ({
    admin: {
      id: 'a-1',
      email: 'admin@oxshare.com',
      name: 'Admin',
      role: 'sub_admin',
      get permissions() {
        return permissions.current;
      },
      createdAt: new Date().toISOString(),
    },
  }),
}));

const identity = (name: string, label: string, required = true): KycFieldConfig => ({
  id: `f-${name}`,
  name,
  label,
  type: 'text',
  required,
  system: true,
});

const STEPS: KycStepConfig[] = [
  {
    id: 'step-1',
    stepNumber: 1,
    slug: 'personal',
    title: 'Personal Information',
    description: 'Legal identity details.',
    icon: 'User',
    enabled: true,
    core: true,
    alwaysOn: true,
    fields: [
      identity('firstName', 'First Name'),
      identity('lastName', 'Last Name'),
      identity('postalCode', 'Postal / ZIP code', false),
      { id: 'q-1', name: 'customField_1', label: 'Occupation', type: 'text', required: true },
    ],
  },
  {
    id: 'step-2',
    stepNumber: 2,
    slug: 'document',
    title: 'Identity Document',
    description: '',
    icon: 'FileText',
    enabled: true,
    core: true,
    alwaysOn: true,
    fields: [
      {
        id: 'f-doc-passport',
        name: 'passport',
        label: 'Passport',
        type: 'doc:passport',
        required: false,
      },
    ],
  },
  {
    id: 'step-3',
    stepNumber: 3,
    slug: 'selfie',
    title: 'Selfie Verification',
    description: '',
    icon: 'Camera',
    enabled: true,
    core: true,
    alwaysOn: false,
    fields: [{ ...identity('selfie', 'Selfie Photo'), type: 'camera' }],
  },
  {
    id: 'step-9',
    stepNumber: 4,
    slug: 'source-of-funds',
    title: 'Source of funds',
    description: '',
    icon: 'FileText',
    enabled: true,
    core: false,
    alwaysOn: false,
    fields: [
      { id: 'q-2', name: 'customField_2', label: 'Employer', type: 'text', required: false },
      { id: 'q-3', name: 'customField_3', label: 'Fund source', type: 'select', required: false },
    ],
  },
];

const CATALOGUE = [
  {
    value: 'passport',
    label: 'Passport',
    category: 'identity',
    parts: [{ key: 'front', label: 'Photo Page', required: true }],
  },
  {
    value: 'national_id',
    label: 'National ID',
    category: 'identity',
    parts: [
      { key: 'front', label: 'Front Side', required: true },
      { key: 'back', label: 'Back Side', required: true },
    ],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  permissions.current = ALL_PERMISSIONS;
  get.mockImplementation((url: string) =>
    Promise.resolve(
      url.includes('document-catalogue')
        ? { data: CATALOGUE, headers: {} }
        : { data: structuredClone(STEPS), headers: { etag: '"v1"' } },
    ),
  );
  put.mockResolvedValue({ data: STEPS });
  post.mockResolvedValue({ data: STEPS });
});

async function openStepTab(title: string) {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('tab', { name: new RegExp(title, 'i') }));
  return user;
}

const saveButton = () => screen.getByRole('button', { name: /save all changes/i });
const sentSteps = () => (put.mock.calls[0]?.[1] as { steps: KycStepConfig[] }).steps;

describe('the client’s identity is the platform’s', () => {
  it('THE REPORTED CASE: First Name has no control that could remove or rename it', async () => {
    renderWithProviders(<KycBuilderPage />);
    await openStepTab('Personal Information');
    const block = screen.getByRole('region', { name: /client's identity/i });
    expect(within(block).getByText('First Name')).toBeInTheDocument();
    expect(within(block).queryByRole('textbox')).toBeNull();
    expect(within(block).queryByRole('button')).toBeNull();
    // The broker's own question is editable, beside it.
    expect(screen.getByDisplayValue('Occupation')).toBeEnabled();
  });

  it('adds a QUESTION of the broker’s own — never an upload — under a generated key', async () => {
    renderWithProviders(<KycBuilderPage />);
    const user = await openStepTab('Personal Information');
    await user.click(screen.getByRole('button', { name: /add question/i }));
    await user.click(saveButton());
    await waitFor(() => expect(put).toHaveBeenCalled());
    const added = sentSteps()[0]?.fields.at(-1);
    expect(added).toMatchObject({ type: 'text', required: false });
    expect(added?.name).toMatch(/^customField_\d+$/);
  });

  it('keeps Personal Information first — its row does not move, and nothing moves above it', async () => {
    renderWithProviders(<KycBuilderPage />);
    const handle = await screen.findByRole('button', {
      name: /reorder step personal information/i,
    });
    expect(handle).toBeDisabled();
    expect(screen.getByRole('button', { name: /move identity document up/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /move selfie verification up/i })).toBeEnabled();
  });

  it('lists only the broker’s own fields, summarising the identity in one line', async () => {
    renderWithProviders(<KycBuilderPage />);
    expect(await screen.findByText(/3 fields, fixed by the platform/i)).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByText('Occupation')).toBeInTheDocument();
    expect(within(table).queryByText('First Name')).toBeNull();
    // A drop-down with no choices renders empty for the client.
    expect(within(table).getByText(/no choices/i)).toBeInTheDocument();
  });
});

describe('the built-in steps', () => {
  it('Identity Document is a checklist, with its last document kept ticked', async () => {
    renderWithProviders(<KycBuilderPage />);
    await openStepTab('Identity Document');
    expect(screen.getByRole('checkbox', { name: 'Passport' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'National ID' })).not.toBeChecked();
    expect(screen.queryByRole('button', { name: /^disable$/i })).toBeNull();
  });

  it('Selfie can be switched off, and no built-in step can be deleted', async () => {
    renderWithProviders(<KycBuilderPage />);
    const user = await openStepTab('Selfie Verification');
    expect(screen.queryByRole('button', { name: /delete step/i })).toBeNull();
    await user.click(screen.getByRole('button', { name: /^disable$/i }));
    await user.click(saveButton());
    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(sentSteps().find((step) => step.slug === 'selfie')?.enabled).toBe(false);
  });
});

describe('the broker’s own steps', () => {
  it('adds one WITHOUT an address — the server makes it from the name', async () => {
    renderWithProviders(<KycBuilderPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /add custom step/i }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByLabelText(/slug/i)).toBeNull();
    await user.type(within(dialog).getByLabelText(/step title/i), 'Tax residency');
    await user.click(within(dialog).getByRole('button', { name: /add step/i }));
    await user.click(saveButton());
    await waitFor(() => expect(put).toHaveBeenCalled());
    const added = sentSteps().at(-1);
    expect(added).toMatchObject({ title: 'Tax residency', stepNumber: 5 });
    expect(added).not.toHaveProperty('slug');
  });

  it('deletes one after a confirmation', async () => {
    renderWithProviders(<KycBuilderPage />);
    const user = await openStepTab('Source of funds');
    await user.click(screen.getByRole('button', { name: /delete step source of funds/i }));
    await user.click(await screen.findByRole('button', { name: /^delete$/i }));
    await user.click(saveButton());
    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(sentSteps().map((step) => step.slug)).toEqual(['personal', 'document', 'selfie']);
  });

  it('offers adding and deleting steps only to whoever holds kyc.create / kyc.delete', async () => {
    permissions.current = ['kyc.view', 'kyc.edit'];
    renderWithProviders(<KycBuilderPage />);
    await openStepTab('Source of funds');
    expect(screen.queryByRole('button', { name: /add custom step/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /delete step/i })).toBeNull();
  });
});

describe('the save', () => {
  it('sends { steps } with the version it was read at, and only once something changed', async () => {
    renderWithProviders(<KycBuilderPage />);
    const user = await openStepTab('Source of funds');
    expect(saveButton()).toBeDisabled();
    await user.type(screen.getByDisplayValue('Employer'), ' name');
    await user.click(saveButton());
    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(put.mock.calls[0]?.[0]).toBe('/admin/kyc-config');
    expect(put.mock.calls[0]?.[2]).toEqual({ headers: { 'If-Match': '"v1"' } });
    expect(sentSteps().at(-1)?.fields[0]?.label).toBe('Employer name');
  });

  it('puts a refusal under the field it names, and opens its step', async () => {
    put.mockRejectedValueOnce({
      response: {
        status: 400,
        data: {
          code: 'VALIDATION_FAILED',
          message: '"First name" is already collected by the platform (First Name).',
          fields: {
            'steps.3.fields.0': '"First name" is already collected by the platform (First Name).',
          },
        },
      },
    });
    renderWithProviders(<KycBuilderPage />);
    const user = await openStepTab('Source of funds');
    const box = screen.getByDisplayValue('Employer');
    await user.clear(box);
    await user.type(box, 'First name');
    await openStepTab('Overview');
    await user.click(saveButton());
    expect(await screen.findByText(/already collected by the platform/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('First name')).toHaveAttribute('aria-invalid', 'true');
  });

  it('says so when somebody else changed the form — and reloads rather than overwriting', async () => {
    put.mockRejectedValueOnce({
      response: { status: 409, data: { code: 'KYC_CONFIG_STALE', message: 'stale' } },
    });
    renderWithProviders(<KycBuilderPage />);
    const user = await openStepTab('Source of funds');
    await user.type(screen.getByDisplayValue('Employer'), '!');
    await user.click(saveButton());
    expect(await screen.findByText(/someone else changed this form/i)).toBeInTheDocument();
    const reads = get.mock.calls.filter(([url]) => !String(url).includes('catalogue')).length;
    await user.click(screen.getByRole('button', { name: /reload/i }));
    await waitFor(() =>
      expect(get.mock.calls.filter(([url]) => !String(url).includes('catalogue')).length).toBe(
        reads + 1,
      ),
    );
    expect(screen.getByDisplayValue('Employer')).toBeInTheDocument();
  });

  it('resets to the defaults after a confirmation', async () => {
    renderWithProviders(<KycBuilderPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /reset defaults/i }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: /reset defaults/i }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/kyc-config/reset'));
  });
});

describe('the options box holds its own text', () => {
  it('keeps a trailing comma and space visible while typing', async () => {
    renderWithProviders(<KycBuilderPage />);
    const user = await openStepTab('Source of funds');
    const box = screen.getByLabelText(/dropdown choices/i);
    await user.type(box, 'Salary, ');
    expect(box).toHaveValue('Salary, ');
  });
});
