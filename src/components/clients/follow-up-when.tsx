import { Badge } from '@/components/ui/badge';
import { followUpDue, formatFollowUpAt } from '@/lib/follow-up';
import { t } from '@/lib/i18n';

/**
 * A follow-up date as a person reads it ("Mon 12 Oct, 15:00"), marked Overdue
 * or Today against the VIEWER's day — the same reading as the list's "Follow-up
 * due" filter, so a row the filter returns always wears one of the two marks.
 */
export function FollowUpWhen({ at }: { at: string }) {
  const due = followUpDue(at);
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {due === 'overdue' && <Badge variant="destructive">{t('followUp.dueOverdue')}</Badge>}
      {due === 'today' && <Badge variant="warning">{t('followUp.dueToday')}</Badge>}
      <span className="whitespace-nowrap text-xs tabular">{formatFollowUpAt(at)}</span>
    </span>
  );
}
