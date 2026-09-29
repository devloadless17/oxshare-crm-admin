import { t } from '@/lib/i18n';

/**
 * The part of a count the reader may not see, beside the part they may —
 * "12 · +30 outside your territory" (D-81 R2: a count, never who).
 *
 * The API sends every count that can cross a territory as two numbers, the
 * reader's and the rest (`…OutsideScope`); this is the one way a screen shows
 * the second. Nothing when nothing is outside, so a reader who sees every
 * client reads a plain number.
 */
export function OutsideTerritoryCount({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
      · {t('clientProfile.outsideTerritoryCount', { count: String(count) })}
    </span>
  );
}
