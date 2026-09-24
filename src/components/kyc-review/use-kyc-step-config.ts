'use client';

import api from '@/lib/api';
import type { components } from '@/lib/api/types.gen';
import { useResource } from '@/hooks/use-resource';
import { keys } from '@/lib/query-keys';

type KycStepConfig = components['schemas']['KycStepConfigDto'];

/**
 * The live step configuration, for labelling what a client submitted.
 *
 * ## One cache entry, shared by everything on the review screen
 *
 * The summary card, the document grid and the reject dialog all name what the
 * client sent by the labels the broker configured — and they must agree, or a
 * file called "Payslip" in the grid is "Custom Field 1790263652846" in the
 * card. So this reads `keys.kyc.config()`, the SAME entry the KYC builder
 * fills: one request per screen, one answer for every caller, and a save in the
 * builder refreshes the review screen's labels with it.
 *
 * It used to be a `useState`/`useEffect` fetch per caller, which is how the
 * reject dialog came to load the configuration a second time on open.
 *
 * ## Why an unreachable config does not block anything
 *
 * `personalInfoGroups` falls back to readable keys. A reviewer whose config
 * endpoint is down sees plainer labels and can still read every submitted value
 * and still decide — where blocking would stop a compliance decision because a
 * list of *labels* was unavailable. Same trade the reject dialog documents.
 */
export function useKycStepConfig(): KycStepConfig[] | undefined {
  const query = useResource<KycStepConfig[]>(
    keys.kyc.config(),
    async (signal) => (await api.get<KycStepConfig[]>('/admin/kyc-config', { signal })).data,
  );
  if (query.status === 'loading') return undefined;
  // Empty, not undefined, on any failure: "asked and got nothing" rather than
  // "still loading" for ever.
  return query.status === 'ready' ? (query.data ?? []) : [];
}
