'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import type { components } from '@/lib/api/types.gen';
import type { RejectionReason } from '@/lib/api/admin';
import { reviewFieldGroups, type ReviewFieldGroup } from './review-sections';

type KycDetail = components['schemas']['KycSubmissionDto'];

/**
 * What the reject dialog offers: the configured rejection reasons, loaded when
 * it opens, and the items a reviewer can return — from the submission's own
 * LAYOUT (`reviewFieldGroups`).
 *
 * It read the builder's configuration for the items, which a reviewer holding
 * `kyc.review` alone cannot open, so the dialog fell back to a fixed list that
 * named fields this form might not even ask. The layout comes with the
 * submission, so every reviewer gets the real list, named the way the review
 * names it.
 */
export function useRejectOptions(
  open: boolean,
  submission: KycDetail | null,
): { reasons: RejectionReason[]; fieldGroups: ReviewFieldGroup[] } {
  const [reasons, setReasons] = useState<RejectionReason[]>([]);

  useEffect(() => {
    if (!open || reasons.length > 0) return;
    api.admin
      .getRejectionReasons('kyc')
      .then(setReasons)
      .catch(() => setReasons([]));
  }, [open, reasons.length]);

  return { reasons, fieldGroups: submission ? reviewFieldGroups(submission) : [] };
}
