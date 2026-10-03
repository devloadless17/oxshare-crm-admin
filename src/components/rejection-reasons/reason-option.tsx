import type { RejectionReason } from '@/lib/api/admin';

/**
 * One reason in a reject dialog's list: the English a reviewer picks, and
 * beneath it — muted, right to left — the Arabic a client reading the portal
 * in Arabic will be shown, when the reason has one.
 *
 * Used INSIDE a `SelectItem`. The trigger is given the English alone
 * (`<SelectValue>{reason.label}</SelectValue>`), since Radix would otherwise
 * copy both lines into a one-line box.
 */
export function ReasonOption({ reason }: { reason: Pick<RejectionReason, 'label' | 'labelAr'> }) {
  return (
    <span className="flex flex-col">
      <span>{reason.label}</span>
      {reason.labelAr && reason.labelAr.trim() !== '' && (
        <span dir="rtl" lang="ar" className="text-[11px] text-muted-foreground">
          {reason.labelAr}
        </span>
      )}
    </span>
  );
}
