'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dices } from 'lucide-react';
import api from '@/lib/api';
import { apiErrorMessage, apiFieldErrors } from '@/lib/api/errors';
import { Modal } from '@/components/ui/modal';
import { toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * Change an administrator's sign-up link word (backend 0198) — your own on your
 * profile, anybody's from Admin users with admins.edit. The server judges the
 * word; its refusal (taken, malformed) is shown under the field. The old link
 * stops working, and the dialog says so before anything is saved.
 */
export function RenameSignupLinkDialog({
  adminId,
  current,
  open,
  onClose,
}: {
  adminId: string;
  current: string;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('signup.renameTitle')}
      description={t('signup.renameHint')}
    >
      {/* Remounted per opening, so it starts from the current word. */}
      <RenameForm
        key={`${adminId}-${current}-${String(open)}`}
        adminId={adminId}
        current={current}
        onClose={onClose}
      />
    </Modal>
  );
}

function RenameForm({
  adminId,
  current,
  onClose,
}: {
  adminId: string;
  current: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [slug, setSlug] = React.useState(current);
  const done = async () => {
    await queryClient.invalidateQueries({ queryKey: keys.signupLinks.all() });
    toastSuccess(t('signup.renamed'));
    onClose();
  };
  const rename = useMutation({
    mutationFn: () => api.admin.renameSignupLink(adminId, slug.trim().toLowerCase()),
    onSuccess: done,
  });
  /*
   * The random word is made and saved by the SERVER, never here: the platform
   * owns the format, so links can later be made random-only.
   */
  const randomize = useMutation({
    mutationFn: () => api.admin.randomizeSignupLink(adminId),
    onSuccess: done,
  });
  const busy = rename.isPending || randomize.isPending;
  /** A new word clears the last refusal: it was about the word just replaced. */
  const change = (next: string) => {
    setSlug(next);
    rename.reset();
  };
  const fieldError = rename.isError ? apiFieldErrors(rename.error).slug : undefined;
  const failed = rename.isError ? rename.error : randomize.isError ? randomize.error : undefined;
  const otherError =
    failed && !fieldError ? apiErrorMessage(failed, t('signup.renameFailed')) : undefined;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        rename.mutate();
      }}
    >
      <div>
        <label htmlFor="signup-slug" className="text-xs font-semibold">
          {t('signup.renameField')}
        </label>
        <div className="mt-1 flex gap-2">
          <input
            id="signup-slug"
            value={slug}
            onChange={(e) => change(e.target.value)}
            maxLength={32}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={Boolean(fieldError)}
            aria-describedby={fieldError ? 'signup-slug-error' : undefined}
            className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-card px-3 font-mono text-sm focus-outline"
          />
          {/* An opaque link instead of a name: saved at once, the old word retired. */}
          <button
            type="button"
            onClick={() => {
              rename.reset();
              randomize.mutate();
            }}
            disabled={busy}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-muted disabled:opacity-50 focus-outline"
          >
            <Dices className="h-3.5 w-3.5" aria-hidden="true" />
            {t('signup.generate')}
          </button>
        </div>
        {fieldError && (
          <p
            id="signup-slug-error"
            role="alert"
            className="mt-1 text-[11px] font-medium text-destructive"
          >
            {fieldError}
          </p>
        )}
      </div>
      {otherError && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive"
        >
          {otherError}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="h-9 rounded-lg border border-border px-4 text-xs font-semibold hover:bg-muted focus-outline"
        >
          {t('signup.cancel')}
        </button>
        <button
          type="submit"
          disabled={busy || slug.trim() === '' || slug.trim().toLowerCase() === current}
          className="h-9 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 focus-outline"
        >
          {t('signup.save')}
        </button>
      </div>
    </form>
  );
}
