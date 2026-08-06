import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import AuditLogPage from './page';
import type { AuditEntry } from '@/lib/api/admin';

/**
 * The admin action log.
 *
 * The master-admin gate is NOT retested here — `lib/permissions.test.ts` already
 * covers it at the route level ("audit log stays master-only"), which is where the
 * gate actually lives. Duplicating it would give two places to update and no extra
 * signal.
 *
 * What is pinned instead is the page's own behaviour: the log is APPEND-ONLY, so it
 * must offer no way to change or remove an entry, and the filter has to actually
 * reach the request rather than only filtering what is already on screen.
 */

const { get, getAuditActions } = vi.hoisted(() => ({
  get: vi.fn(),
  // The action filter is SERVED now, not hardcoded — the screen offered eight
  // of thirty-four, so everything recently made auditable was unfilterable.
  getAuditActions: vi.fn(),
}));

vi.mock('@/lib/api', () => {
  const api = { get, admin: { getAuditActions } };
  return { api, default: api };
});

/**
 * Typed against the generated schema on purpose. The first draft of this fixture
 * invented `adminId`/`adminEmail`; the real fields are `actorId`/`actorEmail`, and
 * the page was correct all along. A typed fixture turns that into a compile error
 * instead of a puzzling empty column.
 */
function entry(over: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: 'e-1',
    actorId: 'a-1',
    actorEmail: 'admin@oxshare.com',
    // Both required by the generated schema, and both were missing from this
    // fixture until the API started admitting they exist — the compile error
    // was the contract doing its job.
    actorKind: 'admin',
    ipAddress: '203.0.113.9',
    action: 'kyc.approve',
    subjectType: 'kyc',
    subjectId: 'u-1',
    createdAt: '2026-08-03T15:25:08.798Z',
    ...over,
  };
}

function page(rows: AuditEntry[], total = rows.length) {
  return { items: rows, total, page: 1, limit: 20 };
}

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue({ data: page([entry()]) });
  getAuditActions.mockResolvedValue([
    { action: 'kyc.approve', label: 'KYC approved', group: 'Verification' },
  ]);
});

describe('audit log — listing', () => {
  it('lists entries with the acting admin and the action', async () => {
    renderWithProviders(<AuditLogPage />);

    expect(await screen.findByText(/admin@oxshare\.com/)).toBeInTheDocument();
    expect(screen.getByText(/kyc\.approve/i)).toBeInTheDocument();
  });

  it('requests the first page with a bounded limit and NO offset', async () => {
    renderWithProviders(<AuditLogPage />);

    await waitFor(() => expect(get).toHaveBeenCalled());
    const url = get.mock.calls[0]?.[0] as string;

    // An unbounded audit query is a slow query at §5's row counts.
    expect(url).toMatch(/limit=\d+/);

    /*
     * No `page`, and no `cursor` on the first request — PLATFORM-CONVENTIONS
     * R-2.4. This assertion said `page=1` until the migration, which is what an
     * offset walk sends; the audit log is append-only and only grows, and offset
     * paging over a list being written to silently skips rows. A trail with a
     * gap is worse than no trail, because it is believed.
     */
    expect(url).not.toMatch(/page=/);
    expect(url).not.toMatch(/cursor=/);
  });

  it('offers a retry when the log cannot be loaded', async () => {
    get.mockRejectedValue(
      Object.assign(new Error('boom'), { response: { status: 500, data: {} } }),
    );
    renderWithProviders(<AuditLogPage />);

    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('names the endpoint when the API is not built yet', async () => {
    get.mockRejectedValue(
      Object.assign(new Error('nope'), { response: { status: 404, data: {} } }),
    );
    renderWithProviders(<AuditLogPage />);

    expect(await screen.findByText(/\/admin\/audit-log/)).toBeInTheDocument();
  });
});

describe('audit log — filtering happens server-side', () => {
  it('sends the chosen action to the API rather than filtering locally', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AuditLogPage />);

    await screen.findByText(/kyc\.approve/i);
    get.mockClear();

    // Pick a specific action from the filter.
    // Two comboboxes render: the action filter and rows-per-page.
    await user.click(screen.getAllByRole('combobox')[0]!);
    const option = await screen.findByRole('option', { name: /kyc approve/i });
    await user.click(option);

    // Filtering client-side would silently show only the current page's matches,
    // which on an append-only log of ~219K rows is a wrong answer, not a slow one.
    await waitFor(() => expect(get).toHaveBeenCalled());
    const url = get.mock.calls[0]?.[0] as string;
    expect(url).toMatch(/action=kyc\.approve/);
  });
});

describe('audit log — append-only', () => {
  it('offers no way to edit or delete an entry', async () => {
    renderWithProviders(<AuditLogPage />);

    await screen.findByText(/kyc\.approve/i);

    // ARCHITECTURE §6.4: the log is append-only. A UI affordance to change it
    // would be a promise the database refuses to keep.
    expect(screen.queryByRole('button', { name: /delete|remove/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /edit/i })).toBeNull();
  });
});

describe('who acted, and from where', () => {
  /**
   * The address is what makes an action attributable rather than merely
   * attributed. `audit_log.ip_address` was populated from the first day the
   * column existed and was absent from the response DTO, so this screen could
   * not show it: "which address did this administrator approve the payout
   * from" was answerable in SQL and nowhere an operator would look.
   */
  it('shows the address the action came from', async () => {
    get.mockResolvedValue({ data: page([entry({ ipAddress: '203.0.113.9' })]) });
    renderWithProviders(<AuditLogPage />);

    expect(await screen.findByText('203.0.113.9')).toBeInTheDocument();
  });

  it('says so plainly when no address was recorded', async () => {
    // Null is legitimate — a scheduled job has no request context. An empty
    // cell would read as a rendering bug rather than as a fact about the row.
    get.mockResolvedValue({ data: page([entry({ ipAddress: null })]) });
    renderWithProviders(<AuditLogPage />);

    expect(await screen.findByText(/no address recorded/i)).toBeInTheDocument();
  });

  it('labels a non-admin actor, and does NOT label an admin one', async () => {
    // Every row here is an admin action until background jobs land, so
    // labelling all of them would be noise that hides the one row that is not.
    get.mockResolvedValue({
      data: page([entry({ actorKind: 'system', actorEmail: 'commission.confirm' })]),
    });
    renderWithProviders(<AuditLogPage />);

    expect(await screen.findByText('system')).toBeInTheDocument();
  });

  it('does not label an ordinary admin row', async () => {
    get.mockResolvedValue({ data: page([entry({ actorKind: 'admin' })]) });
    renderWithProviders(<AuditLogPage />);

    await screen.findByText('admin@oxshare.com');
    expect(screen.queryByText('admin', { selector: 'span.uppercase' })).not.toBeInTheDocument();
  });
});
