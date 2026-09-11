'use client';

import * as React from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { t } from '@/lib/i18n';

/**
 * RECORD THE PARTNER WHO INTRODUCED A CLIENT — once, and never again.
 *
 * ## The gap it closes
 *
 * `referredByIbUserId` is written at registration and nowhere else. A client who
 * arrived on a partner's link but lost the code — a truncated URL, a retyped
 * screenshot, or the sign-in detour this console fixed on 11 Sep — registered
 * attributed to NOBODY, permanently, with no route anywhere that could repair
 * it. `resolveReferral` deliberately logs an unknown code rather than refusing
 * the signup, so a lost code and a typo'd one had the identical outcome: silent
 * success with no attribution.
 *
 * ## NULL → A only. A → B is refused by the SERVICE
 *
 * The docs rule forbids a "change my IB" flow, and it is right: re-pointing an
 * existing attribution silently moves a partner's client, and their future
 * commission, to somebody else. Filling an EMPTY attribution takes nothing from
 * anyone — the introduction happened and the product lost it.
 *
 * This control renders only when `referrer` is ABSENT, but that is convenience.
 * The refusal lives in the service as a 409, so the route cannot become a
 * change-my-IB flow by somebody relaxing this condition later.
 *
 * ## It takes the CODE, never a partner id
 *
 * Support is holding what the client told them — "I used PARTNER01". An id would
 * force the operator to look a partner up, and looking up means picking one off
 * a list, which is the shape of CHOOSING WHO GETS PAID. Resolving a code the
 * client supplied repairs an attribution that existed; picking from a list
 * creates one. The input type is what keeps those apart.
 *
 * ## Three refusals, three sentences
 *
 * They share a status and not a meaning, which is why the API gives them
 * separate codes:
 *
 *   REFERRAL_CODE_UNKNOWN       a typo the operator can fix
 *   REFERRAL_SELF               a mistake they should see named
 *   REFERRAL_PARTNER_INACTIVE   the code was RIGHT and the partner is suspended
 *
 * The third is the reason the split is worth having. It tells the operator the
 * client was telling the truth and the problem is somewhere else entirely —
 * which is a different conversation from "check the spelling". Rendering it as a
 * validation error would buy nothing from the separation.
 */
const REFUSALS = {
  REFERRAL_CODE_UNKNOWN: 'clientProfile.refUnknown',
  REFERRAL_SELF: 'clientProfile.refSelf',
  REFERRAL_PARTNER_INACTIVE: 'clientProfile.refInactive',
  REFERRER_ALREADY_SET: 'clientProfile.refAlready',
} as const;

/*
 * `as const` rather than Record<string, string>, so the values stay the literal
 * keys `t()` accepts. A widened `string` compiles here and fails at the call —
 * which is the i18n key registry doing its job: a message key that does not
 * exist should be a build error, not a screen rendering its own key name.
 */
type RefusalCode = keyof typeof REFUSALS;

/** The operator's sentence for a refusal code, or the API's own message. */
export function refusalMessage(code: string | undefined, fallback: string): string {
  const key = code && code in REFUSALS ? REFUSALS[code as RefusalCode] : undefined;
  return key ? t(key) : fallback;
}

export function RecordReferrerDialog({
  clientName,
  loading,
  error,
  onCancel,
  onConfirm,
}: {
  clientName: string;
  loading: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: (referralCode: string) => Promise<void>;
}) {
  const [code, setCode] = React.useState('');

  return (
    <Modal open onClose={onCancel} title={t('clientProfile.recordReferrerTitle')}>
      <p className="text-xs text-muted-foreground">
        {t('clientProfile.recordReferrerBody', { client: clientName })}
      </p>

      <div className="mt-4">
        <Label htmlFor="referral-code">{t('clientProfile.recordReferrerField')}</Label>
        <Input
          id="referral-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          disabled={loading}
          autoComplete="off"
          className="mt-1 font-mono tracking-wide"
        />
      </div>

      {/*
        Said BEFORE the operator commits, not after. "Does this backdate
        commission" is the first question anybody asks, and the answer is no:
        `commission.service.ts` reads attribution at ACCRUAL time, so this pays
        on deals not yet accrued and restates nothing already credited.
        Promising a partner their client's history would be a lie told by a
        success toast.
      */}
      <p className="mt-2 text-xs text-muted-foreground">{t('clientProfile.refNoBackdate')}</p>

      {error && (
        <p className="mt-3 text-xs font-semibold text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={loading}>
          {t('common.cancel')}
        </Button>
        <Button onClick={() => void onConfirm(code.trim())} disabled={loading || !code.trim()}>
          {t('clientProfile.recordReferrerConfirm')}
        </Button>
      </div>
    </Modal>
  );
}
