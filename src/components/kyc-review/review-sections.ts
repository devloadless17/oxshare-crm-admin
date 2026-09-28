import type { components } from '@/lib/api/types.gen';
import { isMasked } from '@/lib/masking';
import { t } from '@/lib/i18n';
import type { LightboxDoc } from './doc-lightbox';

type KycSubmission = components['schemas']['KycSubmissionDto'];

/**
 * What these helpers read — the live submission and a past attempt both fit,
 * so history is presented exactly as the review is.
 */
type KycDetail = Pick<
  KycSubmission,
  'layout' | 'personalInfo' | 'stepData' | 'rejectedFields' | 'document' | 'addressProof' | 'selfie'
> & { maskedFields?: string[]; status?: string };

/**
 * THE REVIEW, laid out by the SERVER (26 Sep 2026).
 *
 * The API sends `layout` beside the submission: the platform's identity fields
 * in their order, the identity document by its exact name with each page, the
 * proof of address and the selfie when they were asked for, the broker's own
 * questions grouped by the step they were asked on — as they were asked — and
 * each returned item's label. This turns that layout plus the (masked) values
 * into what the screen renders.
 *
 * It replaces a reading of the builder's configuration, which made the review
 * wrong three ways: a reviewer who cannot open the builder got a degraded
 * screen; a question relabelled after the client answered showed the new label;
 * and identity, documents and custom answers were one mixed list, with an
 * unknown document labelled `?? 'passport'`.
 */

export interface ReviewRow {
  key: string;
  label: string;
  value: string;
  empty: boolean;
  masked: boolean;
  /** The reviewer returned this item. */
  flagged: boolean;
  file?: { filePath: string; fileName: string };
}

export interface ReviewSection {
  id: string;
  title: string;
  rows: ReviewRow[];
}

type StoredFile = { filePath: string; fileName: string };

function isStoredFile(value: unknown): value is StoredFile {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as StoredFile).filePath === 'string' &&
    typeof (value as StoredFile).fileName === 'string'
  );
}

/**
 * A calendar date — `1990-04-12` — as a person reads it, on the day it IS.
 *
 * `new Date('1990-04-12').toLocaleDateString()` parses the string as UTC
 * midnight and prints it in the reviewer's zone, so anyone west of Greenwich
 * saw the date of birth ONE DAY EARLY — beside a passport showing the right
 * one. Built and printed in UTC, the day cannot move.
 */
export function formatCalendarDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, {
        timeZone: 'UTC',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
}

function display(raw: unknown, type: string): { value: string; empty: boolean } {
  const text = typeof raw === 'string' ? raw.trim() : typeof raw === 'number' ? String(raw) : '';
  if (text === '') return { value: '—', empty: true };
  if (type === 'date') return { value: formatCalendarDate(text), empty: false };
  if (type === 'checkbox') {
    if (text === 'true') return { value: t('kycReview.valueYes'), empty: false };
    if (text === 'false') return { value: t('kycReview.valueNo'), empty: false };
  }
  return { value: text, empty: false };
}

const IDENTITY_TYPES: Readonly<Record<string, string>> = { dateOfBirth: 'date' };

/** The client's identity, in the platform's order — every field, blank ones as "—". */
export function identitySection(data: KycDetail): ReviewSection {
  const flagged = new Set(data.rejectedFields ?? []);
  const values = data.personalInfo ?? {};
  return {
    id: 'identity',
    title: t('kycReview.identityTitle'),
    rows: (data.layout?.identity ?? []).map((field) => {
      const masked =
        isMasked(`kyc.personalInfo.${field.key}`, data.maskedFields) ||
        isMasked(`client.${field.key}`, data.maskedFields);
      const shown = masked
        ? { value: t('masking.hidden'), empty: true }
        : display(values[field.key], IDENTITY_TYPES[field.key] ?? 'text');
      return {
        key: field.key,
        label: field.label,
        ...shown,
        masked,
        flagged: flagged.has(field.key),
      };
    }),
  };
}

/** The broker's own questions, grouped by the step they were asked on. */
export function additionalSections(data: KycDetail): ReviewSection[] {
  const flagged = new Set(data.rejectedFields ?? []);
  const personal = data.personalInfo ?? {};
  const stepData = (data.stepData ?? {}) as Record<string, Record<string, unknown>>;
  const hidden = isMasked('kyc.stepData', data.maskedFields);
  return (data.layout?.additional ?? []).map((section) => ({
    id: section.slug,
    title: section.slug === 'unlisted' ? t('kycReview.unlistedAnswers') : section.title,
    rows: section.fields.map((field) => {
      const raw =
        field.step === 'personal' ? personal[field.name] : stepData[field.step]?.[field.name];
      const file = isStoredFile(raw) ? raw : undefined;
      const shown = hidden
        ? { value: t('masking.hidden'), empty: true }
        : file
          ? { value: file.fileName || t('kycReview.viewFile'), empty: false }
          : display(raw, field.type);
      return {
        key: `${field.step}.${field.name}`,
        label: field.label,
        ...shown,
        masked: hidden,
        flagged: flagged.has(field.name),
        ...(file && !hidden ? { file } : {}),
      };
    }),
  }));
}

/** Each returned item as every screen and the email name it. */
export function flagLabels(data: KycDetail): string[] {
  return (data.layout?.flags ?? []).map((flag) => flag.label);
}

/** The files of one part of the verification, under the heading the review gives it. */
export interface ReviewDocumentGroup {
  /** `identity` · `address` · `selfie`, or the broker's step slug. */
  id: string;
  title: string;
  docs: LightboxDoc[];
}

/**
 * Every file on the submission, GROUPED the way the verification is: the
 * identity document's pages (named by the document ON FILE — never a guessed
 * passport), the proof of address's, the selfie, then each of the broker's own
 * steps under its title.
 *
 * It was one flat grid, so the selfie sat straight after the tenancy
 * agreement's pages and read as part of the proof of address, and a custom
 * step's live-camera photo sat beside the selfie looking like a second one
 * (reported 28 Sep 2026). Empty groups are left out.
 *
 * A file the reviewer RETURNED is marked `returned` while the submission is
 * with the client — the rule that turns a returned answer red. Pages are
 * flagged by slot (`doc_back`), the selfie by `selfie`, a broker's upload by
 * its field; the tiles used to look the same whatever was returned (reported
 * 28 Sep 2026, beside the same gap in the summary).
 */
export function reviewDocumentGroups(data: KycDetail): ReviewDocumentGroup[] {
  const layout = data.layout;
  const rejected = data.status === 'rejected';
  const returned = new Set(rejected ? (data.rejectedFields ?? []) : []);
  const docsOf = (
    files: [string | undefined, string | undefined, string, string][],
  ): LightboxDoc[] =>
    files.flatMap(([filePath, fileName, label, flag]) =>
      filePath
        ? [
            {
              filePath,
              fileName: fileName ?? '',
              label,
              ...(returned.has(flag) ? { returned: true } : {}),
            },
          ]
        : [],
    );
  const pageLabel = (
    document: { label: string; pages: { slot: string; label: string }[] } | undefined,
    fallback: string,
    slot: string,
  ) => {
    const pages = document?.pages ?? [];
    const page = pages.find((p) => p.slot === slot);
    const name = document?.label ?? fallback;
    return page && pages.length > 1 ? `${name} — ${page.label}` : name;
  };
  const idDoc = layout?.identityDocument;
  const addressDoc = layout?.proofOfAddress;

  const groups: ReviewDocumentGroup[] = [
    {
      id: 'identity',
      title: t('kycReview.identityDocumentTitle'),
      docs: docsOf([
        [
          data.document?.frontFilePath,
          data.document?.frontFileName,
          pageLabel(idDoc, t('kycReview.docIdFront'), 'doc_front'),
          'doc_front',
        ],
        [
          data.document?.backFilePath,
          data.document?.backFileName,
          pageLabel(idDoc, t('kycReview.docIdFront'), 'doc_back'),
          'doc_back',
        ],
      ]),
    },
    {
      id: 'address',
      title: t('kycReview.proofOfAddressTitle'),
      docs: docsOf([
        [
          data.addressProof?.filePath,
          data.addressProof?.fileName,
          pageLabel(addressDoc, t('kycReview.docAddress'), 'address_proof'),
          'address_proof',
        ],
        [
          data.addressProof?.page2FilePath,
          data.addressProof?.page2FileName,
          pageLabel(addressDoc, t('kycReview.docAddress'), 'address_proof_2'),
          'address_proof_2',
        ],
      ]),
    },
    {
      id: 'selfie',
      title: t('kycReview.selfieTitle'),
      docs: docsOf([
        [data.selfie?.filePath, data.selfie?.fileName, t('kycReview.docSelfie'), 'selfie'],
      ]),
    },
    ...additionalSections(data).map((section) => ({
      id: section.id,
      title: section.title,
      docs: section.rows.flatMap((row) =>
        row.file
          ? [
              {
                ...row.file,
                label: row.label,
                ...(rejected && row.flagged ? { returned: true } : {}),
              },
            ]
          : [],
      ),
    })),
  ];
  return groups.filter((group) => group.docs.length > 0);
}

/**
 * The same files as ONE list, in the same order — what the lightbox steps
 * through, so its next and previous follow the page.
 */
export function reviewDocuments(data: KycDetail): LightboxDoc[] {
  return reviewDocumentGroups(data).flatMap((group) => group.docs);
}

/** One group of items a reviewer can return — see `reviewFieldGroups`. */
export interface ReviewFieldGroup {
  group: string;
  fields: { id: string; label: string }[];
}

/**
 * What a reviewer can ask the client to redo, grouped as the review shows it —
 * for the reject dialog and the re-verification dialog alike, from the SAME
 * layout, so a flag is offered under the name every other screen gives it.
 *
 * Documents are offered by PAGE, and only pages that exist: flagging the back
 * of an ID nobody uploaded asks the client to replace something they never
 * sent. (The server turns a whole-document flag into its pages anyway.)
 */
export function reviewFieldGroups(data: KycDetail): ReviewFieldGroup[] {
  const layout = data.layout;
  if (!layout) return [];
  const groups: ReviewFieldGroup[] = [
    {
      group: t('kycReview.identityTitle'),
      fields: layout.identity.map((field) => ({ id: field.key, label: field.label })),
    },
  ];
  const pages = (
    document: { label: string; pages: { slot: string; label: string }[] },
    present: Record<string, string | undefined>,
  ) =>
    document.pages
      .filter((page) => present[page.slot])
      .map((page) => ({
        id: page.slot,
        label: document.pages.length > 1 ? `${document.label} — ${page.label}` : document.label,
      }));
  const identityPages = pages(layout.identityDocument, {
    doc_front: data.document?.frontFilePath,
    doc_back: data.document?.backFilePath,
  });
  if (identityPages.length > 0) {
    groups.push({ group: t('kycReview.identityDocumentTitle'), fields: identityPages });
  }
  if (layout.proofOfAddress.asked) {
    const addressPages = pages(layout.proofOfAddress, {
      address_proof: data.addressProof?.filePath,
      address_proof_2: data.addressProof?.page2FilePath,
    });
    if (addressPages.length > 0) {
      groups.push({ group: t('kycReview.proofOfAddressTitle'), fields: addressPages });
    }
  }
  if (layout.selfie.asked && data.selfie?.filePath) {
    groups.push({
      group: t('kycReview.selfieTitle'),
      fields: [{ id: 'selfie', label: t('kycReview.docSelfie') }],
    });
  }
  for (const section of layout.additional) {
    if (section.slug === 'unlisted') continue;
    groups.push({
      group: section.title,
      fields: section.fields.map((field) => ({ id: field.name, label: field.label })),
    });
  }
  return groups.filter((group) => group.fields.length > 0);
}
