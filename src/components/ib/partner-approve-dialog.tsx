'use client';

import * as React from 'react';
import api from '@/lib/api';
import type { Agency } from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { Modal } from '@/components/ui/modal';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

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
 * agency is how you produce an angry partner. Overriding is still possible
 * from the API; it is deliberately not one click away here.
 *
 * ## THE COMMISSION PROGRAMME IS GONE FROM THIS DIALOG (0112)
 *
 * A reviewer used to pick one here, and the argument for asking was sound at
 * the time: the agency is what the applicant REQUESTED, so re-asking
 * second-guesses them, while the programme was what the BROKER decided and the
 * applicant never saw the catalogue.
 *
 * There is no catalogue now. A partner's terms come from their LEVEL, and a
 * level is not a choice — it is where they sit: a partner with no parent deals
 * with the broker directly and is level 1, and one recruited by another partner
 * is a rung deeper. So approval has nothing commercial left in it, and the one
 * question this dialog still asks is the agency.
 *
 * The rung can be corrected afterwards from the partner's profile, for the
 * cases the tree does not describe — see `ChangeLevelDialog`.
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
  /**
   * `agencyId` is undefined when the application already carries one;
   * `programId` is always sent, because the reviewer always chooses it.
   */
  onConfirm: (choice: { agencyId?: string; programId?: string }) => void;
  name: string;
  requestedAgencyName: string | null;
  saving: boolean;
}) {
  const [agencyId, setAgencyId] = React.useState('');

  const agencies = useResource<Agency[]>(
    keys.agencies.all(),
    (signal) => api.admin.getAgencies(signal),
    /*
     * Fetched whenever the dialog is open, not only when the reviewer must
     * pick one.
     *
     * An application that already names an agency still needs the row, because
     * the agency carries `defaultProgramId` (0107) and that is what should be
     * pre-selected below. The list is small, shares its cache key with the
     * agencies screen, and only loads when somebody opens this dialog.
     */
    { enabled: open },
  );

  const mustChoose = requestedAgencyName === null;
  /* Memoised because `activeAgency` depends on it — a fresh `[]` on every
     render would recompute that lookup on every keystroke elsewhere. */
  const options = React.useMemo(() => agencies.data ?? [], [agencies.data]);

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
            onClick={() =>
              onConfirm({
                agencyId: mustChoose ? agencyId : undefined,
              })
            }
            /*
             * Unreachable without an agency when one is required: the API would
             * refuse, and a 400 is a worse way to learn it than a dim button.
             *
             * There is no terms half to this check any more (0112). A partner's
             * LEVEL is derived from who recruited them, so approval has no
             * commercial choice left in it and nothing here can be left unset.
             */
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
