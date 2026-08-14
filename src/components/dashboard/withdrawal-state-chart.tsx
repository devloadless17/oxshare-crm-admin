'use client';

import Decimal from 'decimal.js';
import type { WithdrawalStateTotal } from '@/lib/api/admin';
import { formatMoney } from '@/lib/money';
import { useChartTokens } from './chart-theme';
import { plotAmount } from './plot-money';
import { formatCount } from './format';
import { t } from '@/lib/i18n';

/**
 * Withdrawals by state — value AND count, as a labelled bar list.
 *
 * ## Why this is not a Recharts chart
 *
 * Five states, each carrying two numbers of different kinds: a monetary total
 * and a request count. The obvious chart forms are all wrong for it. A grouped
 * bar chart would put money and counts on one axis, which is meaningless. A
 * dual-axis chart would align two scales arbitrarily and invent a relationship
 * — the single most misleading thing a dashboard can draw. A stacked bar would
 * claim the five states sum to a whole worth reading, which they do not:
 * `rejected` and `success` are terminal and `pending` is money that has not
 * moved.
 *
 * What the operator actually asks of this panel is "how much is stuck in
 * pending, and how many requests is that" — a magnitude comparison across five
 * named rows where both numbers must be exact. That is a table with a magnitude
 * cue, and the standard's own answer to "more than a handful of classes that
 * all carry meaning" is a table. The bar behind each row is the cue: it is
 * proportional to that state's value, so the eye finds the big one, and the
 * exact figures are text beside it rather than something to be recovered from a
 * hovered arc.
 *
 * ## Colour
 *
 * These five ARE states in the good→bad sense — that is what the column means —
 * so they wear the reserved status scale rather than categorical slots. Each is
 * paired with its written label, never colour alone, which is required on the
 * light surface where two of the status steps sit below 3:1.
 *
 * ## Money
 *
 * The bar WIDTH goes through `plotAmount`, the documented plotting boundary;
 * every displayed figure is `formatMoney` on the original string. A percentage
 * used for geometry is not a value anybody reads.
 */

const STATE_LABEL: Record<WithdrawalStateTotal['state'], string> = {
  pending: 'dashboard.withdrawalPending',
  // Both paid states read the same word — they are summed into one bar, and
  // `approved` only appears here for the Record to stay total.
  approved: 'dashboard.withdrawalApproved',
  success: 'dashboard.withdrawalApproved',
  failure: 'dashboard.withdrawalFailure',
  rejected: 'dashboard.withdrawalRejected',
};

/**
 * State → status role. `pending` and `approved` are money in flight rather than
 * money lost, so they take the attention colours rather than the alarm one;
 * `failure` is the only genuinely bad outcome, `rejected` a deliberate one.
 */
const STATE_ROLE: Record<
  WithdrawalStateTotal['state'],
  'good' | 'warning' | 'serious' | 'critical'
> = {
  pending: 'warning',
  approved: 'good',
  success: 'good',
  failure: 'critical',
  rejected: 'serious',
};

/*
 * ── `approved` AND `success` ARE ONE BAR ────────────────────────────────────
 *
 * Approving a withdrawal PAYS it, in one step. There is no separate settlement
 * to wait for and no "mark as paid" left anywhere in the console, so two bars
 * described one outcome and invited the reader to wonder what the difference
 * was — the same confusion that made the row menu ask twice.
 *
 * `approved` is the state rows landed in before approval and payment became one
 * action; `success` is where they land now. Both mean the client was paid, so
 * they are summed under one label rather than reported as a pipeline with a
 * stage in it.
 *
 * The SUM matters here: `totalAmount` is a decimal string at NUMERIC(28,8), so
 * the two are added through decimal.js. `Number(a) + Number(b)` on a
 * nine-figure total is wrong before it is displayed, and this is the one place
 * on the screen where two figures are combined rather than read straight
 * through.
 */
const PAID_STATES: WithdrawalStateTotal['state'][] = ['approved', 'success'];

/** The order an operator reads these in: the queue first, the outcomes after. */
const STATE_ORDER: WithdrawalStateTotal['state'][] = ['pending', 'success', 'failure', 'rejected'];

export function WithdrawalStateChart({ byState }: { byState: WithdrawalStateTotal[] }) {
  const tokens = useChartTokens();

  const rows = STATE_ORDER.map((state) => {
    if (state !== 'success') return byState.find((entry) => entry.state === state);

    /*
     * The merged bar. Present when EITHER state has rows — a platform with only
     * legacy `approved` rows still paid those clients, and dropping the bar
     * because `success` happens to be empty would report nothing paid.
     */
    const parts = byState.filter((entry) => PAID_STATES.includes(entry.state));
    if (parts.length === 0) return undefined;

    return parts.reduce((total, entry) => ({
      state: 'success' as const,
      count: total.count + entry.count,
      totalAmount: new Decimal(total.totalAmount).plus(entry.totalAmount).toFixed(),
    }));
  }).filter((entry): entry is WithdrawalStateTotal => entry !== undefined);

  // PLOTTING BOUNDARY — widths only. Nothing derived from these is displayed.
  const widths = rows.map((row) => plotAmount(row.totalAmount));
  const largest = Math.max(...widths, 0);

  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">{t('dashboard.noWithdrawalsYet')}</p>
      </div>
    );
  }

  return (
    <ul className="flex h-full flex-col justify-center gap-3 px-3">
      {rows.map((row, index) => {
        const colour = tokens.status[STATE_ROLE[row.state]];
        const width = largest > 0 ? ((widths[index] ?? 0) / largest) * 100 : 0;
        return (
          <li key={row.state} className="space-y-1.5">
            <div className="flex items-baseline gap-2">
              <span
                aria-hidden="true"
                className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
                style={{ backgroundColor: colour }}
              />
              <span className="text-xs font-medium text-foreground">
                {t(STATE_LABEL[row.state] as Parameters<typeof t>[0])}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {t('dashboard.requestCount', { count: formatCount(row.count) })}
              </span>
              <span className="text-xs font-semibold tabular text-foreground ms-auto">
                {formatMoney(row.totalAmount, 'USD')}
              </span>
            </div>
            {/*
             * The magnitude cue. A hairline track one step off the surface,
             * with the fill thin rather than a saturated block — the numbers
             * above are the data, this only says which row is the big one.
             * `aria-hidden`, because the value it encodes is already text.
             */}
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden" aria-hidden="true">
              <div
                className="h-full rounded-full"
                style={{ width: `${String(width)}%`, backgroundColor: colour }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
