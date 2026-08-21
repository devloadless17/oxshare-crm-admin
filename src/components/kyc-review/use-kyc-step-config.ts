'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import type { components } from '@/lib/api/types.gen';

type KycStepConfig = components['schemas']['KycStepConfigDto'];

/**
 * The live step configuration, for labelling what a client submitted.
 *
 * ## Why this loads with the CARD and not with the reject dialog
 *
 * `use-reject-options.ts` fetches the same endpoint, but deliberately only when
 * the dialog OPENS — most submissions are approved, so paying for it on every
 * review would waste a request. That reasoning does not carry here: the summary
 * card is the first thing on the screen and is read on every single review, so
 * the config is needed every time.
 *
 * ## Why an unreachable config does not block anything
 *
 * `personalInfoGroups` falls back to prettified keys, which is what the screen
 * showed before this existed. A reviewer whose config endpoint is down sees
 * slightly uglier labels and can still read every submitted value and still
 * decide — where blocking would stop a compliance decision because a list of
 * *labels* was unavailable. Same trade the reject dialog documents.
 */
export function useKycStepConfig(): KycStepConfig[] | undefined {
  const [steps, setSteps] = useState<KycStepConfig[] | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    api
      .get<KycStepConfig[]>('/admin/kyc-config')
      .then((r) => {
        if (!cancelled) setSteps(r.data);
      })
      .catch(() => {
        // Empty, not left undefined: both render prettified keys, but this says
        // "asked and got nothing" rather than "still loading" for ever.
        if (!cancelled) setSteps([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return steps;
}
