'use client';

import * as React from 'react';
import { ChevronDown, ChevronRight, Loader2, Network, User, Users } from 'lucide-react';
import api from '@/lib/api';
import type { ClientProfile, IbPartnerDetail } from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { Badge } from '@/components/ui/badge';
import { PermittedLink } from '@/components/permitted-link';
import { t } from '@/lib/i18n';

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
 * ## Depth is bounded by the ladder, not by this component
 *
 * `ib_levels` decides how deep placement can go (two rungs today), so the
 * recursion terminates because the DATA terminates. `MAX_DEPTH` is a backstop
 * against a cycle — `parent_ib_user_id` is a self-FK and Postgres cannot prevent
 * one, which is the same hazard `resolveChain` guards on the money path. A tree
 * that recursed forever would hang the browser rather than the server, which is
 * why the guard is here as well as there.
 */
const MAX_DEPTH = 6;

export function ClientNetworkTree({
  rootUserId,
  rootName,
  partner,
  referredClients,
}: {
  rootUserId: string;
  rootName: string;
  /** Null when the subject is not a partner — then only their referrals show. */
  partner: IbPartnerDetail | null;
  referredClients: ClientProfile['referredClients'];
}) {
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
          {partner && <Badge variant="tag">{partner.levelName ?? `L${partner.level}`}</Badge>}
        </div>

        <div className="ms-3 border-s border-border ps-3">
          <Branch
            userId={rootUserId}
            depth={0}
            preloadedPartner={partner}
            preloadedClients={referredClients ?? []}
          />
        </div>
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
  enabled = true,
}: {
  userId: string;
  depth: number;
  preloadedPartner?: IbPartnerDetail | null;
  preloadedClients?: NonNullable<ClientProfile['referredClients']>;
  enabled?: boolean;
}) {
  const needsFetch = enabled && preloadedPartner === undefined;

  const partnerQuery = useResource<IbPartnerDetail | null>(
    ['client', userId, 'partner'],
    (signal) => api.admin.getPartnerDetail(userId, signal),
    { enabled: needsFetch },
  );
  const profileQuery = useResource<ClientProfile>(
    ['client', userId],
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
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        {t('clientProfile.networkLoading')}
      </p>
    );
  }

  const subPartners = partner?.directPartners ?? [];

  if (clients.length === 0 && subPartners.length === 0) {
    return <p className="py-2 text-xs text-muted-foreground">{t('clientProfile.networkEmpty')}</p>;
  }

  return (
    <div className="space-y-0.5">
      {clients.map((client) => (
        <div key={client.clientUserId} className="flex items-center gap-2 py-1.5 ps-1">
          {/* A client is a LEAF: they introduce nobody, so they get no
              disclosure control. An always-disabled chevron would imply the
              opposite — that there is something here to open. */}
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <User className="h-3 w-3" aria-hidden="true" />
          </span>
          <PermittedLink
            href={`/clients/${client.clientUserId}`}
            className="truncate text-xs text-link hover:underline focus-outline"
          >
            {[client.firstName, client.lastName].filter(Boolean).join(' ') || client.clientUserId}
          </PermittedLink>
        </div>
      ))}

      {subPartners.map((sub) => (
        <PartnerNode key={sub.userId} sub={sub} depth={depth} />
      ))}
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
  const name = [sub.firstName, sub.lastName].filter(Boolean).join(' ') || sub.email;

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
          href={`/clients/${sub.userId}`}
          className="truncate text-xs font-medium text-link hover:underline focus-outline"
        >
          {name}
        </PermittedLink>

        <Badge variant="tag">{sub.levelName}</Badge>
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
