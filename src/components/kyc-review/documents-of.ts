import type { components } from '@/lib/api/types.gen';
import type { LightboxDoc } from './doc-lightbox';
import { t } from '@/lib/i18n';

type KycSubmission = components['schemas']['KycSubmissionDto'];

/**
 * The documents a submission actually carries, in review order.
 *
 * One list, derived once. The review screen used to branch on passport vs
 * non-passport and spell out three or four `<DocViewer>` elements per branch,
 * which meant the same four labels existed in two places and a document could
 * be added to one branch and forgotten in the other.
 *
 * It also gives the lightbox its `docs` array for free: paging between
 * documents needs exactly this list, and deriving it separately would let the
 * grid and the lightbox disagree about what is there.
 *
 * Absent files are dropped rather than rendered as empty slots — a submission
 * mid-upload has genuinely not got them, and an empty tile in a lightbox is a
 * dead frame the reviewer has to page past.
 */
export function documentsOf(data: KycSubmission): LightboxDoc[] {
  const isPassport = (data.document?.docType ?? 'passport') === 'passport';

  const candidates: { filePath?: string; fileName?: string; label: string }[] = [
    {
      filePath: data.document?.frontFilePath,
      fileName: data.document?.frontFileName,
      label: isPassport ? t('kycReview.docPassport') : t('kycReview.docIdFront'),
    },
    // A passport is one page; only an ID or licence has a back.
    ...(isPassport
      ? []
      : [
          {
            filePath: data.document?.backFilePath,
            fileName: data.document?.backFileName,
            label: t('kycReview.docIdBack'),
          },
        ]),
    {
      filePath: data.selfie?.filePath,
      fileName: data.selfie?.fileName,
      label: t('kycReview.docSelfie'),
    },
    {
      filePath: data.addressProof?.filePath,
      fileName: data.addressProof?.fileName,
      label: t('kycReview.docAddress'),
    },
    /*
     * PAGE TWO, which the reviewer could not see.
     *
     * The wizard offers a second address slot (`address_proof_2`), the API
     * stores it, counts it in the document total and serves it — and this list
     * stopped at page 1. So a two-page bank statement was approved or refused
     * on half its evidence, while the client's profile said four documents
     * were on file. The filter below still drops it when it was never
     * uploaded, which is the common case.
     */
    {
      filePath: data.addressProof?.page2FilePath,
      fileName: data.addressProof?.page2FileName,
      label: t('kycReview.docAddress2'),
    },
  ];

  return candidates.filter((d): d is LightboxDoc => typeof d.filePath === 'string' && !!d.filePath);
}
