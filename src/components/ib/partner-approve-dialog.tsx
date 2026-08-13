'use client';

import * as React from 'react';
import api from '@/lib/api';
import type { Agency } from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { Modal } from '@/components/ui/modal';
import { t } from '@/lib/i18n';

/**
 * Approve an application, choosing the agency when it does not carry one.
 *
 * ## Why this replaced a `confirm()`
 *
 * Approving used to be a yes/no, because the agency came from the application
 * and the API accepted an approval with none. It no longer does: a partner
 * without an agency has clients offered the ENTIRE product catalogue, so the
 * grant is refused rather than defaulted.
 *
 * That turns approval into a decision with an input for exactly the
 * applications submitted before the rule existed — roughly 691 of them, all
 * carrying no agency. Left as a confirm, every one of those would fail on a
 * validation error the reviewer had no way to answer.
 *
 * ## The choice appears only when it is a choice
 *
 * An application that names an agency approves against it, and the dialog says
 * which rather than asking again — re-asking a settled question invites a
 * reviewer to change it by accident, and silently substituting a different
 * programme is how you produce an angry partner. Overriding is still possible
 * from the API; it is deliberately not one click away here.
 */
export function PartnerApproveDialog({
  open,
  onClose,
  onConfirm,
  name,
  /** What the applicant asked for, resolved to a name. Null when they asked for none. */
  requestedAgencyName,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  /** `agencyId` is undefined when the application already carries one. */
  onConfirm: (agencyId?: string) => void;
  name: string;
  requestedAgencyName: string | null;
  saving: boolean;
}) {
  const [agencyId, setAgencyId] = React.useState('');

  const agencies = useResource<Agency[]>(
    ['admin', 'agencies'],
    (signal) => api.admin.getAgencies(signal),
    // Only when the reviewer actually has to pick — an application that names
    // one needs no catalogue read.
    { enabled: open && requestedAgencyName === null },
  );

  const mustChoose = requestedAgencyName === null;
  const options = agencies.data ?? [];

  return (
    <Modal open={open} onClose={onClose} title={t('partnerReview.confirmApproveTitle', { name })}>
      <div className="space-y-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t('partnerReview.confirmApprove')}
        </p>

        {mustChoose ? (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">{t('partnerReview.chooseAgency')}</h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t('partnerReview.chooseAgencyHint')}
            </p>

            <fieldset className="max-h-56 space-y-1.5 overflow-y-auto">
              <legend className="sr-only">{t('partnerReview.chooseAgency')}</legend>
              {options.map((agency) => (
                <label
                  key={agency.id}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 ${
                    agencyId === agency.id ? 'border-primary bg-primary/5' : 'border-border'
                  }`}
                >
                  <input
                    type="radio"
                    name="approve-agency"
                    checked={agencyId === agency.id}
                    onChange={() => setAgencyId(agency.id)}
                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{agency.name}</span>
                    {agency.description && (
                      <span className="block text-xs text-muted-foreground">
                        {agency.description}
                      </span>
                    )}
                    {!agency.enabled && (
                      /*
                       * A CLOSED agency is still offered, because approving
                       * against one is allowed — closing a programme stops new
                       * applications and does not strand the queue. Labelled, so
                       * the reviewer picks it knowingly.
                       */
                      <span className="mt-0.5 block text-[11px] text-warning">
                        {t('partnerReview.agencyClosed')}
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </fieldset>

            {agencies.status === 'ready' && options.length === 0 && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive"
              >
                {t('partnerReview.noAgenciesConfigured')}
              </p>
            )}
          </div>
        ) : (
          <p className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
            {t('partnerReview.approvingUnder', { agency: requestedAgencyName })}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="focus-outline inline-flex h-9 items-center rounded-lg border border-border px-4 text-xs font-semibold hover:bg-muted"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(mustChoose ? agencyId : undefined)}
            // Unreachable without a choice when one is required: the API would
            // refuse, and a 400 is a worse way to learn it than a dim button.
            disabled={saving || (mustChoose && !agencyId)}
            className="focus-outline inline-flex h-9 items-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? t('partnerReview.approving') : t('partnerReview.approve')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
