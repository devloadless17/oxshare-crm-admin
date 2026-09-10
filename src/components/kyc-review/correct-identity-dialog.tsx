'use client';

import * as React from 'react';
import type { RefObject } from 'react';
import { t } from '@/lib/i18n';

/**
 * CORRECT A DATE OF BIRTH OR AN ADDRESS ON AN APPROVED SUBMISSION.
 *
 * ## The gap it closes
 *
 * A client whose verification is APPROVED cannot edit their own submission —
 * `kyc.service.ts` refuses a step edit and a reset for that state, correctly,
 * and tells them "contact support if your details have changed". Support then
 * had nothing: the admin edit dialog patches the `users` row, which carries no
 * date of birth and no address, and there was no route that touched an approved
 * submission. The product named a remedy that did not exist.
 *
 * Four of the six KYC states already have a path — the client edits their own
 * steps. This closes the one that did not, which is the state every real client
 * ends up in.
 *
 * ## The 409 is NOT a form error, and must never render as one
 *
 * The corrected value is re-validated against the same rules that governed
 * submission — invalid date, future date, under 18. Without that, this route
 * would be a bypass for the age rule on the side of the system where it is
 * least visible, working in both directions.
 *
 * So a refusal here means something quite different from a typo: the operator
 * has just discovered that an APPROVED client's identity details are
 * disqualifying. That is a compliance finding about the RECORD, not a complaint
 * about their keystroke, and the remedy is a rejection rather than another
 * attempt at this form. It is given its own styling and its own sentence for
 * that reason — `KYC_CORRECTION_REFUSED` is a distinct code on the wire
 * precisely so this branch can exist.
 */
export function CorrectIdentityDialog({
  panelRef,
  clientName,
  dateOfBirth,
  address,
  loading,
  error,
  refusal,
  onCancel,
  onConfirm,
}: {
  panelRef: RefObject<HTMLDivElement | null>;
  clientName: string;
  /** Current values, so the operator corrects rather than retypes. */
  dateOfBirth: string;
  address: string;
  loading: boolean;
  /** An ordinary failure — the request did not land. */
  error: string;
  /** A REFUSAL — it landed and the record is disqualifying. See above. */
  refusal: string;
  onCancel: () => void;
  onConfirm: (patch: { dateOfBirth?: string; address?: string }) => Promise<void>;
}) {
  const [dob, setDob] = React.useState(dateOfBirth);
  const [addr, setAddr] = React.useState(address);

  /*
   * Send only what CHANGED. The route takes a partial patch and re-validates
   * exactly the fields it is given — so echoing an untouched date of birth would
   * re-check a value nobody edited, and a record whose stored DOB is
   * disqualifying would then refuse a correction to the street name. That is the
   * same trap this dialog exists to remove, from the other direction.
   */
  const patch = {
    ...(dob !== dateOfBirth ? { dateOfBirth: dob } : {}),
    ...(addr !== address ? { address: addr } : {}),
  };
  const nothingChanged = Object.keys(patch).length === 0;

  return (
    <div className="modal-overlay" onClick={() => !loading && onCancel()}>
      <div
        ref={panelRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="correct-identity-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="correct-identity-title">{t('kycReview.correctTitle')}</h3>
        <p className="text-xs text-muted-foreground mb-4">
          {t('kycReview.correctBody', { client: clientName })}
        </p>

        <label className="block text-xs font-semibold mb-1" htmlFor="correct-dob">
          {t('kycReview.correctDob')}
        </label>
        <input
          id="correct-dob"
          type="date"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          disabled={loading}
          className="mb-3 h-9 w-full rounded-lg border border-input bg-card px-3 text-sm focus-outline"
        />

        <label className="block text-xs font-semibold mb-1" htmlFor="correct-address">
          {t('kycReview.correctAddress')}
        </label>
        <input
          id="correct-address"
          type="text"
          value={addr}
          onChange={(e) => setAddr(e.target.value)}
          disabled={loading}
          className="mb-3 h-9 w-full rounded-lg border border-input bg-card px-3 text-sm focus-outline"
        />

        {/*
          THE REFUSAL, deliberately not styled as a field error. It is addressed
          to the record rather than to the operator, and it names the remedy the
          product actually has — rejecting the verification — because another
          attempt at this form cannot succeed.
        */}
        {refusal && (
          <div
            className="mb-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3"
            role="alert"
          >
            <p className="text-xs font-bold text-destructive">
              {t('kycReview.correctRefusedTitle')}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{refusal}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('kycReview.correctRefusedRemedy')}
            </p>
          </div>
        )}

        {error && (
          <p className="text-xs font-semibold text-destructive mb-3" role="alert">
            {error}
          </p>
        )}

        <div className="modal-btns">
          <button className="btn-cancel" onClick={() => onCancel()} disabled={loading}>
            {t('common.cancel')}
          </button>
          <button
            className="btn-approve-confirm"
            onClick={() => void onConfirm(patch)}
            disabled={loading || nothingChanged}
          >
            {t('kycReview.correctConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
