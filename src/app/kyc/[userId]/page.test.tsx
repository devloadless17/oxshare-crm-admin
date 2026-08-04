import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import KycDetailPage from './page';

/**
 * The KYC review screen — where an admin approves or rejects a client's identity.
 *
 * This is a compliance decision point and it had no tests at all, while being the
 * largest file in the app. What is pinned here is the behaviour a reviewer relies
 * on and that an auditor would ask about:
 *
 *  - a rejection cannot be recorded without a reason (FR-ADM-03);
 *  - what actually goes to the API when one is recorded, including which fields
 *    the client is being asked to re-submit;
 *  - approve requires an explicit confirmation rather than firing on first click;
 *  - a failed action says why, and does not leave the screen looking successful.
 */

const { get, patch, getRejectionReasons } = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  getRejectionReasons: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  default: { get, patch, admin: { getRejectionReasons } },
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ userId: 'u-1' }),
}));

const SUBMISSION = {
  userId: 'u-1',
  status: 'submitted',
  submittedAt: '2026-08-03T15:00:21.792Z',
  user: { email: 'client@oxshare.com', firstName: 'John', lastName: 'Doe' },
  personalInfo: { firstName: 'John', lastName: 'Doe', country: 'UAE' },
  document: { docType: 'passport', frontFilePath: '/uploads/kyc/front.png' },
  selfie: { filePath: '/uploads/kyc/selfie.png' },
  addressProof: { docType: 'utility_bill', filePath: '/uploads/kyc/address.png' },
};

const REASONS = [
  { id: 'r-1', context: 'kyc', label: 'Document expired', createdAt: '2026-08-01T00:00:00.000Z' },
  { id: 'r-2', context: 'kyc', label: 'Image unreadable', createdAt: '2026-08-01T00:00:00.000Z' },
];

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue({ data: SUBMISSION });
  patch.mockResolvedValue({ data: {} });
  getRejectionReasons.mockResolvedValue(REASONS);
});

async function openRejectDialog() {
  const user = userEvent.setup();
  renderWithProviders(<KycDetailPage />);
  await user.click(await screen.findByRole('button', { name: /reject kyc submission/i }));
  return user;
}

describe('KYC review — rejection requires a reason', () => {
  it('disables Confirm Rejection until a reason or a note is given', async () => {
    await openRejectDialog();

    const confirm = await screen.findByRole('button', { name: /confirm rejection/i });
    // FR-ADM-03: a rejection with no recorded reason is not reviewable later, and
    // the client has nothing to act on.
    expect(confirm).toBeDisabled();
  });

  it('enables Confirm once free-text is typed, and sends it', async () => {
    const user = await openRejectDialog();

    await user.type(
      await screen.findByPlaceholderText(/passport image is blurry/i),
      'Date of birth does not match the document',
    );

    const confirm = screen.getByRole('button', { name: /confirm rejection/i });
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    const [url, body] = patch.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe('/admin/kyc/u-1/reject');
    expect(body.reason).toBe('Date of birth does not match the document');
    // No configured reason was picked, so the field is omitted rather than sent empty.
    expect(body.reasonId).toBeUndefined();
  });

  it('records which fields the client must re-submit', async () => {
    const user = await openRejectDialog();

    await user.type(await screen.findByPlaceholderText(/passport image is blurry/i), 'Blurry');
    // Tick the first field checkbox the reviewer can choose.
    const boxes = screen.getAllByRole('checkbox');
    await user.click(boxes[0]!);

    await user.click(screen.getByRole('button', { name: /confirm rejection/i }));

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    const [, body] = patch.mock.calls[0] as [string, { rejectedFields?: string[] }];
    expect(body.rejectedFields?.length).toBe(1);
  });

  it('surfaces the API message when the rejection fails', async () => {
    patch.mockRejectedValueOnce(
      Object.assign(new Error('Request failed with status code 409'), {
        response: { data: { message: 'Submission already reviewed by another admin.' } },
      }),
    );
    const user = await openRejectDialog();

    await user.type(await screen.findByPlaceholderText(/passport image is blurry/i), 'Blurry');
    await user.click(screen.getByRole('button', { name: /confirm rejection/i }));

    expect(await screen.findByText(/already reviewed by another admin/i)).toBeInTheDocument();
  });
});

describe('KYC review — approval', () => {
  it('asks for confirmation instead of approving on the first click', async () => {
    const user = userEvent.setup();
    renderWithProviders(<KycDetailPage />);

    await user.click(await screen.findByRole('button', { name: /approve kyc submission/i }));

    // Approving is irreversible from this screen, so the first click opens a
    // confirmation rather than calling the API.
    expect(patch).not.toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: /confirm approval/i })).toBeInTheDocument();
  });

  it('approves only after the confirmation is accepted', async () => {
    const user = userEvent.setup();
    renderWithProviders(<KycDetailPage />);

    await user.click(await screen.findByRole('button', { name: /approve kyc submission/i }));
    await user.click(await screen.findByRole('button', { name: /confirm approval/i }));

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(patch.mock.calls[0]?.[0]).toBe('/admin/kyc/u-1/approve');
  });

  it('reports a failed approval rather than closing quietly', async () => {
    patch.mockRejectedValueOnce(
      Object.assign(new Error('Request failed with status code 403'), {
        response: { data: { message: 'Claim the submission before approving it.' } },
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<KycDetailPage />);

    await user.click(await screen.findByRole('button', { name: /approve kyc submission/i }));
    await user.click(await screen.findByRole('button', { name: /confirm approval/i }));

    expect(await screen.findByText(/claim the submission before approving/i)).toBeInTheDocument();
  });
});

describe('KYC review — claiming', () => {
  it('claims the submission for the current reviewer', async () => {
    const user = userEvent.setup();
    renderWithProviders(<KycDetailPage />);

    await user.click(await screen.findByRole('button', { name: /claim for review/i }));

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(patch.mock.calls[0]?.[0]).toBe('/admin/kyc/u-1/claim');
  });
});

describe('KYC review — load states', () => {
  it('offers a retry when the submission cannot be loaded', async () => {
    get.mockRejectedValue(
      Object.assign(new Error('boom'), { response: { status: 500, data: {} } }),
    );
    renderWithProviders(<KycDetailPage />);

    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('says a missing submission is missing, not broken', async () => {
    get.mockRejectedValue(
      Object.assign(new Error('not found'), { response: { status: 404, data: {} } }),
    );
    renderWithProviders(<KycDetailPage />);

    expect(await screen.findByText(/submission not found/i)).toBeInTheDocument();
  });

  it('hides review actions for a submission that is already decided', async () => {
    get.mockResolvedValue({ data: { ...SUBMISSION, status: 'approved' } });
    renderWithProviders(<KycDetailPage />);

    await screen.findByText(/client@oxshare\.com/i);
    // Re-approving or re-rejecting a decided submission is not offered.
    expect(screen.queryByRole('button', { name: /approve kyc submission/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /reject kyc submission/i })).toBeNull();
  });
});
