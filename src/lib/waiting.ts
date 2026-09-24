import { t } from '@/lib/i18n';

/**
 * How long a KYC submission has been waiting, the way the queue and the review
 * screen both say it: `waiting <1h`, `waiting 5h`, `waiting 3d`.
 *
 * Whole days alone read "waiting 0d" for everything submitted today — true,
 * and useless on the screen whose job is to show what is urgent: a submission
 * from this morning and one from a minute ago looked identical. Hours below a
 * day, days above it.
 */
export function waitingLabel(submittedAt: string, now: number = Date.now()): string {
  const hours = Math.floor(Math.max(0, now - new Date(submittedAt).getTime()) / 3_600_000);
  if (hours < 1) return t('kycReview.waitingUnderHour');
  if (hours < 24) return t('kycReview.waitingHours', { hours: String(hours) });
  return t('kycReview.waitingDays', { days: String(Math.floor(hours / 24)) });
}
