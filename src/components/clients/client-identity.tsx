import { t } from '@/lib/i18n';

/*
 * How the console names a client — in one place, so every table agrees.
 *
 * ## The Portal ID is the only identifier printed
 *
 * `portalId` is the number staff and clients know an account by (backend
 * migration 0133): new clients from 1,000,000, clients imported from the old
 * platform under their old numbers. The uuid still addresses records — URLs,
 * API calls, React keys — but is never shown, so nobody reads or pastes one.
 * Every client search box takes the Portal ID, `#` and all, so what is read
 * here can be pasted straight back into any of them.
 *
 * ## Why the ID survives when everything else is hidden
 *
 * A role that hides client name and email (RBAC-03) gets those fields REMOVED
 * from the payload, and the table's notice says so once. The Portal ID is never
 * masked — it identifies the record, not the person — so it is what still
 * names the row. The uuid used to be that fallback, which printed 36
 * characters nobody could use.
 */

/** `#1000245`, with "Portal ID" spoken before it and shown on hover. */
export function PortalIdTag({ id }: { id: number }) {
  return (
    <span
      className="whitespace-nowrap font-mono text-[11px] font-normal text-muted-foreground"
      title={t('common.portalId')}
    >
      <span className="sr-only">{t('common.portalId')} </span>#{id}
    </span>
  );
}

/**
 * A client as a table row names them: name and Portal ID, email beneath.
 *
 * Absent parts are not rendered — a masked field arrives `undefined`. With
 * nothing at all to show, a dash rather than an empty cell that reads as a
 * rendering bug — or, given `removedId`, words saying the client is gone.
 */
export function ClientIdentity({
  name,
  email,
  portalId,
  strong = true,
  removedId,
}: {
  name?: string | null;
  email?: string | null;
  portalId?: number | null;
  /** The name in medium weight — off where the client is not the row's subject. */
  strong?: boolean;
  /**
   * The uuid, for the one case with nothing else to show: a client row that no
   * longer exists, which an append-only ledger outlives. Said in words, with
   * the uuid kept on hover for forensics rather than printed.
   */
  removedId?: string;
}) {
  const tag = portalId === null || portalId === undefined ? null : <PortalIdTag id={portalId} />;

  if (!name && !email) {
    if (tag) return tag;
    return removedId ? (
      <span className="text-xs italic text-muted-foreground" title={removedId}>
        {t('common.clientRemoved')}
      </span>
    ) : (
      <span className="text-xs text-muted-foreground">—</span>
    );
  }

  return (
    /*
     * CAPPED, with the full text on hover. An email is the widest thing in most
     * rows, and uncapped it set the column's width — one long address pushed a
     * money table's last columns under the pinned Actions column at desktop
     * widths. Truncation keeps the row readable; `title` keeps the value.
     */
    <div className="min-w-0 max-w-[16rem]">
      {name && (
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className={`truncate text-foreground ${strong ? 'font-medium' : ''}`} title={name}>
            {name}
          </span>
          {tag}
        </div>
      )}
      {email && (
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate text-xs text-muted-foreground" title={email}>
            {email}
          </span>
          {!name && tag}
        </div>
      )}
    </div>
  );
}

/** First and last name joined, or `undefined` when neither is readable. */
export function clientName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string | undefined {
  return [firstName, lastName].filter(Boolean).join(' ') || undefined;
}
