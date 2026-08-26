'use client';

import * as React from 'react';
import api from '@/lib/api';
import type { Agency, IbProgram } from '@/lib/api/admin';
import { formatDecimal } from '@/lib/money';
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
 * agency is how you produce an angry partner. Overriding is still possible
 * from the API; it is deliberately not one click away here.
 *
 * ## The COMMISSION PROGRAMME is asked every time, and the agency is not
 *
 * The asymmetry is the point. The agency is what the applicant REQUESTED, so
 * re-asking it second-guesses them. The programme is what the BROKER decides —
 * the applicant has no view on it and never sees the catalogue — so there is no
 * request to honour and nothing to second-guess.
 *
 * Until this control existed the API's `programId` was reachable only by hand,
 * so every approved partner landed on whichever programme sorted first. An
 * operator could build Gold, Silver and Bronze and assign nobody to any of
 * them, at the one moment the decision is naturally made.
 *
 * It DEFAULTS to the first enabled programme, which is what the API does when
 * the field is omitted — so the ordinary approval is still one click, and the
 * default is visible rather than implied.
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
  const [programId, setProgramId] = React.useState('');

  const agencies = useResource<Agency[]>(
    ['admin', 'agencies'],
    (signal) => api.admin.getAgencies(signal),
    // Only when the reviewer actually has to pick — an application that names
    // one needs no catalogue read.
    { enabled: open && requestedAgencyName === null },
  );

  const programs = useResource<IbProgram[]>(
    ['admin', 'ib-programs'],
    (signal) => api.admin.getIbPrograms(signal),
    { enabled: open },
  );

  const mustChoose = requestedAgencyName === null;
  const options = agencies.data ?? [];

  /*
   * ENABLED only, in the order the API resolves its own default — lowest
   * `sortOrder`, ties by name. A disabled programme pays nothing, so offering
   * one is a choice whose only outcome is a refusal.
   */
  const programOptions = React.useMemo(
    () =>
      (programs.data ?? [])
        .filter((program) => program.enabled)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [programs.data],
  );

  /*
   * The DEFAULT is pre-selected rather than left blank, and it is the same one
   * the API would pick. A blank first option would make the ordinary approval
   * two decisions instead of one, and "leave it alone" is not a thing a radio
   * group can express.
   */
  const defaultProgramId = programOptions[0]?.id ?? '';
  const chosenProgramId = programId || defaultProgramId;

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

        {/*
          THE TERMS. Separate from the agency above it by a rule, not a divider:
          the agency decides what this partner may SELL, the programme decides
          what they EARN.
        */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-foreground">
            {t('partnerReview.programmeLabel')}
          </p>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {t('partnerReview.programmeHint')}
          </p>

          <fieldset className="space-y-1.5">
            <legend className="sr-only">{t('partnerReview.programmeLabel')}</legend>
            {programOptions.map((program) => (
              <label
                key={program.id}
                className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 ${
                  chosenProgramId === program.id ? 'border-primary bg-primary/5' : 'border-border'
                }`}
              >
                <input
                  type="radio"
                  name="approve-program"
                  checked={chosenProgramId === program.id}
                  onChange={() => setProgramId(program.id)}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{program.name}</span>
                  {/*
                    The LADDER, because a name alone does not tell a reviewer
                    what they are about to put somebody on — and the number of
                    levels is half that answer, not decoration: it is how far
                    this partner's earnings will reach.
                  */}
                  <span className="block text-[11px] text-muted-foreground">
                    {program.mode === 'rebate_only'
                      ? t('partnerReview.programmeRebateOnly', {
                          rebate: formatDecimal(program.rebateRate),
                        })
                      : t('partnerReview.programmeLadder', {
                          rates: program.tiers
                            .map((tier) => `L${tier.depth} ${formatDecimal(tier.rate)}%`)
                            .join(' · '),
                          count: String(program.tiers.length),
                        })}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          {programs.status === 'ready' && programOptions.length === 0 && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive"
            >
              {t('partnerReview.noProgrammesEnabled')}
            </p>
          )}
        </div>

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
                programId: chosenProgramId || undefined,
              })
            }
            /*
             * Unreachable without a choice when one is required: the API would
             * refuse, and a 400 is a worse way to learn it than a dim button.
             * The programme half covers the empty catalogue — approving with no
             * enabled programme creates a partner who earns nothing.
             */
            disabled={saving || (mustChoose && !agencyId) || !chosenProgramId}
            className="focus-outline inline-flex h-9 items-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? t('partnerReview.approving') : t('partnerReview.approve')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
