'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock, Loader2, Play, Server } from 'lucide-react';
import { adminApi, type ScheduledJob, type ScheduledJobList } from '@/lib/api/admin';
import { apiErrorMessage } from '@/lib/api/errors';
import { useResource } from '@/hooks/use-resource';
import { AsyncBoundary } from '@/components/async-boundary';
import { Button } from '@/components/ui/button';
import { toastError, toastSuccess } from '@/lib/toast';
import { relativeTime } from '@/lib/relative-time';
import { intervalSeconds, splitInterval, type IntervalUnit } from '@/lib/interval';
import { t, type MessageKey } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * SETTINGS → SCHEDULED JOBS (owner, 29 Sep 2026): every background job's timing,
 * edited here instead of in the server's environment file.
 *
 * The server holds the bounds and refuses a value outside them with a sentence;
 * this screen shows the bounds beside each control so the refusal is rare. Each
 * row also says what its last run did, refreshed every 30 seconds, so an
 * operator who shortens an interval can watch it take effect.
 */
export function ScheduledJobsPanel({ canManage }: { canManage: boolean }) {
  const jobs = useResource<ScheduledJobList>(
    keys.settings.scheduledJobs(),
    (signal) => adminApi.getScheduledJobs(signal),
    { refetchInterval: 30_000 },
  );

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <header className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t('jobs.title')}
        </h3>
        <p className="text-xs leading-relaxed text-muted-foreground">{t('jobs.subtitle')}</p>
        {!canManage && <p className="text-xs font-medium text-warning">{t('jobs.readOnly')}</p>}
      </header>

      <AsyncBoundary
        status={jobs.status}
        label={t('jobs.loading')}
        endpoints={['GET /admin/settings/scheduled-jobs']}
        onRetry={() => void jobs.refetch()}
        errorMessage={t('jobs.loadFailed')}
        error={jobs.error}
      >
        {jobs.data && <JobGroups items={jobs.data.items} canManage={canManage} />}
      </AsyncBoundary>
    </section>
  );
}

const GROUPS: { key: ScheduledJob['group']; label: MessageKey }[] = [
  { key: 'mt5', label: 'jobs.groupMt5' },
  { key: 'commission', label: 'jobs.groupCommission' },
  { key: 'money', label: 'jobs.groupMoney' },
  { key: 'system', label: 'jobs.groupSystem' },
];

function JobGroups({ items, canManage }: { items: ScheduledJob[]; canManage: boolean }) {
  return (
    <div className="space-y-5">
      {GROUPS.map((group) => {
        const rows = items.filter((job) => job.group === group.key);
        if (rows.length === 0) return null;
        return (
          <div key={group.key} className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t(group.label)}
            </h4>
            {group.key === 'commission' && (
              <p className="text-xs text-muted-foreground">{t('jobs.sharedCommission')}</p>
            )}
            <div className="divide-y divide-border rounded-lg border border-border">
              {rows.map((job) => (
                // Keyed on the stored interval too: a save (anyone's) remounts the row on the new value.
                <JobRow key={`${job.key}:${job.intervalSeconds}`} job={job} canManage={canManage} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** A job's name and description, by its key — the key itself if the console has no words for it yet. */
function jobText(key: string): { label: string; description: string | null } {
  // `t` answers undefined for a key the catalogue lacks (a job added on the server first).
  const named = t(`jobs.label.${key}` as MessageKey) as string | undefined;
  const described = t(`jobs.desc.${key}` as MessageKey) as string | undefined;
  return { label: named ?? key, description: described ?? null };
}

/** "15 minutes", "1 hour", "90 seconds" — the whole value in its largest exact unit. */
export function describeEvery(seconds: number): string {
  const { value, unit } = splitInterval(seconds);
  const unitLabel: Record<IntervalUnit, [MessageKey, MessageKey]> = {
    seconds: ['jobs.unitSecond', 'jobs.unitSeconds'],
    minutes: ['jobs.unitMinute', 'jobs.unitMinutes'],
    hours: ['jobs.unitHour', 'jobs.unitHours'],
    days: ['jobs.unitDay', 'jobs.unitDays'],
  };
  return `${value} ${t(unitLabel[unit][value === 1 ? 0 : 1])}`;
}

function duration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms / 60_000)} min`;
}

function JobRow({ job, canManage }: { job: ScheduledJob; canManage: boolean }) {
  const queryClient = useQueryClient();
  const text = jobText(job.key);
  const initial = splitInterval(job.intervalSeconds);
  const [value, setValue] = React.useState(String(initial.value));
  const [unit, setUnit] = React.useState<IntervalUnit>(initial.unit);
  const [error, setError] = React.useState<string | null>(null);

  const seconds = intervalSeconds(value, unit);
  const dirty = seconds !== job.intervalSeconds;
  const inBounds = seconds !== null && seconds >= job.minSeconds && seconds <= job.maxSeconds;

  const replaceList = (list: ScheduledJobList) =>
    queryClient.setQueryData(keys.settings.scheduledJobs(), list);

  const save = useMutation({
    mutationFn: () => adminApi.updateScheduledJob(job.key, seconds ?? job.intervalSeconds),
    onSuccess: (list) => {
      setError(null);
      replaceList(list);
      // (The commission pair's interval was mirrored on the Trading tab, which
      // went on 7 Oct 2026 — this list is now its only screen.)
      toastSuccess(
        t('jobs.saved', { job: text.label, every: describeEvery(seconds ?? job.intervalSeconds) }),
      );
    },
    onError: (e: unknown) => setError(apiErrorMessage(e, t('jobs.saveFailed'))),
  });

  const runNow = useMutation({
    mutationFn: () => adminApi.runScheduledJob(job.key),
    onSuccess: (list) => {
      replaceList(list);
      toastSuccess(t('jobs.runRequested', { job: text.label }));
    },
    onError: (e: unknown) => toastError(e, t('jobs.runFailed')),
  });

  const canRunNow = canManage && job.runsOn === 'crm' && !job.sharedInterval;
  const bounds = t('jobs.bounds', {
    min: describeEvery(job.minSeconds),
    max: describeEvery(job.maxSeconds),
  });
  const inputId = `job-${job.key.replace(/\W/g, '-')}`;

  return (
    <div className="grid gap-3 p-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] md:items-start">
      <div className="min-w-0 space-y-0.5">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          {text.label}
          {job.runsOn === 'bridge' && (
            <span className="inline-flex items-center gap-1 rounded-full border border-info/20 bg-info/10 px-2 py-0.5 text-[11px] font-medium text-info">
              <Server className="h-3 w-3" aria-hidden="true" />
              {t('jobs.runsOnBridge')}
            </span>
          )}
        </p>
        {text.description && <p className="text-xs text-muted-foreground">{text.description}</p>}
      </div>

      <form
        className="space-y-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty && inBounds) save.mutate();
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          {t('jobs.interval', { job: text.label })}
        </label>
        <div className="flex gap-2">
          <input
            id={inputId}
            type="number"
            min={1}
            step={1}
            value={value}
            disabled={!canManage || save.isPending}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            className="h-9 w-20 rounded-lg border border-input bg-card px-2 font-mono text-sm tabular-nums focus-outline disabled:cursor-not-allowed disabled:opacity-60"
          />
          <select
            aria-label={t('jobs.unit')}
            value={unit}
            disabled={!canManage || save.isPending}
            onChange={(e) => {
              setUnit(e.target.value as IntervalUnit);
              setError(null);
            }}
            className="h-9 rounded-lg border border-input bg-card px-2 text-xs focus-outline disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="seconds">{t('jobs.unitSeconds')}</option>
            <option value="minutes">{t('jobs.unitMinutes')}</option>
            <option value="hours">{t('jobs.unitHours')}</option>
            <option value="days">{t('jobs.unitDays')}</option>
          </select>
          {canManage && dirty && (
            <Button type="submit" size="sm" className="h-9" disabled={!inBounds || save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {t('jobs.save')}
            </Button>
          )}
        </div>
        <p
          className={`text-[11px] ${dirty && !inBounds ? 'text-destructive' : 'text-muted-foreground'}`}
        >
          {dirty && !inBounds
            ? t('jobs.outOfBounds', {
                min: describeEvery(job.minSeconds),
                max: describeEvery(job.maxSeconds),
              })
            : `${bounds} ${t('jobs.default', { every: describeEvery(job.defaultSeconds) })}`}
        </p>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </form>

      <div className="flex items-start justify-between gap-2">
        <LastRun job={job} />
        {canRunNow && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 shrink-0"
            disabled={runNow.isPending || job.running}
            onClick={() => runNow.mutate()}
            aria-label={`${t('jobs.runNow')}: ${text.label}`}
          >
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            {t('jobs.runNow')}
          </Button>
        )}
      </div>
    </div>
  );
}

function LastRun({ job }: { job: ScheduledJob }) {
  if (job.runsOn === 'bridge') {
    return (
      <p className="text-xs text-muted-foreground">
        {job.externalReadAt
          ? t('jobs.bridgeRead', { when: relativeTime(job.externalReadAt) })
          : t('jobs.bridgeNeverRead')}
      </p>
    );
  }
  if (job.running) {
    return (
      <p className="inline-flex items-center gap-1 text-xs text-info">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        {t('jobs.running')}
      </p>
    );
  }
  if (!job.lastStartedAt) {
    return <p className="text-xs text-muted-foreground">{t('jobs.never')}</p>;
  }
  const failed = Boolean(job.lastError);
  return (
    <div className="space-y-0.5 text-xs">
      <p
        className={`inline-flex items-center gap-1 font-medium ${failed ? 'text-destructive' : 'text-success'}`}
        title={job.lastError ?? undefined}
      >
        {failed ? (
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {failed ? t('jobs.failed') : t('jobs.ok')}
      </p>
      <p className="text-muted-foreground">
        {t('jobs.lastRun', {
          when: relativeTime(job.lastStartedAt),
          duration: duration(job.lastDurationMs),
        })}
      </p>
      {failed && <p className="break-words text-destructive">{job.lastError}</p>}
    </div>
  );
}
