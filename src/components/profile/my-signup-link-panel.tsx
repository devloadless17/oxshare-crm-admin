'use client';

import * as React from 'react';
import { AlertTriangle, Copy, Pencil, type LucideIcon } from 'lucide-react';
import api from '@/lib/api';
import type { MySignupLink } from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { AsyncBoundary } from '@/components/async-boundary';
import { Badge } from '@/components/ui/badge';
import { copySignupLink } from '@/components/signup-links/copy-signup-link';
import { RenameSignupLinkDialog } from '@/components/signup-links/rename-signup-link-dialog';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * The administrator's OWN sign-up link (backend 0198): one each, `/join/<word>`.
 * A client who signs up through it gets this administrator's tags as they are
 * at that moment — read live from their territory, so what the panel lists is
 * exactly what the next sign-up gets. When that is nothing (they see every
 * client, or only countries), it says so plainly rather than letting clients
 * vanish into nobody's book.
 */
export function MySignupLinkPanel({ adminId, icon: Icon }: { adminId: string; icon: LucideIcon }) {
  const link = useResource<MySignupLink>(keys.signupLinks.mine(), (signal) =>
    api.admin.getMySignupLink(signal),
  );
  const [renaming, setRenaming] = React.useState(false);

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5">
      <header className="space-y-1">
        <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t('signup.title')}
        </h2>
        <p className="text-xs leading-relaxed text-muted-foreground">{t('signup.subtitle')}</p>
      </header>
      <AsyncBoundary
        status={link.status}
        label={t('signup.loading')}
        endpoints={['GET /admin/signup-links/me']}
        onRetry={link.refetch}
        errorMessage={t('signup.loadFailed')}
        error={link.error}
      >
        {link.data && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
                {link.data.url}
              </code>
              <button
                type="button"
                onClick={() => void copySignupLink(link.data!.url)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90 focus-outline"
              >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                {t('signup.copy')}
              </button>
              <button
                type="button"
                onClick={() => setRenaming(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-muted focus-outline"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                {t('signup.rename')}
              </button>
            </div>
            {link.data.addsNoTag ? (
              <p
                role="note"
                className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-[11px] text-warning"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{t('signup.addsNoTag')}</span>
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <span>{t('signup.gives')}</span>
                {link.data.tags.map((tag) => (
                  <Badge
                    key={tag.id}
                    variant="tag"
                    style={
                      tag.color
                        ? { backgroundColor: `${tag.color}22`, color: tag.color }
                        : undefined
                    }
                  >
                    {tag.label}
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {t('signup.counts', {
                signups: link.data.signups,
                verified: link.data.verified,
                funded: link.data.funded,
              })}
            </p>
            <RenameSignupLinkDialog
              adminId={adminId}
              current={link.data.slug}
              open={renaming}
              onClose={() => setRenaming(false)}
            />
          </div>
        )}
      </AsyncBoundary>
    </section>
  );
}
