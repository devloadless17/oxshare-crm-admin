'use client';

import type { RefObject } from 'react';

/**
 * Approval confirmation for a KYC submission.
 *
 * Approving is irreversible from the review screen, so the first click opens this
 * rather than calling the API — pinned by
 * src/app/kyc/[userId]/page.test.tsx ("asks for confirmation instead of approving
 * on the first click").
 *
 * The panel ref is passed in because the page owns the focus trap for both of its
 * dialogs (this page is styled-jsx, not the shared Modal component).
 */
export function ApproveDialog({
  panelRef,
  clientName,
  loading,
  error,
  onCancel,
  onConfirm,
}: {
  panelRef: RefObject<HTMLDivElement | null>;
  /** Who is being approved, so the confirmation names them. */
  clientName: string;
  loading: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <div className="modal-overlay" onClick={() => !loading && onCancel()}>
      <div
        ref={panelRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="approve-confirm-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="approve-confirm-title">Approve KYC Submission</h3>
        <p className="text-xs text-muted-foreground mb-4">
          This advances {clientName} to verification level 1 and unlocks gated features. This cannot
          be undone from the admin panel.
        </p>
        {error && (
          <p className="text-xs font-semibold text-destructive mb-3" role="alert">
            {error}
          </p>
        )}
        <div className="modal-btns">
          <button className="btn-cancel" onClick={() => onCancel()} disabled={loading}>
            Cancel
          </button>
          <button
            className="btn-approve-confirm"
            onClick={() => void onConfirm()}
            disabled={loading}
            aria-busy={loading}
          >
            {loading ? 'Approving...' : 'Confirm Approval'}
          </button>
        </div>
      </div>
    </div>
  );
}
