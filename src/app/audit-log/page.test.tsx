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

const { get } = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@/lib/api', () => {
  const api = { get };
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
});

describe('audit log — listing', () => {
  it('lists entries with the acting admin and the action', async () => {
    renderWithProviders(<AuditLogPage />);

    expect(await screen.findByText(/admin@oxshare\.com/)).toBeInTheDocument();
    expect(screen.getByText(/kyc\.approve/i)).toBeInTheDocument();
  });

  it('requests the first page with a bounded limit', async () => {
    renderWithProviders(<AuditLogPage />);

    await waitFor(() => expect(get).toHaveBeenCalled());
    const url = get.mock.calls[0]?.[0] as string;
    // An unbounded audit query is a slow query at §5's row counts.
    expect(url).toMatch(/page=1/);
    expect(url).toMatch(/limit=\d+/);
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
