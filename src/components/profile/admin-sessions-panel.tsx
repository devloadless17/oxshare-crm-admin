'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LogOut, Monitor, Smartphone, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { AsyncBoundary } from '@/components/async-boundary';
import { useResource } from '@/hooks/use-resource';
import { authApi, type AdminSession } from '@/lib/api/auth';
import { apiErrorMessage } from '@/lib/api/errors';
import { toastError, toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';

/**
 * Where this account is signed in, and a way to end any of it.
 *
 * ── One row per LOGIN, not per token ───────────────────────────────────────
 *
 * The server groups by refresh-token family, so a month-old session that has
 * rotated a thousand times is one row. `lastActiveAt` is the most recent
 * rotation, which is the closest thing to "when was this device last used" the
 * system actually knows — it is not a heartbeat, and the column says "last
 * active" rather than "online" for that reason.
 *
 * ── The current session has no button ──────────────────────────────────────
 *
 * The server refuses to revoke it and says why. Rendering the button anyway and
 * letting the refusal come back as an error would be offering an action that is
 * never valid; the row is labelled instead, and sign-out is in the account menu
 * one click away. Ending it here would half-work in a way worth naming: the
 * family would die, the httpOnly cookies would stay in the browser, and the
 * console would sit rendered until the next request 401'd.
 */
export function AdminSessionsPanel({ icon: Icon }: { icon: LucideIcon }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const sessions = useResource<AdminSession[]>(['admin-sessions'], (signal) =>
    authApi.sessions(signal),
  );

  const revoke = useMutation({
    mutationFn: (id: string) => authApi.revokeSession(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-sessions'] });
      toastSuccess(t('profile.sessionEnded'));
    },
    onError: (e: unknown) => toastError(e, t('profile.sessionEndFailed')),
  });

  const end = async (session: AdminSession) => {
    const ok = await confirm({
      title: t('profile.sessionEndTitle'),
      description: t('profile.sessionEndBody', { device: describeDevice(session.userAgent) }),
      confirmLabel: t('profile.sessionEndConfirm'),
      destructive: true,
    });
    if (ok) revoke.mutate(session.id);
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <header className="space-y-1">
        <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t('profile.sessionsTitle')}
        </h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t('profile.sessionsSubtitle')}
        </p>
      </header>

      <AsyncBoundary
        status={sessions.status}
        label={t('profile.sessionsLoading')}
        endpoints={['GET /admin/auth/sessions']}
        onRetry={sessions.refetch}
        errorMessage={apiErrorMessage(sessions.error, t('profile.sessionsFailed'))}
        error={sessions.error}
      >
        <ul className="divide-y divide-border">
          {(sessions.data ?? []).map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              busy={revoke.isPending && revoke.variables === session.id}
              onEnd={() => void end(session)}
            />
          ))}
        </ul>
        {sessions.data?.length === 0 && (
          /*
           * Reachable in principle and not in practice: reading this list
           * requires a session, so there is always at least one. It exists
           * because an empty <ul> renders as nothing at all, and "nothing"
           * reads as a broken panel rather than an answer.
           */
          <p className="py-4 text-xs text-muted-foreground">{t('profile.sessionsEmpty')}</p>
        )}
      </AsyncBoundary>
    </section>
  );
}

function SessionRow({
  session,
  busy,
  onEnd,
}: {
  session: AdminSession;
  busy: boolean;
  onEnd: () => void;
}) {
  const DeviceIcon = isMobile(session.userAgent) ? Smartphone : Monitor;

  return (
    <li className="flex items-center gap-3 py-3">
      <DeviceIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-foreground">
          <span className="truncate">{describeDevice(session.userAgent)}</span>
          {session.current && <Badge variant="success">{t('profile.sessionCurrent')}</Badge>}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">
          {/*
           * The IP is shown because it is the field that makes an unfamiliar
           * session recognisable AS unfamiliar — the user agent alone is the
           * same string on every Chrome on the planet. `null` for sessions
           * predating capture, and stated as unknown rather than blanked.
           */}
          {t('profile.sessionMeta', {
            when: formatWhen(session.lastActiveAt),
            ip: session.ip ?? t('profile.sessionUnknownIp'),
          })}
        </p>
      </div>

      {!session.current && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          loading={busy}
          className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={onEnd}
        >
          {!busy && <LogOut className="h-4 w-4" aria-hidden="true" />}
          {t('profile.sessionEnd')}
        </Button>
      )}
    </li>
  );
}

/**
 * A user agent, as something an operator can recognise.
 *
 * Deliberately crude — browser and platform, nothing more. A full UA parser is
 * a dependency and a maintenance stream, and the question this answers is only
 * "is one of these not me". Anything it cannot place is reported as unknown
 * rather than guessed at, because a wrong device name is worse than none: it
 * would talk somebody out of ending a session they should end.
 */
export function describeDevice(userAgent: string | null | undefined): string {
  if (!userAgent) return t('profile.sessionUnknownDevice');

  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /OPR\/|Opera/.test(userAgent)
      ? 'Opera'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : // Chrome must be tested BEFORE Safari: every Chrome UA also says Safari.
          /Chrome\//.test(userAgent)
          ? 'Chrome'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : null;

  const platform = /Windows/.test(userAgent)
    ? 'Windows'
    : /Android/.test(userAgent)
      ? 'Android'
      : // iPhone/iPad before Mac: iOS UAs also carry "like Mac OS X".
        /iPhone|iPad|iPod/.test(userAgent)
        ? 'iOS'
        : /Mac OS X|Macintosh/.test(userAgent)
          ? 'macOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : null;

  if (browser && platform) return `${browser} · ${platform}`;
  return browser ?? platform ?? t('profile.sessionUnknownDevice');
}

function isMobile(userAgent: string | null | undefined): boolean {
  return !!userAgent && /Android|iPhone|iPad|iPod|Mobile/.test(userAgent);
}

/** An absolute local timestamp — "2 hours ago" needs a clock this has no reason to run. */
function formatWhen(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}
