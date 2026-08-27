import { t } from '@/lib/i18n';

/**
 * When a settings panel was last saved, and by whom.
 *
 * Every save records `updated_by` and no panel rendered it, so the only way to
 * answer "who set the commission basis to this" was to go read the audit log.
 * These settings decide what partners are paid and whether mail leaves the
 * building; the panel should answer for itself.
 *
 * Renders NOTHING when nothing has been saved yet — a settings row still on
 * its boot configuration has no author, and "Last saved by —" would imply
 * somebody had touched it. When the row exists but the administrator has since
 * been deleted, the date stands alone rather than naming a ghost.
 */
export function SettingsSavedLine({
  updatedAt,
  updatedByName,
}: {
  updatedAt?: string | null;
  updatedByName?: string | null;
}) {
  if (!updatedAt) return null;

  const when = new Date(updatedAt).toLocaleString();
  return (
    <p className="text-xs text-muted-foreground">
      {updatedByName
        ? t('settings.lastSavedBy', { who: updatedByName, when })
        : t('settings.lastSavedAt', { when })}
    </p>
  );
}
