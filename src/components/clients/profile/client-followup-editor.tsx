'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarIcon, X } from 'lucide-react';
import { startOfDay } from 'date-fns';
import api from '@/lib/api';
import type { ClientFollowUp, ClientRef } from '@/lib/api/admin';
import { apiErrorCode, apiFieldErrors } from '@/lib/api/errors';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useUnsavedGuard } from '@/components/kyc-assist/use-unsaved-guard';
import { FollowUpWhen } from '@/components/clients/follow-up-when';
import { toastError, toastSuccess } from '@/lib/toast';
import { keys } from '@/lib/query-keys';
import { t } from '@/lib/i18n';
import {
  FOLLOW_UP_MAX_LENGTH,
  followUpInstant,
  formatFollowUpAt,
  keepFollowUpDraft,
  keptFollowUpDraft,
  sameFollowUp,
  splitFollowUpAt,
  type FollowUpDraft,
} from '@/lib/follow-up';

// The calendar loads on its own, as on every period filter: ~160 KB most visits never open.
const Calendar = dynamic(() => import('@/components/ui/calendar').then((m) => m.Calendar), {
  ssr: false,
  loading: () => <div className="h-[311px] w-[273px]" aria-hidden="true" />,
});

/** The notes as the form edits them. */
export const draftOf = (record: ClientFollowUp): FollowUpDraft => ({
  followUp: record.followUp ?? '',
  result: record.result ?? '',
  followUpAt: record.followUpAt,
});

interface EditorState {
  draft: FollowUpDraft;
  /** The saved notes this draft started from, and their version — what a save is judged against. */
  base: FollowUpDraft;
  version: number;
  /** The draft came back from memory (another tab, another page) — said once. */
  restored: boolean;
}

function fresh(record: ClientFollowUp): EditorState {
  const draft = draftOf(record);
  return { draft, base: draft, version: record.version, restored: false };
}

/**
 * The two notes and the date, editable — for a reader holding
 * `clients.followup.edit`.
 *
 * NOTHING TYPED IS EVER LOST WITHOUT A WORD:
 * - A colleague's save that arrives while nothing here is unsaved is simply
 *   shown. One that arrives while something IS unsaved — by refetch, or as the
 *   API's 409 FOLLOWUP_STALE — keeps this draft and shows theirs beside it, with
 *   the choice: use theirs, or save mine over it on purpose.
 * - A draft survives switching tabs or pages (kept in memory, `lib/follow-up.ts`),
 *   and leaving by a link or closing the tab asks first.
 */
export function FollowUpEditor({
  adminId,
  clientId,
  record,
}: {
  adminId: string;
  clientId: ClientRef;
  record: ClientFollowUp;
}) {
  const queryClient = useQueryClient();
  const [state, setState] = React.useState<EditorState>(() => {
    const kept = keptFollowUpDraft(adminId, clientId);
    return kept ? { ...kept, restored: true } : fresh(record);
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [calendarOpen, setCalendarOpen] = React.useState(false);

  const dirty = !sameFollowUp(state.draft, state.base);
  /*
   * A NEWER version and nothing unsaved: take it ("reset when a prop changes", no
   * effect). Only newer: a read that left before this page's own save can land
   * after it, and must not put the older notes back on screen.
   */
  if (record.version > state.version && !dirty) setState(fresh(record));
  const conflict = dirty && record.version > state.version;

  React.useEffect(() => {
    keepFollowUpDraft(
      adminId,
      clientId,
      dirty ? { draft: state.draft, base: state.base, version: state.version } : undefined,
    );
  }, [adminId, clientId, dirty, state]);

  useUnsavedGuard(dirty, () => keepFollowUpDraft(adminId, clientId, undefined), {
    title: t('followUp.leaveTitle'),
    body: t('followUp.leaveBody'),
  });

  const save = useMutation({
    mutationFn: ({ draft, version }: { draft: FollowUpDraft; version: number }) =>
      api.admin.saveClientFollowUp(clientId, {
        followUp: draft.followUp,
        result: draft.result,
        followUpAt: draft.followUpAt,
        version,
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(keys.clients.followUp(clientId), saved);
      setState(fresh(saved));
      setErrors({});
      // The list's Follow-up and Result columns.
      void queryClient.invalidateQueries({ queryKey: keys.clients.lists() });
      toastSuccess(t('followUp.saved'));
    },
    onError: (error) => {
      if (apiErrorCode(error) === 'FOLLOWUP_STALE') {
        // Fetch their version; the conflict panel shows it beside this draft.
        void queryClient.invalidateQueries({ queryKey: keys.clients.followUp(clientId) });
        return;
      }
      const fields = apiFieldErrors(error);
      if (Object.keys(fields).length > 0) setErrors(fields);
      else toastError(error, t('followUp.saveFailed'));
    },
  });

  const setDraft = (patch: Partial<FollowUpDraft>) => {
    setErrors({});
    setState((current) => ({ ...current, draft: { ...current.draft, ...patch }, restored: false }));
  };
  const submit = () => {
    if (dirty && !conflict && !save.isPending) {
      save.mutate({ draft: state.draft, version: state.version });
    }
  };
  const keepMine = () => {
    // Rebased onto theirs, so the save is judged against what is stored now.
    const rebased: EditorState = { ...state, base: draftOf(record), version: record.version };
    setState(rebased);
    if (!sameFollowUp(rebased.draft, rebased.base)) {
      save.mutate({ draft: rebased.draft, version: rebased.version });
    }
  };

  const { day, time } = splitFollowUpAt(state.draft.followUpAt);
  const setWhen = (nextDay: Date | undefined, nextTime: string) =>
    setDraft({ followUpAt: followUpInstant(nextDay, nextTime) });
  const fieldId = (name: string) => `followup-${name}-${clientId}`;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          submit();
        }
      }}
      className="space-y-4"
    >
      {conflict && (
        <ConflictPanel
          theirs={record}
          busy={save.isPending}
          onUseTheirs={() => {
            setErrors({});
            setState(fresh(record));
          }}
          onKeepMine={keepMine}
        />
      )}
      {state.restored && dirty && !conflict && (
        <p className="text-xs text-muted-foreground" role="status">
          {t('followUp.restored')}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <NoteField
            id={fieldId('text')}
            label={t('followUp.followUpLabel')}
            hint={t('followUp.followUpHint')}
            placeholder={t('followUp.followUpPlaceholder')}
            value={state.draft.followUp}
            error={errors['followUp']}
            disabled={save.isPending}
            onChange={(followUp) => setDraft({ followUp })}
          />
          <div>
            <span className="text-xs font-semibold" id={fieldId('date-label')}>
              {t('followUp.dateLabel')}
            </span>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger
                  type="button"
                  aria-labelledby={fieldId('date-label')}
                  disabled={save.isPending}
                  className="focus-outline flex h-9 min-w-44 cursor-pointer items-center gap-2 rounded-lg border border-input bg-card px-3 text-left text-sm active:!scale-100 disabled:opacity-60"
                >
                  <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  {day ? formatFollowUpAt(day) : t('followUp.datePick')}
                </PopoverTrigger>
                <PopoverContent
                  className="w-auto p-0 [--tw-enter-scale:1] [--tw-exit-scale:1]"
                  align="start"
                >
                  <Calendar
                    mode="single"
                    selected={day}
                    defaultMonth={day}
                    onSelect={(picked) => {
                      setWhen(picked, time);
                      setCalendarOpen(false);
                    }}
                    // The API refuses a NEW date in the past; the picker does not offer one.
                    disabled={{ before: startOfDay(new Date()) }}
                    autoFocus
                  />
                </PopoverContent>
              </Popover>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                {t('followUp.timeLabel')}
                <input
                  type="time"
                  value={time}
                  disabled={!day || save.isPending}
                  onChange={(event) => setWhen(day, event.target.value)}
                  className="focus-outline h-9 rounded-lg border border-input bg-card px-2 text-sm text-foreground disabled:opacity-50"
                />
              </label>
              {day && (
                <button
                  type="button"
                  onClick={() => setWhen(undefined, '')}
                  disabled={save.isPending}
                  className="focus-outline inline-flex h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                  {t('followUp.clearDate')}
                </button>
              )}
            </div>
            {errors['followUpAt'] && (
              <p className="mt-1 text-xs text-destructive" role="alert">
                {errors['followUpAt']}
              </p>
            )}
          </div>
        </div>
        <NoteField
          id={fieldId('result')}
          label={t('followUp.resultLabel')}
          hint={t('followUp.resultHint')}
          placeholder={t('followUp.resultPlaceholder')}
          value={state.draft.result}
          error={errors['result']}
          disabled={save.isPending}
          onChange={(result) => setDraft({ result })}
        />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="me-auto text-[11px] text-muted-foreground">{t('followUp.shortcut')}</span>
        {dirty && !conflict && (
          <button
            type="button"
            onClick={() => {
              setErrors({});
              setState(fresh(record));
            }}
            disabled={save.isPending}
            className="h-9 rounded-lg border border-input px-3 text-xs font-semibold focus-outline"
          >
            {t('followUp.discard')}
          </button>
        )}
        <button
          type="submit"
          disabled={!dirty || conflict || save.isPending}
          className="h-9 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground focus-outline disabled:opacity-50"
        >
          {save.isPending ? t('common.saving') : t('followUp.save')}
        </button>
      </div>
    </form>
  );
}

/** One note: a label, a hint, the box, its count and any refusal under it. */
function NoteField({
  id,
  label,
  hint,
  placeholder,
  value,
  error,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  placeholder: string;
  value: string;
  error: string | undefined;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const near = value.length > FOLLOW_UP_MAX_LENGTH * 0.9;
  return (
    <div>
      <label htmlFor={id} className="text-xs font-semibold">
        {label}
      </label>
      <p id={`${id}-hint`} className="text-[11px] text-muted-foreground">
        {hint}
      </p>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        maxLength={FOLLOW_UP_MAX_LENGTH}
        placeholder={placeholder}
        disabled={disabled}
        aria-describedby={`${id}-hint`}
        aria-invalid={error ? true : undefined}
        className="focus-outline mt-1.5 w-full resize-y rounded-lg border border-input bg-card px-3 py-2 text-sm leading-relaxed disabled:opacity-60"
      />
      <div className="mt-0.5 flex items-start justify-between gap-3">
        <p className="text-xs text-destructive" role={error ? 'alert' : undefined}>
          {error}
        </p>
        <span
          className={`shrink-0 text-[11px] tabular ${near ? 'text-warning' : 'text-muted-foreground'}`}
        >
          {t('followUp.chars', { count: value.length, max: FOLLOW_UP_MAX_LENGTH })}
        </span>
      </div>
    </div>
  );
}

/** A colleague's newer notes beside an unsaved draft — the choice is the editor's. */
function ConflictPanel({
  theirs,
  busy,
  onUseTheirs,
  onKeepMine,
}: {
  theirs: ClientFollowUp;
  busy: boolean;
  onUseTheirs: () => void;
  onKeepMine: () => void;
}) {
  return (
    <div className="rounded-lg border border-warning/40 bg-warning/5 p-3" role="alert">
      <div className="flex gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
        <div className="min-w-0 flex-1 space-y-2 text-xs">
          <p className="font-semibold">
            {theirs.updatedBy
              ? t('followUp.conflictTitle', { name: theirs.updatedBy.name })
              : t('followUp.conflictTitleUnknown')}
          </p>
          <p className="text-muted-foreground">{t('followUp.conflictBody')}</p>
          <dl className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="font-semibold">{t('followUp.followUpLabel')}</dt>
              <dd className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words">
                {theirs.followUp ?? t('followUp.none')}
              </dd>
              {theirs.followUpAt && (
                <dd className="mt-1">
                  <FollowUpWhen at={theirs.followUpAt} />
                </dd>
              )}
            </div>
            <div>
              <dt className="font-semibold">{t('followUp.resultLabel')}</dt>
              <dd className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words">
                {theirs.result ?? t('followUp.none')}
              </dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={onUseTheirs}
              disabled={busy}
              className="h-8 rounded-lg border border-input bg-card px-3 font-semibold focus-outline"
            >
              {t('followUp.useTheirs')}
            </button>
            <button
              type="button"
              onClick={onKeepMine}
              disabled={busy}
              className="h-8 rounded-lg bg-primary px-3 font-semibold text-primary-foreground focus-outline disabled:opacity-50"
            >
              {t('followUp.keepMine')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
