'use client';

import * as React from 'react';
import type { AcquisitionLink, AdminUser, ClientTagWithCount } from '@/lib/api/admin';
import { Modal } from '@/components/ui/modal';
import { ChipInput } from '@/components/ui/chip-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { t } from '@/lib/i18n';

export interface LinkFormValues {
  name: string;
  ownerAdminId?: string;
  /** Absent on create: the API gives the owner's own book. */
  tagIds?: string[];
}

/**
 * Create or edit a sign-up link (backend 0195).
 *
 * The tags offered are what the API will accept: never a country tag (every
 * client carries their own), and — without `links.manage` — only tags from the
 * reader's own territory, so the clients a link brings never land where its
 * owner cannot see them. The owner picker appears only with `links.manage`.
 */
export function LinkFormModal({
  open,
  link,
  tags,
  admins,
  allowedTagIds,
  canManage,
  selfId,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  /** Present when editing. */
  link?: AcquisitionLink;
  tags: readonly ClientTagWithCount[];
  /** Active administrators, for the owner picker (links.manage only). */
  admins: readonly AdminUser[];
  /** Tags this reader may put on a link; undefined = any non-country tag. */
  allowedTagIds?: readonly string[];
  canManage: boolean;
  selfId: string;
  saving: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (values: LinkFormValues) => void;
}) {
  return (
    <Modal
      busy={saving}
      open={open}
      onClose={onClose}
      title={link ? t('links.editTitle') : t('links.createTitle')}
      description={t('links.formHint')}
    >
      <LinkForm
        // Remount per link, so the form starts from that link's values.
        key={`${link?.id ?? 'new'}-${String(open)}`}
        link={link}
        tags={tags}
        admins={admins}
        allowedTagIds={allowedTagIds}
        canManage={canManage}
        selfId={selfId}
        saving={saving}
        error={error}
        onClose={onClose}
        onSubmit={onSubmit}
      />
    </Modal>
  );
}

function LinkForm({
  link,
  tags,
  admins,
  allowedTagIds,
  canManage,
  selfId,
  saving,
  error,
  onClose,
  onSubmit,
}: Omit<Parameters<typeof LinkFormModal>[0], 'open'>) {
  const [name, setName] = React.useState(link?.name ?? '');
  const [owner, setOwner] = React.useState(link?.ownerAdminId ?? selfId);
  // On create, untouched tags mean "the owner's own book" (the API decides).
  const [tagIds, setTagIds] = React.useState<string[] | undefined>(
    link ? link.tags.map((tag) => tag.id) : undefined,
  );

  const options = tags
    .filter((tag) => !tag.countryCode)
    .filter((tag) => !allowedTagIds || allowedTagIds.includes(tag.id))
    .map((tag) => ({ value: tag.id, label: tag.label }));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          name: name.trim(),
          ...(canManage ? { ownerAdminId: owner } : {}),
          ...(tagIds !== undefined ? { tagIds } : {}),
        });
      }}
    >
      <div>
        <label htmlFor="link-name" className="text-xs font-semibold">
          {t('links.nameField')}
        </label>
        <input
          id="link-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={100}
          placeholder={t('links.namePlaceholder')}
          className="mt-1 h-9 w-full rounded-lg border border-input bg-card px-3 text-sm focus-outline"
        />
      </div>

      {canManage && (
        <div>
          <label className="text-xs font-semibold" id="link-owner-label">
            {t('links.ownerField')}
          </label>
          <Select value={owner} onValueChange={setOwner}>
            <SelectTrigger aria-labelledby="link-owner-label" className="mt-1 h-9 w-full text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {admins
                .filter((admin) => admin.status === 'active')
                .map((admin) => (
                  <SelectItem key={admin.id} value={admin.id}>
                    {admin.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div>
        <span className="text-xs font-semibold">{t('links.tagsField')}</span>
        <div className="mt-1">
          <ChipInput
            value={tagIds ?? []}
            onChange={setTagIds}
            options={options}
            ariaLabel={t('links.tagsField')}
            placeholder={t('links.tagsPlaceholder')}
            disabled={saving}
          />
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {tagIds === undefined ? t('links.tagsDefaultHint') : t('links.tagsHint')}
        </p>
      </div>

      {error && (
        <p
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="h-9 rounded-lg border border-border px-4 text-xs font-semibold hover:bg-muted focus-outline"
        >
          {t('links.cancel')}
        </button>
        <button
          type="submit"
          disabled={saving || name.trim() === ''}
          className="h-9 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 focus-outline"
        >
          {link ? t('links.save') : t('links.create')}
        </button>
      </div>
    </form>
  );
}
