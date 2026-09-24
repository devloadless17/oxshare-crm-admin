import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { ALL_PERMISSIONS } from '@/test/permissions';
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

/*
 * The page now gates its write controls on the viewer's permissions (credit,
 * close / approve, reject, claim). These tests are about the screen's
 * behaviour, not about gating, so the viewer holds every key — the gating
 * itself is asserted where the `ALL_PERMISSIONS` fixture is narrowed.
 */
vi.mock('@/context/AdminAuthContext', () => ({
  useAdmin: () => ({
    admin: {
      id: 'a-1',
      email: 'admin@oxshare.com',
      name: 'Master Admin',
      role: 'master_admin',
      status: 'active',
      /*
       * MUTABLE, via a getter, so a case can narrow the viewer without a second
       * mock — the same shape `clients/page.test.tsx` uses. It was a constant
       * until the identity-correction control landed, which is the first thing
       * on this screen gated on a key a reviewer may legitimately NOT hold.
       */
      get permissions() {
        return permissions.current;
      },
      createdAt: new Date().toISOString(),
    },
  }),
}));

const permissions = { current: ALL_PERMISSIONS };

vi.mock('next/navigation', () => ({
  // The route carries the Portal ID, as every console link builds it — and
  // the API is called with it as-is (`ClientRefPipe` resolves it server-side).
  useParams: () => ({ userId: '1000245' }),
}));

const SUBMISSION = {
  userId: '0b7d3c9e-4f21-48a6-9c05-2d8e11aa3f47',
  status: 'submitted',
  submittedAt: '2026-08-03T15:00:21.792Z',
  user: { email: 'client@oxshare.com', firstName: 'John', lastName: 'Doe', portalId: 1000245 },
  personalInfo: { firstName: 'John', lastName: 'Doe', country: 'UAE' },
  document: { docType: 'passport', frontFilePath: '/uploads/kyc/front.png' },
  selfie: { filePath: '/uploads/kyc/selfie.png' },
  addressProof: { docType: 'utility_bill', filePath: '/uploads/kyc/address.png' },
};

const REASONS = [
  { id: 'r-1', context: 'kyc', label: 'Document expired', createdAt: '2026-08-01T00:00:00.000Z' },
  { id: 'r-2', context: 'kyc', label: 'Image unreadable', createdAt: '2026-08-01T00:00:00.000Z' },
];

/**
 * The step configuration the reject dialog derives its flaggable fields from.
 *
 * Includes a field that is NOT in the hardcoded fallback, because that is the
 * defect the derivation fixes: a field added through /kyc/builder used to be
 * impossible to flag for correction.
 */
const STEP_CONFIG = [
  {
    id: 'step-1',
    stepNumber: 1,
    slug: 'personal',
    title: 'Personal Information',
    enabled: true,
    fields: [
      { id: 'f-1', name: 'firstName', label: 'First Name', type: 'text', required: true },
      { id: 'f-2', name: 'taxId', label: 'Tax ID', type: 'text', required: true },
    ],
  },
];

/**
 * One previously refused attempt, so the history panel has something to show
 * and the "was this client rejected before" question has a fixture.
 */
const HISTORY = [
  {
    attemptNo: 1,
    status: 'rejected',
    rejectionReason: 'Passport expired',
    rejectedFields: ['doc_front'],
    reviewedAt: '2026-07-30T09:00:00.000Z',
    /*
     * The reviewer's NAME, which the history route returns and this panel
     * rendered nowhere — see the case at the end of this file.
     */
    reviewedByName: 'Dana Reviewer',
    archivedAt: '2026-07-30T09:00:00.000Z',
    document: { docType: 'passport', frontFilePath: '/uploads/kyc/old-front.png' },
  },
];

/** Route by URL — this page issues three different GETs. */
function getFor(url: string) {
  if (url.includes('/admin/kyc-config')) return Promise.resolve({ data: STEP_CONFIG });
  if (url.includes('/history')) return Promise.resolve({ data: HISTORY });
  return Promise.resolve({ data: SUBMISSION });
}

beforeEach(() => {
  vi.clearAllMocks();
  permissions.current = ALL_PERMISSIONS;
  get.mockImplementation(getFor);
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
    expect(url).toBe('/admin/kyc/1000245/reject');
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

  it('offers a field added through the KYC builder, not a hardcoded list', async () => {
    /*
     * The defect this closes. The flaggable fields were a fixed array, so a
     * field configured through /kyc/builder appeared in the client's wizard and
     * in the reviewer's Personal Information card — and could not be flagged for
     * correction. A reviewer could see a bad value and had no way to ask for
     * that specific thing to be fixed.
     *
     * `taxId` is in STEP_CONFIG and deliberately NOT in FALLBACK_FIELD_OPTIONS,
     * so this fails if the list ever stops being derived.
     */
    await openRejectDialog();

    expect(await screen.findByText('Tax ID')).toBeInTheDocument();
  });

  it('sends the CONFIGURED field id, which is the contract the portal reads back', async () => {
    // The portal highlights what to fix by matching these ids, so a label-only
    // match would leave the client with a rejection naming nothing.
    const user = await openRejectDialog();

    await user.type(
      await screen.findByPlaceholderText(/passport image is blurry/i),
      'Wrong tax id',
    );
    await user.click(screen.getByLabelText('Tax ID'));
    await user.click(screen.getByRole('button', { name: /confirm rejection/i }));

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    const [, body] = patch.mock.calls[0] as [string, { rejectedFields?: string[] }];
    expect(body.rejectedFields).toEqual(['taxId']);
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
    expect(patch.mock.calls[0]?.[0]).toBe('/admin/kyc/1000245/approve');
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

describe('KYC review — identity card', () => {
  it('shows the Portal ID with a copy affordance, and the uuid nowhere', async () => {
    const { container } = renderWithProviders(<KycDetailPage />);
    await screen.findByRole('heading', { level: 1 });

    expect(screen.getByText('1000245')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy portal id/i })).toBeInTheDocument();
    expect(container.innerHTML).not.toContain('0b7d3c9e');
  });
});

describe('KYC review — claiming', () => {
  it('claims the submission for the current reviewer', async () => {
    const user = userEvent.setup();
    renderWithProviders(<KycDetailPage />);

    await user.click(await screen.findByRole('button', { name: /claim for review/i }));

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(patch.mock.calls[0]?.[0]).toBe('/admin/kyc/1000245/claim');
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
    get.mockImplementation((url: string) =>
      url.includes('/admin/kyc-config')
        ? Promise.resolve({ data: STEP_CONFIG })
        : url.includes('/history')
          ? Promise.resolve({ data: HISTORY })
          : Promise.resolve({ data: { ...SUBMISSION, status: 'approved' } }),
    );
    renderWithProviders(<KycDetailPage />);

    await screen.findByText(/client@oxshare\.com/i);
    // Re-approving or re-rejecting a decided submission is not offered.
    expect(screen.queryByRole('button', { name: /approve kyc submission/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /reject kyc submission/i })).toBeNull();
  });
});

describe('KYC review — previous attempts', () => {
  it('tells the reviewer this client has been refused before', async () => {
    /*
     * Repeat rejection is a fraud signal, and until submissions kept a history
     * it was invisible: a resubmission overwrote the original in place, so a
     * client refused twice and approved on the third try looked identical to
     * one approved first time.
     */
    renderWithProviders(<KycDetailPage />);

    expect(await screen.findByText(/previous attempts/i)).toBeInTheDocument();
    expect(screen.getByText(/attempt 1/i)).toBeInTheDocument();
  });

  it('keeps the refused documents collapsed until asked for', async () => {
    // Reading a KYC document is an audited event, and every fetch names the
    // admin who read it. Rendering historical documents up front would fill the
    // PII access log with reads nobody performed.
    const user = userEvent.setup();
    renderWithProviders(<KycDetailPage />);

    const row = await screen.findByRole('button', { name: /attempt 1/i });
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/passport expired/i)).not.toBeInTheDocument();

    await user.click(row);

    // The reason it was refused — the thing a resubmission used to erase.
    expect(await screen.findByText(/passport expired/i)).toBeInTheDocument();
    expect(screen.getByText('doc_front')).toBeInTheDocument();
  });
});

/**
 * CORRECTING AN APPROVED VERIFICATION — CORE-18's screen half.
 *
 * A client whose KYC is approved cannot edit their own submission; `resetKyc`
 * refuses that state and tells them to "contact support if your details have
 * changed". Support had nothing — the client edit dialog patches the `users`
 * row, which has no date-of-birth column and no address column — so the product
 * named a remedy that did not exist. Four of the six KYC states already let the
 * client fix it themselves. This closes the one that did not.
 */
describe('correcting identity details on an approved submission', () => {
  const approved = { ...SUBMISSION, status: 'approved' };

  /*
   * DELEGATES to `getFor` for everything but the submission itself. Replacing
   * the whole implementation drops `/admin/kyc-config`, `useKycStepConfig`
   * returns nothing, and `personalInfoGroups` throws inside SubmissionSummary —
   * which surfaces as the control being absent from the DOM, i.e. exactly the
   * failure these cases are looking for, from an unrelated cause.
   */
  const servingApproved = (url: string) =>
    url.includes('/admin/kyc-config') || url.includes('/history')
      ? getFor(url)
      : Promise.resolve({ data: approved });

  it('offers the control on an APPROVED submission', async () => {
    get.mockImplementation(servingApproved);
    renderWithProviders(<KycDetailPage />);

    expect(
      await screen.findByRole('button', { name: /correct identity details/i }),
    ).toBeInTheDocument();
  });

  it('does NOT offer it on a submission still awaiting a decision', async () => {
    /*
     * The state gate, and the reason it is not merely tidiness: in every other
     * state the CLIENT can fix this themselves in the wizard. An admin control
     * there would be a second way to do something they can already do, with
     * more privilege and less context.
     */
    renderWithProviders(<KycDetailPage />);
    await screen.findByText(/john doe/i);

    expect(
      screen.queryByRole('button', { name: /correct identity details/i }),
    ).not.toBeInTheDocument();
  });

  it('does NOT offer it to a reviewer who lacks kyc.identity.correct', async () => {
    // Writing a new date of birth onto a VERIFIED record is not the same power
    // as deciding a submission. A reviewer holding `kyc.review` must not
    // silently hold this.
    permissions.current = ALL_PERMISSIONS.filter((p) => p !== 'kyc.identity.correct');
    get.mockImplementation(servingApproved);
    renderWithProviders(<KycDetailPage />);
    await screen.findByText(/john doe/i);

    expect(
      screen.queryByRole('button', { name: /correct identity details/i }),
    ).not.toBeInTheDocument();
  });

  it('renders a REFUSAL as a finding about the record, not as a form error', async () => {
    /*
     * THE CASE THIS WHOLE CONTROL TURNS ON.
     *
     * The corrected value is re-validated against the rules that governed
     * submission — invalid, future, under 18 — because without that this route
     * is a bypass for the age rule on the side of the system where it is least
     * visible, in both directions.
     *
     * So a refusal means the operator has just discovered that an APPROVED
     * client's details are disqualifying. That is a compliance finding about
     * the RECORD, and the remedy is a rejection rather than another attempt at
     * this form. Rendering it in the same line as "the network died" would tell
     * them to retry something that cannot succeed.
     */
    const user = userEvent.setup();
    get.mockImplementation(servingApproved);
    patch.mockRejectedValue({
      response: {
        data: {
          code: 'KYC_CORRECTION_REFUSED',
          message: 'The client must be at least 18 years old.',
        },
      },
    });

    renderWithProviders(<KycDetailPage />);
    await user.click(await screen.findByRole('button', { name: /correct identity details/i }));
    await user.clear(screen.getByLabelText(/date of birth/i));
    await user.type(screen.getByLabelText(/date of birth/i), '2015-04-02');
    await user.click(screen.getByRole('button', { name: /save correction/i }));

    // The server's sentence, under a heading addressed to the record...
    expect(await screen.findByText(/at least 18 years old/i)).toBeInTheDocument();
    expect(screen.getByText(/this record cannot hold that value/i)).toBeInTheDocument();
    // ...and the remedy the product actually has, rather than "try again".
    expect(screen.getByText(/reject it and ask the client to verify again/i)).toBeInTheDocument();
  });
});

describe('who decided a PAST attempt', () => {
  /*
   * Reported from production: "I can see who approved, but not who rejected."
   *
   * Both the live submission card and the queue name the reviewer, so the
   * report looked wrong at first — and the asymmetry is real but lives one
   * panel over. A REJECTION is almost always a past attempt by the time anyone
   * reads it: the client corrects and resubmits, which archives the rejection
   * into the history panel. That panel showed the outcome and the date and
   * named nobody, so the decision that most needs attributing was the one shown
   * anonymously.
   *
   * The backend had the same gap in the other direction: `KycAttemptDto`
   * declared `reviewedByName` and the history route returned archived rows raw,
   * so the contract promised a field no response ever carried.
   */
  it('names the administrator who rejected it, in the attempt header', async () => {
    renderWithProviders(<KycDetailPage />);

    expect(
      await screen.findByText(/Rejected by\s+Dana Reviewer/i),
      'the history panel showed a rejection with no reviewer',
    ).toBeInTheDocument();
  });

  it('falls back to the outcome alone when the administrator has been deleted', async () => {
    /*
     * `reviewedByName` is null when the account is gone — an absence the screen
     * states rather than filling with an id or a placeholder name.
     */
    get.mockImplementation((url: string) =>
      url.includes('/history')
        ? Promise.resolve({ data: [{ ...HISTORY[0], reviewedByName: null }] })
        : getFor(url),
    );

    renderWithProviders(<KycDetailPage />);

    expect(await screen.findByText('Rejected', { exact: true })).toBeInTheDocument();
    expect(screen.queryByText(/Rejected by/i)).not.toBeInTheDocument();
  });
});
