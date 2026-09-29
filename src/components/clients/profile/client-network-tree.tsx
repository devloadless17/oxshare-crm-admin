'use client';

import * as React from 'react';
import { ChevronDown, ChevronRight, Network, User, Users } from 'lucide-react';
import { Spinner } from '@/components/ui/loader';
import api from '@/lib/api';
import type { ClientProfile, IbPartnerDetail } from '@/lib/api/admin';
import type { ClientRef } from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { Badge } from '@/components/ui/badge';
import { PermittedLink } from '@/components/permitted-link';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';
import { PortalIdTag } from '@/components/clients/client-identity';

/**
 * The downline, drawn as the tree it actually is.
 *
 * A partner introduces CLIENTS and may have PARTNERS placed under them, and each
 * of those partners has the same two things again. A flat list of "clients
 * introduced" answered one level of that and silently stopped, so a master
 * partner's screen showed their own three clients and gave no hint that four
 * sub-partners held two hundred more between them.
 *
 * ## Loaded on EXPAND, one node at a time
 *
 * The alternative is a recursive endpoint that walks the whole subtree server
 * side. That is one query whose cost is the size of somebody's organisation,
 * paid on every profile open, to render rows almost all of which are collapsed.
 *
 * Fetching per node instead means the cost tracks what the operator actually
 * opened. `useResource` is given `enabled: expanded`, so a collapsed branch
 * issues no request at all, and react-query caches by node id — collapsing and
 * reopening is free.
 *
 * ## `MAX_DEPTH` is now the ONLY bound, and that changed in 0102
 *
 * `ib_levels` used to cap how deep placement could go — two rungs — so the
 * recursion terminated because the DATA terminated, and this guard was a
 * backstop against a cycle. There is no platform-wide ceiling any more: a
 * hierarchy may nest as deep as an operator builds it, and how far EARNINGS
 * travel is a separate question, answered by the ladder's configured depth.
 *
 * So this is load-bearing twice over. It still guards a cycle —
 * `parent_ib_user_id` is a self-FK and Postgres cannot prevent one, the same
 * hazard `resolveChain` guards on the money path — and it now also bounds a
 * legitimately deep tree, where a runaway recursion hangs the BROWSER rather
 * than the server.
 */
const MAX_DEPTH = 6;

export function ClientNetworkTree({
  rootUserId,
  rootPortalId,
  rootName,
  partner,
  referredClients,
  referredShown,
  referredTotal,
  referredOutsideScope,
}: {
  rootUserId: ClientRef;
  /** The root's Portal ID — what every link out of this tree carries. */
  rootPortalId: number;
  rootName: string;
  /** Null when the subject is not a partner — then only their referrals show. */
  partner: IbPartnerDetail | null;
  referredClients: ClientProfile['referredClients'];
  /**
   * How many rows CAME BACK, and how many there ARE. Both, because neither
   * alone can say "50 of 213".
   *
   * ⚠️ NEVER `referredClients.length` for the total. That is the count of what
   * FITTED, and reading it as a total is the mistake `IbOverviewDto` forbids by
   * name — "a screen showing a total must read THIS". Until `referredTotal`
   * landed this screen showed fifty rows and said nothing at all, so an
   * operator could not tell a partner with exactly fifty referrals from one
   * with two hundred.
   *
   * Both are SCOPED to the reader's territory, which is why the number here and
   * the length of the list it links into agree. They did not have to: an
   * unscoped count over a scoped list would read "12 of 213" and then show 12,
   * which is correct and looks like a bug.
   */
  referredShown?: number;
  referredTotal?: number;
  /**
   * How many of this partner's referrals are OUTSIDE the reader's territory.
   *
   * Both numbers above are scoped, which is correct — an unscoped total over a
   * scoped list reads as a bug. The cost was that a scoped admin whose subject's
   * whole downline sits elsewhere saw an empty tab, and an empty tab says "this
   * client introduced nobody". That is a false statement, not a narrower one,
   * and an operator acts on it.
   *
   * A count, never a name. The reader learns their view is partial and nothing
   * about who is missing.
   */
  referredOutsideScope?: number;
}) {
  /*
   * Only when there is genuinely more. `referredTotal` is absent for a reader
   * without ib.view — absent, never zero — and this whole tree is behind that
   * permission anyway, so an absent total means "not stated" rather than "none"
   * and must not render as a cap.
   */
  const capped =
    referredShown !== undefined && referredTotal !== undefined && referredTotal > referredShown;
  // Absent means "not stated" — only a POSITIVE count is a fact worth rendering.
  const hiddenByScope = referredOutsideScope !== undefined && referredOutsideScope > 0;
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-3">
        <Network className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {t('clientProfile.networkTitle')}
        </h2>
      </div>

      <div className="p-2">
        {/* The ROOT is the subject themselves, always expanded — collapsing the
            person whose profile this is would be a control with no purpose. */}
        <div className="flex items-center gap-2 rounded-lg bg-primary/5 px-2 py-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-link">
            <User className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <span className="text-sm font-semibold">{rootName}</span>
          {partner && (
            <Badge variant="tag">
              {t('clientProfile.levelBadge', { level: String(partner.level) })}
            </Badge>
          )}
        </div>

        <div className="ms-3 border-s border-border ps-3">
          <Branch
            userId={rootUserId}
            depth={0}
            preloadedPartner={partner}
            preloadedClients={referredClients ?? []}
            hiddenAtRoot={hiddenByScope}
          />
        </div>

        {/*
          THE CAP, SAID OUT LOUD, AND A WAY PAST IT.

          This list is capped server-side at one screen's worth. Until now the
          screen showed the cap and said nothing, so a partner with two hundred
          referrals looked identical to one with exactly fifty — and the
          constant's own justification, "the full book stays reachable through
          the client list filtered by referrer", named a filter that did not
          exist anywhere in the product. Both halves are true now: this states
          the number, and the link goes to the rest.

          Rendered only when there IS more. A notice on a complete list would
          teach an operator to ignore it on the one that is not.
        */}
        {/*
          THE PEOPLE THIS READER MAY NOT SEE.

          Rendered whether or not the visible list is empty, and that is the
          case it exists for: a partner whose entire downline sits in another
          territory rendered a tab saying they had introduced nobody. "None" and
          "none that are yours" are opposite facts about a partner, and only one
          of them is true.
        */}
        {hiddenByScope && (
          <p className="mt-2 border-t border-border px-2 pt-2 text-xs text-muted-foreground">
            {t('clientProfile.networkOutsideScope', { count: String(referredOutsideScope) })}
          </p>
        )}
        {capped && (
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border px-2 pt-2 text-xs text-muted-foreground">
            <span>
              {t('clientProfile.networkCapped', {
                shown: String(referredShown),
                total: String(referredTotal),
              })}
            </span>
            <PermittedLink
              href={`/clients?referredBy=${rootPortalId}`}
              className="font-semibold text-link hover:underline focus-outline"
            >
              {t('clientProfile.networkSeeAll')}
            </PermittedLink>
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * One node's children: the clients they introduced, then the partners beneath.
 *
 * The root passes what the page already fetched via `preloaded*`, so opening a
 * profile costs no extra request. Deeper nodes fetch their own on expand.
 */
function Branch({
  userId,
  depth,
  preloadedPartner,
  preloadedClients,
  hiddenAtRoot = false,
  enabled = true,
}: {
  userId: ClientRef;
  depth: number;
  preloadedPartner?: IbPartnerDetail | null;
  preloadedClients?: NonNullable<ClientProfile['referredClients']>;
  /** The root's referrals outside the reader's territory, said under the tree. */
  hiddenAtRoot?: boolean;
  enabled?: boolean;
}) {
  const needsFetch = enabled && preloadedPartner === undefined;

  const partnerQuery = useResource<IbPartnerDetail | null>(
    keys.clients.partner(userId),
    (signal) => api.admin.getPartnerDetail(userId, signal),
    { enabled: needsFetch },
  );
  const profileQuery = useResource<ClientProfile>(
    keys.clients.detail(userId),
    (signal) => api.admin.getClient(userId, signal),
    { enabled: needsFetch },
  );

  const partner = preloadedPartner !== undefined ? preloadedPartner : (partnerQuery.data ?? null);
  const clients = preloadedClients ?? profileQuery.data?.referredClients ?? [];
  const loading =
    needsFetch && (partnerQuery.status === 'loading' || profileQuery.status === 'loading');

  if (loading) {
    return (
      <p className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
        <Spinner />
        {t('clientProfile.networkLoading')}
      </p>
    );
  }

  const subPartners = partner?.directPartners ?? [];
  /*
   * THE PEOPLE BENEATH THIS NODE THE READER MAY NOT SEE — counted, never named
   * (R2). Without them an expanded partner whose line sits in another
   * territory said "Nobody beneath them", which is false. The ROOT's referred
   * count is said once, under the whole tree, so it is not repeated here.
   * Two lines rather than one sum: a person can be both a referred client and
   * a sub-partner, and a sum would count them twice.
   */
  const clientsOutside =
    preloadedClients === undefined ? (profileQuery.data?.referredOutsideScope ?? 0) : 0;
  const partnersOutside = partner?.directPartnersOutsideScope ?? 0;
  const outsideNotes = (
    <>
      {clientsOutside > 0 && (
        <p className="py-1 ps-1 text-xs text-muted-foreground">
          {t('clientProfile.networkOutsideScope', { count: String(clientsOutside) })}
        </p>
      )}
      {partnersOutside > 0 && (
        <p className="py-1 ps-1 text-xs text-muted-foreground">
          {t('clientProfile.networkPartnersOutsideScope', { count: String(partnersOutside) })}
        </p>
      )}
    </>
  );
  /*
   * ONE ROW PER PERSON. A client this partner introduced who later became a
   * partner placed under them is BOTH — a referred client and a sub-partner —
   * and was drawn twice (owner, 26 Sep 2026). They are shown once, as the
   * partner node, which is the one that opens onto their own branch.
   */
  const partnerIds = new Set(subPartners.map((sub) => sub.userId));
  const leaves = clients.filter((client) => !partnerIds.has(client.clientUserId));

  if (leaves.length === 0 && subPartners.length === 0) {
    if (clientsOutside > 0 || partnersOutside > 0) return outsideNotes;
    // The root's hidden referrals are said under the tree; "Nobody" would contradict it.
    if (preloadedClients !== undefined && hiddenAtRoot) return null;
    return <p className="py-2 text-xs text-muted-foreground">{t('clientProfile.networkEmpty')}</p>;
  }

  return (
    <div className="space-y-0.5">
      {leaves.map((client) => (
        <div key={client.clientUserId} className="flex items-center gap-2 py-1.5 ps-1">
          {/* A client is a LEAF: they introduce nobody, so they get no
              disclosure control. An always-disabled chevron would imply the
              opposite — that there is something here to open. */}
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <User className="h-3 w-3" aria-hidden="true" />
          </span>
          <ReferredClientLink client={client} />
        </div>
      ))}

      {subPartners.map((sub) => (
        <PartnerNode key={sub.userId} sub={sub} depth={depth} />
      ))}
      {outsideNotes}
    </div>
  );
}

/** A partner beneath this one — collapsible, and recursive through `Branch`. */
function PartnerNode({
  sub,
  depth,
}: {
  sub: NonNullable<IbPartnerDetail['directPartners']>[number];
  depth: number;
}) {
  const [open, setOpen] = React.useState(false);
  // The cycle backstop — see MAX_DEPTH. A self-referencing parent key can hold
  // a loop, and a tree that recursed on one would hang the browser.
  const canExpand = depth + 1 < MAX_DEPTH;
  // Name, else email, else the Portal ID — the first two are maskable (RBAC-03),
  // and this string also names the disclosure button for a screen reader. The
  // tag beside the link is shown only when it adds something.
  const known = [sub.firstName, sub.lastName].filter(Boolean).join(' ') || sub.email;
  const name = known || `#${sub.portalId}`;

  return (
    <div>
      <div className="flex items-center gap-1.5 py-1.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={!canExpand}
          aria-expanded={open}
          aria-label={t('clientProfile.networkToggle', { name })}
          className="focus-outline flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30"
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>

        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-link">
          <Users className="h-3 w-3" aria-hidden="true" />
        </span>

        <PermittedLink
          href={`/clients/${sub.portalId}`}
          className="truncate text-xs font-medium text-link hover:underline focus-outline"
        >
          {name}
        </PermittedLink>
        {known && <PortalIdTag id={sub.portalId} />}

        <Badge variant="tag">{t('clientProfile.levelBadge', { level: String(sub.level) })}</Badge>
        {!sub.active && <Badge variant="warning">{t('clientProfile.partnerSuspended')}</Badge>}
        <span className="font-mono text-[10px] text-muted-foreground">{sub.referralCode}</span>
      </div>

      {/*
        Mounted only while OPEN, which is what makes the lazy fetch lazy: an
        unmounted `Branch` runs no query, so a collapsed subtree costs nothing.
      */}
      {open && canExpand && (
        <div className="ms-2.5 border-s border-border ps-3">
          <Branch userId={sub.userId} depth={depth + 1} />
        </div>
      )}
    </div>
  );
}

/** A referred client: a leaf, named the way `PartnerNode` names a partner. */
function ReferredClientLink({
  client,
}: {
  client: NonNullable<ClientProfile['referredClients']>[number];
}) {
  const known = [client.firstName, client.lastName].filter(Boolean).join(' ') || client.email;
  return (
    <>
      <PermittedLink
        href={`/clients/${client.clientPortalId}`}
        className="truncate text-xs text-link hover:underline focus-outline"
      >
        {known || `#${client.clientPortalId}`}
      </PermittedLink>
      {known && <PortalIdTag id={client.clientPortalId} />}
    </>
  );
}
