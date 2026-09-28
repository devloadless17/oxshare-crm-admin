'use client';

import { DocViewer } from '@/components/kyc-review/doc-viewer';
import type { ReviewDocumentGroup } from '@/components/kyc-review/review-sections';

/**
 * The review's files, one group per part of the verification — Identity
 * document, Proof of address, Selfie, then each of the broker's own steps —
 * each under its own heading (`reviewDocumentGroups` says why).
 *
 * `onOpen` receives the file's place in the ONE list the lightbox steps
 * through (`reviewDocuments`), which is these groups in this order.
 */
export function DocumentGroups({
  groups,
  onOpen,
}: {
  groups: ReviewDocumentGroup[];
  onOpen: (index: number) => void;
}) {
  const firstIndex = groups.map((_, at) =>
    groups.slice(0, at).reduce((count, group) => count + group.docs.length, 0),
  );
  return (
    <div className="space-y-5">
      {groups.map((group, at) => (
        <section
          key={group.id}
          aria-labelledby={`docs-${group.id}`}
          data-testid={`docs-group-${group.id}`}
          className="space-y-2.5"
        >
          <h4 id={`docs-${group.id}`} className="text-xs font-semibold text-foreground">
            {group.title}
          </h4>
          <div className="docs-grid">
            {group.docs.map((doc, i) => (
              <DocViewer
                key={doc.filePath}
                filePath={doc.filePath}
                fileName={doc.fileName}
                label={doc.label}
                onOpen={() => onOpen((firstIndex[at] ?? 0) + i)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
