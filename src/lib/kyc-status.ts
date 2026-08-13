import { t } from '@/lib/i18n';

/**
 * The one place that knows what a KYC status is CALLED and what colour it is.
 *
 * ## Why this exists
 *
 * The same six statuses were labelled in five different places: a hardcoded
 * `STATUS_LABELS` on the review queue, `clients.kyc*` in the client list,
 * `dashboard.kycStatus*` in the funnel chart, `kycStatus.*` on the review
 * detail, and a stray `clientProfile.kycSubmitted`. Three parallel i18n key
 * families for one vocabulary.
 *
 * That is not a tidiness complaint. Renaming `submitted` to "Pending" for the
 * review desk changed exactly one of the five, so the queue said Pending, the
 * client list said Submitted, the dashboard said Submitted, and the detail page
 * said Submitted — the same identity described four ways depending on which
 * screen you were on. A vocabulary with five owners has no owner.
 *
 * Every screen now reads from here. Adding a status, or changing a word, is one
 * edit — and the compiler finds every consumer because they share this type.
 *
 * ## Where the words come from
 *
 * `kycStatus.*` in `messages.ts`, which was already the most canonical of the
 * families and the one the detail page used. The others are gone.
 */

/**
 * The backend's `kyc_status` enum, in lifecycle order.
 *
 * Ordered deliberately — the funnel chart renders stages in this sequence, and
 * an array that doubles as the order is one fewer thing to keep in step.
 * `rejected` sits at the end because it is an outcome rather than a stage.
 */
export const KYC_STATUSES = [
  'not_started',
  'in_progress',
  'submitted',
  'under_review',
  'approved',
  'rejected',
] as const;

export type KycStatus = (typeof KYC_STATUSES)[number];

/**
 * How a status should READ to an operator.
 *
 * `submitted` is "Pending", and that is the point of the mapping rather than an
 * inconsistency in it: the stored value records what the CLIENT did, and the
 * label says what it means to the DESK — this identity is waiting on a
 * decision. "Submitted" describes a finished action, which is the least useful
 * thing to tell the person who has to act on it.
 */
export function kycStatusLabel(status: string): string {
  const key = `kycStatus.${status}` as Parameters<typeof t>[0];
  const label = t(key);
  /*
   * A status the API grew and this build has not learned yet degrades to a
   * readable form of the raw value rather than to a blank cell or a visible
   * `kycStatus.foo`. `t()` returns the key when it has no entry, which is what
   * this compares against.
   */
  return label === key ? status.replace(/_/g, ' ') : label;
}

/**
 * The semantic colour token a status carries, without the `var()`.
 *
 * Tokens rather than literal colours so the badge follows the theme, and ONE
 * mapping so the review queue's pill and the client list's badge cannot end up
 * disagreeing about whether "submitted" is a warning or a neutral.
 *
 * `submitted` and `under_review` are both warm: they are the two states that
 * represent work owed. `not_started` and `in_progress` are muted because
 * nothing is owed yet — the client has not asked for a decision.
 */
const TONE: Record<KycStatus, string> = {
  not_started: 'var(--muted-foreground)',
  in_progress: 'var(--muted-foreground)',
  submitted: 'var(--warning)',
  under_review: 'var(--info)',
  approved: 'var(--success)',
  rejected: 'var(--destructive)',
};

export function kycStatusColor(status: string): string {
  return TONE[status as KycStatus] ?? 'var(--muted-foreground)';
}

/**
 * The same six states as a `Badge` variant, for the surfaces built from that
 * component rather than from a raw pill.
 *
 * Kept beside the colour map on purpose: two ways of drawing one status, in one
 * file, so they cannot drift into disagreeing about which states are warnings.
 */
export type KycBadgeVariant = 'default' | 'success' | 'warning' | 'destructive';

const BADGE_VARIANT: Record<KycStatus, KycBadgeVariant> = {
  not_started: 'default',
  in_progress: 'default',
  submitted: 'warning',
  under_review: 'warning',
  approved: 'success',
  rejected: 'destructive',
};

export function kycStatusVariant(status: string): KycBadgeVariant {
  return BADGE_VARIANT[status as KycStatus] ?? 'default';
}
