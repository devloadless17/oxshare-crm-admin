'use client';

import type { ClientRow } from '@/lib/api/admin';
import { PermittedLink } from '@/components/permitted-link';
import { t } from '@/lib/i18n';

/**
 * Who introduced a client — the Referrals page's "Introduced by" cell.
 *
 * The API's three answers, each said differently:
 *
 *  - no `referrer`: nobody did (or this reader lacks `ib.view`, in which case
 *    the page does not draw the column at all) — an em dash;
 *  - `outsideTerritory`: a partner did, and this reader may not see who. Said
 *    in words, never as a dash, because "not introduced" would be false;
 *  - otherwise the partner's name, linking to their profile by Portal ID, with
 *    the Portal ID beneath. A masked name leaves the Portal ID, which is never
 *    masked, so the cell still names somebody the operator can look up.
 */
export function IntroducedByCell({ referrer }: { referrer: ClientRow['referrer'] }) {
  if (!referrer) return <span className="text-muted-foreground">—</span>;
  if (referrer.outsideTerritory || referrer.portalId === undefined) {
    return (
      <span className="text-xs text-muted-foreground">{t('clients.introducedByOutside')}</span>
    );
  }
  const name = [referrer.firstName, referrer.lastName].filter(Boolean).join(' ');
  return (
    <div className="flex flex-col leading-tight">
      <PermittedLink
        href={`/clients/${referrer.portalId}`}
        className="font-medium text-link hover:underline focus-outline"
      >
        {name || `#${referrer.portalId}`}
      </PermittedLink>
      {name && (
        <span className="font-mono text-[11px] text-muted-foreground">#{referrer.portalId}</span>
      )}
    </div>
  );
}
