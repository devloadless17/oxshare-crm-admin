'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Plus, ShieldCheck, ShieldOff, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { IpAllowlistStatus } from '@/lib/api/admin';
import { AsyncBoundary } from '@/components/async-boundary';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';

/**
 * RBAC-08 — which networks may reach the administration API.
 *
 * The screen's real job is not the list; it is making the two dangerous facts
 * impossible to miss:
 *
 *   1. An EMPTY list means the feature is OFF. Without saying so plainly, an
 *      operator reads a page titled "IP allowlist", sees no errors, and believes
 *      they are protected when nothing is enforced.
 *   2. Adding the FIRST rule switches enforcement on immediately. If it does not
 *      cover the machine you are sitting at, you lose this screen. The API
 *      refuses that, but a refusal after the fact is a worse experience than a
 *      warning before it — so the form warns while you type.
 *   3. A `/0` rule makes the list non-empty while admitting every address, so
 *      the API reports `enforced: true` and this panel would show a green
 *      shield over a control that is doing nothing. The API now refuses to ADD
 *      one, but a row predating that check — or added by direct SQL — is still
 *      possible, and this screen is the last place anyone would notice.
 */

/**
 * Whether a stored rule admits every address.
 *
 * A string test rather than CIDR parsing, and that is safe *because* these
 * values are canonical: the API stores what `canonicaliseRule` emits, which
 * always ends in an explicit `/<prefix>`. So `/0` is exact — `10.0.0.0/20` ends
 * in `0` but not in `/0`.
 *
 * Reimplementing address arithmetic here would be the wrong trade: a second,
 * subtly different matcher on the frontend is how a UI ends up disagreeing with
 * the guard about who is admitted.
 */
export function admitsEveryAddress(cidr: string): boolean {
  return cidr.trim().endsWith('/0');
}
export function IpAllowlistPanel({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [cidr, setCidr] = React.useState('');
  const [label, setLabel] = React.useState('');

  const query = useResource<IpAllowlistStatus>(['settings', 'ip-allowlist'], () =>
    api.admin.getIpAllowlist(),
  );

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['settings', 'ip-allowlist'] });

  const addRule = useMutation({
    mutationFn: () => api.admin.addIpAllowlistRule({ cidr: cidr.trim(), label: label.trim() }),
    onSuccess: async () => {
      setCidr('');
      setLabel('');
      await invalidate();
    },
  });

  const removeRule = useMutation({
    mutationFn: (id: string) => api.admin.removeIpAllowlistRule(id),
    onSuccess: invalidate,
  });

  const status = query.data;
  const rules = status?.rules ?? [];
  const enforced = status?.enforced ?? false;
  const yourIp = status?.yourIp ?? null;

  // The first rule is the one that can lock you out, because it is the one that
  // turns enforcement on. Later rules cannot: the existing ones still cover you.
  const isFirstRule = rules.length === 0;

  // A rule that admits everyone defeats the list without emptying it, so the
  // API's `enforced` flag stays true and cannot be trusted for the banner.
  const wideOpenRules = rules.filter((rule) => admitsEveryAddress(rule.cidr));
  const effectivelyEnforced = enforced && wideOpenRules.length === 0;

  return (
    <AsyncBoundary
      status={query.status}
      label="Loading the IP allowlist"
      endpoints={[
        'GET /admin/ip-allowlist',
        'POST /admin/ip-allowlist',
        'DELETE /admin/ip-allowlist/:id',
      ]}
      onRetry={query.refetch}
      errorMessage="Failed to load the IP allowlist."
    >
      <div className="space-y-6">
        <div
          className={`flex items-start gap-3 rounded-xl border p-5 ${
            effectivelyEnforced
              ? 'border-success/30 bg-success/5'
              : wideOpenRules.length > 0
                ? 'border-destructive/40 bg-destructive/10'
                : 'border-warning/40 bg-warning/10'
          }`}
          role={wideOpenRules.length > 0 ? 'alert' : undefined}
        >
          {effectivelyEnforced ? (
            <ShieldCheck className="h-5 w-5 shrink-0 text-success" aria-hidden="true" />
          ) : (
            <ShieldOff
              className={`h-5 w-5 shrink-0 ${wideOpenRules.length > 0 ? 'text-destructive' : 'text-warning'}`}
              aria-hidden="true"
            />
          )}
          <div className="space-y-1">
            <h3 className="text-sm font-bold">
              {effectivelyEnforced
                ? `Enforced — ${rules.length} rule${rules.length === 1 ? '' : 's'}`
                : wideOpenRules.length > 0
                  ? 'Not effectively enforced — a rule admits every address'
                  : 'Not enforced — any network can reach the admin API'}
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {effectivelyEnforced ? (
                'Requests to the administration API are refused unless they come from one of the ranges below.'
              ) : wideOpenRules.length > 0 ? (
                <>
                  <code className="font-mono text-destructive">
                    {wideOpenRules.map((rule) => rule.cidr).join(', ')}
                  </code>{' '}
                  matches every address, so the list is non-empty but nothing is actually being
                  refused. Remove it. If you do want this protection switched off, remove{' '}
                  <em>all</em> the rules — that reports itself honestly.
                </>
              ) : (
                'The list is empty, which deliberately means this protection is switched OFF — so that deploying it cannot lock every administrator out. It starts working the moment you add the first rule.'
              )}
            </p>
            {yourIp && (
              <p className="text-xs text-muted-foreground">
                You are connecting from <code className="font-mono text-foreground">{yourIp}</code>.
              </p>
            )}
          </div>
        </div>

        {canManage && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addRule.mutate();
            }}
            className="rounded-xl border border-border bg-card p-5 space-y-4"
          >
            <div className="grid gap-4 sm:grid-cols-[1fr_1.5fr_auto] sm:items-end">
              <div>
                <label htmlFor="allow-cidr" className="text-xs font-semibold">
                  Address or range
                </label>
                <input
                  id="allow-cidr"
                  value={cidr}
                  onChange={(e) => setCidr(e.target.value)}
                  placeholder="203.0.113.0/24"
                  className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm font-mono focus-outline"
                />
              </div>
              <div>
                <label htmlFor="allow-label" className="text-xs font-semibold">
                  What is it?
                </label>
                <input
                  id="allow-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Beirut office"
                  className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus-outline"
                />
              </div>
              <button
                type="submit"
                disabled={addRule.isPending || cidr.trim() === '' || label.trim() === ''}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 focus-outline"
              >
                <Plus className="h-4 w-4" />
                {addRule.isPending ? 'Adding…' : 'Add rule'}
              </button>
            </div>

            <p className="text-[11px] text-muted-foreground">
              A single machine is <code className="font-mono">203.0.113.7</code>; a whole network is{' '}
              <code className="font-mono">203.0.113.0/24</code>. IPv6 works too. Give every rule a
              label — an unlabelled list is one nobody dares to prune later.
            </p>

            {isFirstRule && (
              <div
                className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-[11px] text-warning"
                role="note"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  <strong>This will be the first rule, so enforcement starts immediately.</strong>{' '}
                  Make sure it covers {yourIp ?? 'the machine you are using'} — otherwise you lose
                  access to this screen. The server refuses a rule that would lock you out, but it
                  is easier to get right than to undo.
                </span>
              </div>
            )}

            {addRule.isError && (
              <div
                className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
                role="alert"
              >
                {apiErrorMessage(addRule.error, 'Failed to add the rule.')}
              </div>
            )}
          </form>
        )}

        {removeRule.isError && (
          <div
            className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
            role="alert"
          >
            {apiErrorMessage(removeRule.error, 'Failed to remove the rule.')}
          </div>
        )}

        {rules.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No rules yet.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {rules.map((rule) => {
              const isLast = rules.length === 1;
              return (
                <li key={rule.id} className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <p className="font-mono text-sm font-semibold">{rule.cidr}</p>
                    <p className="text-xs text-muted-foreground">
                      {rule.label} · added {new Date(rule.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => {
                        const message = isLast
                          ? 'Remove the last rule? That switches this protection OFF and any network will be able to reach the admin API.'
                          : `Remove ${rule.cidr}?`;
                        if (window.confirm(message)) removeRule.mutate(rule.id);
                      }}
                      disabled={removeRule.isPending}
                      aria-label={`Remove ${rule.cidr}`}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-destructive/40 px-3 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50 focus-outline"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AsyncBoundary>
  );
}
