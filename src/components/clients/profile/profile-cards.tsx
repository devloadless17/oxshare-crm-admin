'use client';

import type { ReactNode } from 'react';
import { EyeOff } from 'lucide-react';
import type { ClientProfile } from '@/lib/api/admin';
import { MaskedValue } from '@/components/masked-value';
import { Badge } from '@/components/ui/badge';
import { t } from '@/lib/i18n';

/**
 * One section of the client profile.
 *
 * `hiddenReason` renders INSTEAD of the children when the viewer lacks the
 * permission — it does not merely dim them. A section that simply vanishes is
 * how a compliance reviewer concludes a client uploaded no documents when the
 * truth is that they cannot see documents.
 */
export function ProfileCard({
  title,
  hiddenReason,
  action,
  children,
}: {
  title: string;
  hiddenReason?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
        {action}
      </div>
      {hiddenReason ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground" role="note">
          <EyeOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {hiddenReason}
        </p>
      ) : (
        children
      )}
    </section>
  );
}

/** A labelled value in the identity grid. */
export function Field({
  label,
  field,
  profile,
  children,
}: {
  label: string;
  field: string;
  profile: ClientProfile;
  children?: ReactNode;
}) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm">
        {/*
         * Per-CELL masking here, unlike the LIST which drops the whole column.
         * A profile is a fixed labelled grid: omitting one field leaves an
         * unexplained hole and shifts the layout, so the label stays and the
         * value says why it is not there.
         */}
        <MaskedValue field={field} row={profile}>
          {children}
        </MaskedValue>
      </dd>
    </div>
  );
}

/**
 * An empty section, said out loud.
 *
 * `hiddenReason` above and this are the two halves that must never be confused:
 * "you cannot see documents" and "this client uploaded none" look identical if
 * both render as nothing.
 */
export function EmptySection({ message }: { message: string }) {
  return <p className="text-xs text-muted-foreground">{message}</p>;
}

export function KycStatusBadge({ status }: { status: string }) {
  const variant =
    status === 'approved'
      ? 'success'
      : status === 'rejected'
        ? 'destructive'
        : status === 'not_started'
          ? 'default'
          : 'warning';
  return (
    <Badge variant={variant} className="capitalize">
      {status.replace(/_/g, ' ')}
    </Badge>
  );
}

/** The profile's own not-found card — see the page for why it is deliberately vague. */
export function ClientNotFound() {
  return (
    <div className="rounded-xl border border-border bg-card p-8 text-center" role="alert">
      <h1 className="text-lg font-bold">{t('clientProfile.notFoundTitle')}</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        {t('clientProfile.notFoundBody')}
      </p>
    </div>
  );
}
