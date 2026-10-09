import type { ClientTag } from '@/lib/api/admin';
import { Badge } from '@/components/ui/badge';
import { t } from '@/lib/i18n';
import { MaskedChip } from '@/components/masked-value';

/** Beyond this, the row becomes a wall of chips instead of a table cell. */
const VISIBLE = 3;

/**
 * A client's tags, in a table cell.
 *
 * The colour comes from the tag and is applied inline, because it is operator
 * data rather than a design token — which is why `Badge` has a `tag` variant
 * that supplies layout and typography and leaves colour to the caller.
 *
 * The overflow is a count, not a scroll: a row is not a place to read a long
 * list, and the full set is in the `title` for anyone who needs it now and on
 * the profile for anyone who needs it properly.
 */
export function ClientTagChips({ tags }: { tags?: readonly ClientTag[] }) {
  /*
   * ABSENT IS NOT EMPTY, and reading it as empty CRASHED the page.
   *
   * RBAC-03 masking removes a masked key from the response entirely, so a
   * reader whose role masks `client.tags` receives a profile with no `tags`
   * property at all. This signature said `readonly ClientTag[]` and went
   * straight to `tags.length`, so the client detail page threw
   * "Cannot read properties of undefined" and rendered nothing — reported as
   * the masking tag breaking the client page for a scoped admin. The type
   * claimed an array was guaranteed; the mask is exactly the case where it is
   * not.
   *
   * The two absences are then told apart, which is this codebase's standing
   * rule about masking: an em dash means the client HAS no tags, and the chip
   * means this reader may not see them. Collapsing them would tell a scoped
   * operator that an untagged client is one whose tags they are not cleared
   * for, or the reverse.
   */
  if (tags === undefined) return <MaskedChip />;
  if (tags.length === 0) return <span className="text-muted-foreground">—</span>;

  const shown = tags.slice(0, VISIBLE);
  const overflow = tags.length - shown.length;

  return (
    <span className="flex flex-wrap items-center gap-1" title={tags.map((x) => x.label).join(', ')}>
      {shown.map((tag) => (
        <Badge
          key={tag.id}
          variant="tag"
          style={
            tag.color
              ? // A tint rather than the raw colour: an operator-chosen hex as a
                // solid background is unreadable against one of the two themes
                // roughly half the time, and nothing here checks contrast.
                { backgroundColor: `${tag.color}22`, color: tag.color }
              : undefined
          }
        >
          {tag.label}
        </Badge>
      ))}
      {overflow > 0 && (
        <span className="text-[11px] text-muted-foreground">
          {t('tags.overflow', { count: overflow })}
        </span>
      )}
    </span>
  );
}
