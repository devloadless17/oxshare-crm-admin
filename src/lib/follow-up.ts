import { addDays, format, formatISO, isValid, parse, startOfDay } from 'date-fns';

/**
 * A client's Follow-up and Result (backend 0212) — the staff's two notes, and
 * the date to follow up by. The pure helpers the client page's card and the
 * clients list share.
 *
 * "Today" is the VIEWER's today, which only the browser knows — the same rule
 * as the period filter (`lib/date-presets.ts`): the list's "due" filter sends
 * the end of the viewer's day as an instant with its offset.
 */

/** The most either note may hold — `FOLLOW_UP_MAX_LENGTH` in the backend. */
export const FOLLOW_UP_MAX_LENGTH = 2000;

/** The list filter's values (`?followUp=`), as the API accepts them. */
export const FOLLOW_UP_FILTERS = ['due', 'upcoming', 'none'] as const;
export type FollowUpFilter = (typeof FOLLOW_UP_FILTERS)[number];

export function isFollowUpFilter(value: string): value is FollowUpFilter {
  return (FOLLOW_UP_FILTERS as readonly string[]).includes(value);
}

/**
 * The end of the viewer's today — the start of tomorrow, exclusive — as the API
 * reads it. Stable for the whole day, so it can sit in a query key.
 */
export function endOfTodayInstant(now: Date = new Date()): string {
  return formatISO(startOfDay(addDays(now, 1)));
}

export type FollowUpDue = 'overdue' | 'today' | 'later';

/** Where a follow-up date stands against the viewer's today. */
export function followUpDue(at: string | Date, now: Date = new Date()): FollowUpDue {
  const when = new Date(at).getTime();
  if (when < startOfDay(now).getTime()) return 'overdue';
  if (when < startOfDay(addDays(now, 1)).getTime()) return 'today';
  return 'later';
}

/**
 * The date as a person reads it: "Mon 12 Oct", with the time when one was
 * chosen ("Mon 12 Oct, 15:00") and the year when it is not this one. Midnight
 * means "no time chosen" — the picker stores a day without a time that way.
 */
export function formatFollowUpAt(at: string | Date, now: Date = new Date()): string {
  const when = new Date(at);
  if (!isValid(when)) return '';
  const day = when.getFullYear() === now.getFullYear() ? 'EEE d MMM' : 'EEE d MMM yyyy';
  const timed = when.getHours() !== 0 || when.getMinutes() !== 0;
  return format(when, timed ? `${day}, HH:mm` : day);
}

/** A stored date split into what the picker edits: the day, and `HH:mm` or ''. */
export function splitFollowUpAt(at: string | null | undefined): { day?: Date; time: string } {
  if (!at) return { time: '' };
  const when = new Date(at);
  if (!isValid(when)) return { time: '' };
  const time = when.getHours() !== 0 || when.getMinutes() !== 0 ? format(when, 'HH:mm') : '';
  return { day: startOfDay(when), time };
}

/**
 * The picker's day and optional time as the instant the API stores, with the
 * viewer's offset (`2026-10-12T15:00:00+03:00`). No day is no date; a blank or
 * malformed time is the start of the day.
 */
export function followUpInstant(day: Date | undefined, time: string): string | null {
  if (!day) return null;
  const at = /^\d{2}:\d{2}$/.test(time) ? parse(time, 'HH:mm', startOfDay(day)) : startOfDay(day);
  return formatISO(isValid(at) ? at : startOfDay(day));
}

/** The editable part of the notes, as the form holds it and the API compares it. */
export interface FollowUpDraft {
  followUp: string;
  result: string;
  /** An instant with offset, or null for no date. */
  followUpAt: string | null;
}

/** Same notes and the same moment? Text compared as the server stores it (trimmed). */
export function sameFollowUp(a: FollowUpDraft, b: FollowUpDraft): boolean {
  const moment = (at: string | null) => (at ? new Date(at).getTime() : null);
  return (
    a.followUp.trim() === b.followUp.trim() &&
    a.result.trim() === b.result.trim() &&
    moment(a.followUpAt) === moment(b.followUpAt)
  );
}

/*
 * Unsaved notes, kept IN MEMORY while the console is open — the KYC assist
 * page's rule (`components/kyc-assist/unsaved-drafts.ts`). The client page
 * unmounts a tab's content when another tab is chosen, so without this a
 * half-typed note vanished with one click. Memory, never storage: notes can
 * say anything about a person. Per administrator as well as per client, so a
 * colleague signing in on the same machine never sees another's typing.
 */
export interface KeptDraft {
  draft: FollowUpDraft;
  /** The notes the draft was started from, and their version — a save is judged against it. */
  base: FollowUpDraft;
  version: number;
}

const kept = new Map<string, KeptDraft>();
const keyOf = (adminId: string, clientId: string | number) => `${adminId}:${clientId}`;

export function keptFollowUpDraft(
  adminId: string,
  clientId: string | number,
): KeptDraft | undefined {
  return kept.get(keyOf(adminId, clientId));
}

/** Remember the unsaved notes — or, passed `undefined`, forget them. */
export function keepFollowUpDraft(
  adminId: string,
  clientId: string | number,
  value: KeptDraft | undefined,
): void {
  if (value) kept.set(keyOf(adminId, clientId), value);
  else kept.delete(keyOf(adminId, clientId));
}
