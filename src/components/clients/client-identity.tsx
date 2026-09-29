import { t } from '@/lib/i18n';
import { PermittedLink } from '@/components/permitted-link';

/*
 * How the console names a client — in one place, so every table agrees.
 *
 * ## The Portal ID is the only identifier printed
 *
 * `portalId` is the number staff and clients know an account by (backend
 * migration 0133): new clients from 1,000,000, clients imported from the old
 * platform under their old numbers. Since backend 0159 (D-83) it is also the
 * client's primary key: URLs, API calls and React keys all carry it, and the
 * uuid it replaced no longer exists. Every client search box takes the Portal ID, `#` and all, so what is read
 * here can be pasted straight back into any of them.
 *
 * ## Why the ID survives when everything else is hidden
 *
 * A role that hides client name and email (RBAC-03) gets those fields REMOVED
 * from the payload, and the table's notice says so once. The Portal ID is never
 * masked — it identifies the record, not the person — so it is what still
 * names the row. The uuid used to be that fallback, which printed 36
 * characters nobody could use.
 *
 * ## A client's name OPENS their profile, on every screen (owner, 29 Sep 2026)
 *
 * Only the client list linked its names; on the withdrawal desk, deposits,
 * wallets, trading accounts, the ledger and the rest the name was plain text,
 * so reaching the person behind a row meant copying the Portal ID into the
 * client search. `ClientIdentity` links now, in the brand link colour, through
 * `PermittedLink` — plain text for an operator who may not open profiles. Pass
 * `link={false}` only where the identity already sits INSIDE another link (a
 * link in a link is invalid HTML and a click lands on the wrong one).
 */

/** Where a client's profile lives — by Portal ID, the one identifier the console shows. */
export function clientProfileHref(portalId: number): string {
  return `/clients/${portalId}`;
}

const LINK_CLASS = 'text-link hover:underline focus-outline rounded-sm';

/**
 * `#1000245`, with "Portal ID" spoken before it and shown on hover.
 *
 * `linked` makes it open the client's profile — for a screen where the Portal
 * ID is ALL that names a client (the audit log, a fully masked row).
 */
export function PortalIdTag({ id, linked = false }: { id: number; linked?: boolean }) {
  if (linked) {
    return (
      <PermittedLink href={clientProfileHref(id)} className={LINK_CLASS}>
        {/* The tag's grey would override the link colour; a link reads as one. */}
        <span
          className="relative whitespace-nowrap font-mono text-[11px] font-medium"
          title={t('common.portalId')}
        >
          <span className="sr-only">{t('common.portalId')} </span>#{id}
        </span>
      </PermittedLink>
    );
  }
  return (
    /*
     * `relative` makes this span the containing block of the `sr-only` label
     * inside it. Without it the label — absolutely positioned — is placed
     * against the PAGE, escapes the table's own scroll frame, and every tag in
     * a wide table stretched the document sideways on a phone (ux-sweep:
     * /audit-log was 714px wide on a 400px screen).
     */
    <span
      className="relative whitespace-nowrap font-mono text-[11px] font-normal text-muted-foreground"
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
  link = true,
}: {
  name?: string | null;
  email?: string | null;
  portalId?: number | null;
  /** The name in medium weight — off where the client is not the row's subject. */
  strong?: boolean;
  /**
   * The id, for the one case with nothing else to show: a client row that no
   * longer exists, which an append-only ledger outlives. Said in words, with
   * the id kept on hover for forensics rather than printed.
   */
  removedId?: string;
  /**
   * The name (or, with no name readable, the email) opens the client's profile.
   * Off only inside another link — see the note at the top of this file.
   */
  link?: boolean;
}) {
  const hasId = portalId !== null && portalId !== undefined;
  const tag = hasId ? <PortalIdTag id={portalId} /> : null;
  const linked = link && hasId;
  /** The row's leading text, as a profile link when there is a profile to open. */
  const lead = (text: string, className: string) =>
    linked ? (
      <PermittedLink href={clientProfileHref(portalId)} className={`truncate ${LINK_CLASS}`}>
        {/* `truncate` here too: without access the link renders its children bare. */}
        <span className={`truncate ${className}`} title={text}>
          {text}
        </span>
      </PermittedLink>
    ) : (
      <span className={`truncate ${className}`} title={text}>
        {text}
      </span>
    );

  if (!name && !email) {
    // Everything readable is masked: the Portal ID names the row, and opens it.
    if (hasId) return <PortalIdTag id={portalId} linked={link} />;
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
          {lead(name, `${linked ? '' : 'text-foreground'} ${strong ? 'font-medium' : ''}`)}
          {tag}
        </div>
      )}
      {email && (
        <div className="flex min-w-0 items-baseline gap-1.5">
          {name ? (
            <span className="truncate text-xs text-muted-foreground" title={email}>
              {email}
            </span>
          ) : (
            // No readable name: the email leads the row, so it is the link.
            lead(email, 'text-xs')
          )}
          {!name && tag}
        </div>
      )}
    </div>
  );
}

/**
 * A label for a client that is NEVER empty — the text-only sibling of
 * `ClientIdentity`, for titles, confirmations and aria labels.
 *
 * ## The defect this exists for
 *
 * Every screen used to write `[firstName, lastName].filter(Boolean).join(' ')`,
 * some falling back to `email`, some to a dash, some to nothing. All three
 * collapse under RBAC-03: a masked field is REMOVED from the payload, so a role
 * that hides name and email leaves every one of those expressions producing an
 * empty string.
 *
 * What an operator then sees is not "hidden" — it is nothing at all. Reported
 * from production: a client's partner card rendered blank, and the admin read
 * it as "this client has no IB". The IB was there, in their territory, and only
 * their NAME was masked. A masking feature that makes records look absent is
 * worse than one that shows too much, because the reader draws a confident
 * wrong conclusion instead of asking.
 *
 * `email` is not a safe fallback for the same reason — it is maskable too. The
 * Portal ID is, by catalogue rule (`client-fields.json`, `maskable: false`): it
 * identifies the RECORD rather than the person, so it survives every mask and
 * is the thing to print when nothing else may be shown.
 */
export function clientLabel(
  client: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    portalId?: number | null;
  },
  /** Shown only when even the Portal ID is absent — a row with no client. */
  fallback = '—',
): string {
  const name = clientName(client.firstName, client.lastName);
  if (name) return name;
  if (client.email) return client.email;
  if (client.portalId !== null && client.portalId !== undefined) return `#${client.portalId}`;
  return fallback;
}

/** First and last name joined, or `undefined` when neither is readable. */
export function clientName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string | undefined {
  return [firstName, lastName].filter(Boolean).join(' ') || undefined;
}
