import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import CompleteKycRoute from './page';
import { ALL_PERMISSIONS } from '@/test/permissions';
import { keepDrafts } from '@/components/kyc-assist/unsaved-drafts';

/**
 * "Complete KYC" (backend 0210): staff do a client's KYC for them. The page
 * renders the SERVER's layout and decides nothing, so these pin what the
 * console itself owns: it draws what it was sent, it never shows a value the
 * role hides, it sends only what changed, and a KYC waiting for review is not
 * editable here.
 */

const { getKycAssist, saveKycAssistStep } = vi.hoisted(() => ({
  getKycAssist: vi.fn(),
  saveKycAssistStep: vi.fn(),
}));

vi.mock('@/lib/api', () => {
  const api = { admin: { getKycAssist, saveKycAssistStep } };
  return { api, default: api };
});

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '1000245' }),
  useRouter: () => ({ push: vi.fn() }),
}));

const permissions = { current: ALL_PERMISSIONS };
const operator = { id: 'a-1' };
vi.mock('@/context/AdminAuthContext', () => ({
  useAdmin: () => ({
    admin: {
      get id() {
        return operator.id;
      },
      email: 'staff@oxshare.com',
      name: 'Staff',
      get permissions() {
        return permissions.current;
      },
      createdAt: new Date().toISOString(),
    },
  }),
}));

const page = (over: Record<string, unknown> = {}) => ({
  userId: 1000245,
  status: 'in_progress',
  editable: true,
  complete: false,
  suspended: false,
  personalInfo: { firstName: 'Samir', lastName: 'Khoury', city: 'Beirut' },
  stepData: {},
  maskedFields: ['kyc.personalInfo.phone'],
  steps: [
    {
      slug: 'personal',
      title: 'Personal Information',
      complete: true,
      missing: [],
      returned: [],
      fields: [
        { name: 'firstName', label: 'First Name', type: 'text', required: true, hidden: false },
        { name: 'phone', label: 'Phone Number', type: 'phone', required: true, hidden: true },
        { name: 'city', label: 'City', type: 'text', required: true, hidden: false },
      ],
    },
    {
      slug: 'document',
      title: 'Identity Document',
      complete: false,
      missing: [{ id: 'docType', label: 'Identity document', kind: 'choice' }],
      returned: [],
      fields: [],
      document: {
        category: 'identity',
        optional: false,
        types: [
          {
            value: 'passport',
            label: 'Passport',
            pages: [
              {
                key: 'photo',
                label: 'Photo Page',
                required: true,
                target: { field: 'doc_front', docType: 'passport' },
                returned: false,
              },
            ],
          },
        ],
      },
    },
  ],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  permissions.current = ALL_PERMISSIONS;
  // Unsaved answers live in memory for the whole tab; each case starts with none.
  for (const id of ['a-1', 'a-2']) keepDrafts(id, '1000245', {});
  operator.id = 'a-1';
  getKycAssist.mockResolvedValue(page());
  saveKycAssistStep.mockResolvedValue(page());
});

describe('Complete KYC', () => {
  it('draws the server’s steps and verdict, and hides what the role may not see', async () => {
    renderWithProviders(<CompleteKycRoute />);
    expect(await screen.findByText('Personal Information')).toBeInTheDocument();
    expect(screen.getByText('1 missing')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Passport' })).toBeInTheDocument();
    // The phone never reached the page: shown as hidden, with no box to type into.
    expect(screen.getByText('Hidden from your role')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Phone Number/)).not.toBeInTheDocument();
    // A reviewer may verify in one click, through the review's own approve.
    expect(screen.getByRole('button', { name: 'Submit & approve' })).toBeInTheDocument();
  });

  it('saves only the answers that changed', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CompleteKycRoute />);
    const city = await screen.findByLabelText(/^City/);
    await user.clear(city);
    await user.type(city, 'Tripoli');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(saveKycAssistStep).toHaveBeenCalledTimes(1);
    expect(saveKycAssistStep).toHaveBeenCalledWith('1000245', 'personal', { city: 'Tripoli' });
  });

  it('without kyc.review there is Submit, never Submit & approve', async () => {
    permissions.current = ALL_PERMISSIONS.filter((key) => key !== 'kyc.review');
    renderWithProviders(<CompleteKycRoute />);
    expect(await screen.findByRole('button', { name: 'Submit' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit & approve' })).not.toBeInTheDocument();
  });

  it('a KYC waiting for review is not editable here: it is returned to edit first', async () => {
    getKycAssist.mockResolvedValue(page({ status: 'submitted', editable: false }));
    renderWithProviders(<CompleteKycRoute />);
    expect(await screen.findByText('Waiting for review')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Return to edit' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^City/)).toBeDisabled();
  });

  it('a suspended client’s KYC says so, and nothing on it can be changed', async () => {
    getKycAssist.mockResolvedValue(page({ suspended: true, editable: false }));
    renderWithProviders(<CompleteKycRoute />);
    expect(await screen.findByText('This client is suspended')).toBeInTheDocument();
    expect(screen.getByLabelText(/^City/)).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
  });

  it('answers left unsaved (the Back button) are offered back, and can be discarded', async () => {
    const user = userEvent.setup();
    const first = renderWithProviders(<CompleteKycRoute />);
    const city = await screen.findByLabelText(/^City/);
    await user.clear(city);
    await user.type(city, 'Tripoli');
    // Back is a page change nobody is asked about: the page simply goes.
    first.unmount();

    renderWithProviders(<CompleteKycRoute />);
    expect(await screen.findByText('Your unsaved changes are back')).toBeInTheDocument();
    expect(screen.getByLabelText(/^City/)).toHaveValue('Tripoli');
    await user.click(screen.getByRole('button', { name: 'Discard them' }));
    expect(screen.getByLabelText(/^City/)).toHaveValue('Beirut');
    expect(screen.queryByText('Your unsaved changes are back')).not.toBeInTheDocument();
  });

  it('never offers one operator’s unsaved answers to another', async () => {
    const user = userEvent.setup();
    const first = renderWithProviders(<CompleteKycRoute />);
    const city = await screen.findByLabelText(/^City/);
    await user.clear(city);
    await user.type(city, 'Sidon');
    first.unmount();

    operator.id = 'a-2';
    renderWithProviders(<CompleteKycRoute />);
    expect(await screen.findByLabelText(/^City/)).toHaveValue('Beirut');
    expect(screen.queryByText('Your unsaved changes are back')).not.toBeInTheDocument();
  });

  it('a client this reader cannot see reads exactly as a missing one', async () => {
    getKycAssist.mockRejectedValue({
      response: { status: 404, data: { code: 'NOT_FOUND', message: 'Client not found.' } },
    });
    renderWithProviders(<CompleteKycRoute />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Complete KYC')).not.toBeInTheDocument();
  });
});
