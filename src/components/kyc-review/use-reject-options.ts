'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import type { components } from '@/lib/api/types.gen';
import type { RejectionReason } from '@/lib/api/admin';
import { fieldGroupsFrom, type FieldGroup } from './field-options';

type KycStepConfig = components['schemas']['KycStepConfigDto'];

/**
 * Everything the reject dialog needs to offer, fetched when it opens.
 *
 * Two lists, both configurable and both belonging to the dialog rather than to
 * the review screen: the rejection reasons (FR-ADM-03's configurable list) and
 * the fields a client can be asked to re-submit (derived from the live KYC step
 * config — see field-options.ts for why that is not a constant).
 *
 * ## Why they load on OPEN rather than with the page
 *
 * This screen is opened far more often than it is used to reject — most
 * submissions are approved — so fetching both up front would issue two requests
 * per review that are usually thrown away.
 *
 * ## Why failure falls back instead of blocking
 *
 * A reviewer who cannot reach the config endpoint can still reject; they just
 * get the seeded field set. Refusing to open the dialog would make an
 * unreachable list of *labels* stop a compliance decision, which is the wrong
 * trade — the reason text is what FR-ADM-03 actually requires, and free text
 * covers it.
 */
export function useRejectOptions(open: boolean): {
  reasons: RejectionReason[];
  fieldGroups: FieldGroup[];
} {
  const [reasons, setReasons] = useState<RejectionReason[]>([]);
  const [steps, setSteps] = useState<KycStepConfig[] | undefined>(undefined);

  useEffect(() => {
    if (!open || reasons.length > 0) return;
    api.admin
      .getRejectionReasons('kyc')
      .then(setReasons)
      .catch(() => setReasons([]));
  }, [open, reasons.length]);

  useEffect(() => {
    if (!open || steps) return;
    api
      .get<KycStepConfig[]>('/admin/kyc-config')
      .then((r) => setSteps(r.data))
      .catch(() => setSteps([]));
  }, [open, steps]);

  return { reasons, fieldGroups: fieldGroupsFrom(steps) };
}
