import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import type { ScheduledJob } from '@/lib/api/admin';
import { ScheduledJobsPanel } from './scheduled-jobs-panel';

/**
 * SETTINGS → SCHEDULED JOBS (owner, 29 Sep 2026): every background job's
 * timing, edited in the console instead of the server's environment file.
 */
const { getScheduledJobs, updateScheduledJob, runScheduledJob } = vi.hoisted(() => ({
  getScheduledJobs: vi.fn(),
  updateScheduledJob: vi.fn(),
  runScheduledJob: vi.fn(),
}));

vi.mock('@/lib/api/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/admin')>();
  return {
    ...actual,
    adminApi: { ...actual.adminApi, getScheduledJobs, updateScheduledJob, runScheduledJob },
  };
});

function job(over: Partial<ScheduledJob>): ScheduledJob {
  return {
    key: 'mt5.syncAccounts',
    group: 'mt5',
    runsOn: 'crm',
    intervalSeconds: 600,
    defaultSeconds: 600,
    minSeconds: 60,
    maxSeconds: 86400,
    sharedInterval: null,
    lastStartedAt: '2026-09-29T10:00:00.000Z',
    lastFinishedAt: '2026-09-29T10:00:02.000Z',
    lastDurationMs: 1500,
    lastError: null,
    lastErrorAt: null,
    externalReadAt: null,
    running: false,
    ...over,
  };
}

const LIST = {
  items: [
    job({}),
    job({
      key: 'bridge.sweep',
      runsOn: 'bridge',
      intervalSeconds: 300,
      minSeconds: 30,
      maxSeconds: 3600,
    }),
    job({
      key: 'ib.accrueDeals',
      group: 'commission',
      intervalSeconds: 3600,
      sharedInterval: 'commission',
    }),
    job({
      key: 'wallet.reconcile',
      group: 'money',
      intervalSeconds: 3600,
      lastError: 'ledger mismatch on 2 wallets',
    }),
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  getScheduledJobs.mockResolvedValue(LIST);
  updateScheduledJob.mockResolvedValue(LIST);
  runScheduledJob.mockResolvedValue(LIST);
});

const rowOf = async (name: string) =>
  (await screen.findByText(name)).closest('div.grid') as HTMLElement;

describe('the scheduled jobs tab', () => {
  it('shows each job’s interval in its own unit, and how its last run went', async () => {
    renderWithProviders(<ScheduledJobsPanel canManage />);
    const sync = await rowOf('MT5 account sync');
    expect(within(sync).getByRole('spinbutton')).toHaveValue(10);
    expect(within(sync).getByRole('combobox', { name: 'Unit' })).toHaveValue('minutes');
    expect(within(sync).getByText('OK')).toBeInTheDocument();

    const wallet = await rowOf('Wallet reconciliation');
    expect(within(wallet).getByText('Failed')).toBeInTheDocument();
    expect(within(wallet).getByText('ledger mismatch on 2 wallets')).toBeInTheDocument();
  });

  it('saves a new interval in seconds', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ScheduledJobsPanel canManage />);
    const sync = await rowOf('MT5 account sync');
    const box = within(sync).getByRole('spinbutton');
    await user.clear(box);
    await user.type(box, '15');
    await user.click(within(sync).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateScheduledJob).toHaveBeenCalledWith('mt5.syncAccounts', 900));
  });

  it('will not save outside the job’s bounds, and says them', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ScheduledJobsPanel canManage />);
    const sync = await rowOf('MT5 account sync');
    const box = within(sync).getByRole('spinbutton');
    await user.clear(box);
    await user.type(box, '30');
    await user.selectOptions(within(sync).getByRole('combobox', { name: 'Unit' }), 'seconds');
    expect(within(sync).getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(within(sync).getByText(/Choose between 1 minute and 1 day/)).toBeInTheDocument();
  });

  it('runs a CRM job now — not a bridge job, not commission', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ScheduledJobsPanel canManage />);
    await user.click(await screen.findByRole('button', { name: 'Run now: MT5 account sync' }));
    await waitFor(() => expect(runScheduledJob).toHaveBeenCalledWith('mt5.syncAccounts'));

    const bridge = await rowOf('MT5 deal & balance sweep');
    expect(within(bridge).queryByRole('button', { name: /run now/i })).toBeNull();
    expect(within(bridge).getByText('On the MT5 bridge')).toBeInTheDocument();
    const commission = await rowOf('Commission — calculate from trades');
    expect(within(commission).queryByRole('button', { name: /run now/i })).toBeNull();
    expect(screen.getByText(/also how long a commission is held/)).toBeInTheDocument();
  });

  it('is read-only without settings.edit', async () => {
    renderWithProviders(<ScheduledJobsPanel canManage={false} />);
    const sync = await rowOf('MT5 account sync');
    expect(within(sync).getByRole('spinbutton')).toBeDisabled();
    expect(screen.queryByRole('button', { name: /run now/i })).toBeNull();
  });
});
