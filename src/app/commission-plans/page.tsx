'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Percent, Plus } from 'lucide-react';
import api from '@/lib/api';
import type { IbProgram } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { firstError, parseIntegerField } from '@/lib/form-values';
import { AsyncBoundary } from '@/components/async-boundary';
import { EmptyState } from '@/components/data-table';
import { Modal } from '@/components/ui/modal';

// ADM-10 (commission plans CRUD) + IB-06 (programs / tier ladder).
//
// This screen is where the client answers ARCHITECTURE §12's "open" commission
// questions themselves: L1/L2 shares (§12.2), rates and ladder (§12.3), the
// settlement window (§12.6) and rebate timing (§12.8). They are configuration,
// not constants — nothing here is hardcoded and changing a plan needs no deploy.
//
// MONEY RULE §6.1: values are strings end to end. The form keeps them as typed
// text and posts them verbatim — no Number(), no parseFloat.

const MODES = [
  { value: 'commission', label: 'Commission only', hint: 'IBs earn; clients get no rebate' },
  { value: 'rebate', label: 'Rebate only', hint: 'Clients get a rebate; IBs earn nothing' },
  { value: 'hybrid', label: 'Hybrid', hint: 'Both an IB commission and a client rebate' },
];

const METHODS = [
  {
    value: 'spread_share',
    label: 'Share of spread (%)',
    hint: 'Commission value is a percentage of the deal spread',
  },
  { value: 'per_lot', label: 'Per lot', hint: 'Commission value is money per traded lot' },
  {
    value: 'fixed_per_deal',
    label: 'Fixed per deal',
    hint: 'Commission value is money per closed deal',
  },
];

type FormState = {
  name: string;
  description: string;
  position: string;
  mode: string;
  method: string;
  commissionValue: string;
  rebateValue: string;
  l1Share: string;
  l2Share: string;
  settlementWindowHours: string;
  rebateOnClose: boolean;
  selectable: boolean;
};

const EMPTY_FORM: FormState = {
  name: '',
  description: '',
  position: '1',
  mode: 'commission',
  method: 'spread_share',
  commissionValue: '0',
  rebateValue: '0',
  l1Share: '0',
  l2Share: '0',
  settlementWindowHours: '24',
  rebateOnClose: false,
  selectable: true,
};

export default function CommissionPlansPage() {
  // Mutations require commissions.manage on the API; viewing needs only
  // commissions.view. Previously New/Edit/Activate rendered for both.
  const { admin } = useAdmin();
  const canManage = hasPermission(admin, 'commissions.manage');
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState<IbProgram | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const query = useResource<IbProgram[]>(
    ['commission-plans'],
    async (signal) => (await api.get<IbProgram[]>('/admin/commission-plans', { signal })).data,
  );
  const plans = query.data ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['commission-plans'] });

  const savePlan = useMutation({
    // Values are posted as the strings they were typed as (§6.1).
    mutationFn: (state: FormState) => {
      // `Number(x) || fallback` used to live on the two integer fields below.
      // Number('abc') is NaN and `NaN || 1` is 1, so a typo in Position silently
      // saved the plan at position 1 and a typo in the settlement window silently
      // set it to 0 — on the form that decides how partners get paid. Throwing
      // here routes the message through the existing savePlan.isError block via
      // apiErrorMessage's error.message fallback.
      const position = parseIntegerField(state.position, 'Position', { min: 1 });
      const window = parseIntegerField(state.settlementWindowHours, 'Settlement window', {
        min: 0,
      });
      const invalid = firstError(position, window);
      if (invalid) throw new Error(invalid);

      const payload = {
        name: state.name.trim(),
        description: state.description.trim() || undefined,
        position: position.ok ? position.value : 1,
        mode: state.mode,
        method: state.method,
        commissionValue: state.commissionValue.trim() || '0',
        rebateValue: state.rebateValue.trim() || '0',
        l1Share: state.l1Share.trim() || '0',
        l2Share: state.l2Share.trim() || '0',
        settlementWindowHours: window.ok ? window.value : 0,
        rebateOnClose: state.rebateOnClose,
        selectable: state.selectable,
      };
      return editing
        ? api.put(`/admin/commission-plans/${editing.id}`, payload)
        : api.post('/admin/commission-plans', payload);
    },
    onSuccess: async () => {
      setShowForm(false);
      await invalidate();
    },
  });

  const toggleActive = useMutation({
    mutationFn: (plan: IbProgram) =>
      api.patch(`/admin/commission-plans/${plan.id}/active`, { active: !plan.active }),
    onSuccess: invalidate,
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    savePlan.reset();
    setShowForm(true);
  };

  const openEdit = (plan: IbProgram) => {
    setEditing(plan);
    setForm({
      name: plan.name,
      description: plan.description ?? '',
      position: String(plan.position),
      mode: plan.mode,
      method: plan.method,
      commissionValue: plan.commissionValue,
      rebateValue: plan.rebateValue,
      l1Share: plan.l1Share,
      l2Share: plan.l2Share,
      settlementWindowHours: String(plan.settlementWindowHours),
      rebateOnClose: plan.rebateOnClose,
      selectable: plan.selectable,
    });
    savePlan.reset();
    setShowForm(true);
  };

  // Float arithmetic is acceptable here, and only here, because this value is
  // never sent anywhere — it drives a "total N%" hint and an `> 100` warning.
  // Verified exhaustively: every split of 100 at 1dp and 2dp, plus 8dp cases like
  // 33.33333333 + 66.66666667, sums to exactly 100 in IEEE754 at this magnitude.
  // The shares themselves are posted as the strings they were typed as (§6.1).
  const shareTotal = (Number(form.l1Share) || 0) + (Number(form.l2Share) || 0);
  const isPercentMethod = form.method === 'spread_share';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Commission Plans</h1>
          <p className="text-sm text-muted-foreground mt-1">
            IB programs and their rates. Set the L1/L2 split, the commission method, the settlement
            window and rebate timing here — no deploy needed.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          disabled={query.status !== 'ready' || !canManage}
          title={canManage ? undefined : 'Requires the commissions.manage permission'}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 focus-outline"
        >
          <Plus className="h-4 w-4" />
          New Plan
        </button>
      </div>

      <AsyncBoundary
        status={query.status}
        label="Loading commission plans"
        endpoints={[
          'GET /admin/commission-plans',
          'POST /admin/commission-plans',
          'PUT /admin/commission-plans/:id',
          'PATCH /admin/commission-plans/:id/active',
        ]}
        onRetry={query.refetch}
        errorMessage="Failed to load commission plans."
      >
        {toggleActive.isError && (
          <div
            className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
            role="alert"
          >
            {apiErrorMessage(toggleActive.error, 'Failed to change the plan status.')}
          </div>
        )}
        {plans.length === 0 ? (
          <EmptyState
            icon={Percent}
            message="No commission plans yet. Create the first one to define how IBs earn — the commission engine reads these values, so nothing needs to be hardcoded."
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {plans.map((p) => (
              <div
                key={p.id}
                className={`rounded-xl border bg-card p-6 shadow-xs space-y-4 ${p.active ? 'border-border' : 'border-dashed border-border opacity-70'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-bold text-foreground">{p.name}</h3>
                      <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase">
                        Tier {p.position}
                      </span>
                      {!p.active && (
                        <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase">
                          Inactive
                        </span>
                      )}
                      {!p.selectable && p.active && (
                        <span className="rounded-md bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning uppercase">
                          Not selectable
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {p.description || 'No description'}
                    </p>
                  </div>
                </div>

                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border/60 pt-3 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Mode</dt>
                    <dd className="font-semibold text-foreground capitalize">{p.mode}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Method</dt>
                    <dd className="font-semibold text-foreground">
                      {METHODS.find((m) => m.value === p.method)?.label ?? p.method}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Commission</dt>
                    {/* String, rendered verbatim */}
                    <dd className="font-mono font-semibold text-foreground">
                      {p.commissionValue}
                      {p.method === 'spread_share' ? '%' : ''}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Client rebate</dt>
                    <dd className="font-mono font-semibold text-foreground">{p.rebateValue}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">L1 / L2 split</dt>
                    <dd className="font-mono font-semibold text-foreground">
                      {p.l1Share}% / {p.l2Share}%
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Settlement window</dt>
                    <dd className="font-semibold text-foreground">{p.settlementWindowHours}h</dd>
                  </div>
                </dl>

                {p.rebateOnClose && (
                  <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-2.5 text-[11px] text-warning">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>
                      Rebate credits on deal close, ahead of the settlement window — pays out on
                      trades that may still reverse, and Phase 1 has no clawback.
                    </span>
                  </div>
                )}

                <div className="flex gap-2 border-t border-border/60 pt-3">
                  {!canManage && <span className="text-xs text-muted-foreground">View only</span>}
                  {canManage && (
                    <>
                      <button
                        type="button"
                        onClick={() => openEdit(p)}
                        className="h-8 px-3 rounded-md border border-input bg-card text-xs font-semibold hover:bg-muted focus-outline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleActive.mutate(p)}
                        className="h-8 px-3 rounded-md border border-input bg-card text-xs font-semibold hover:bg-muted focus-outline"
                      >
                        {p.active ? 'Deactivate' : 'Activate'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </AsyncBoundary>

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        size="lg"
        labelledBy="plan-form-title"
        title={editing ? `Edit “${editing.name}”` : 'New Commission Plan'}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            savePlan.mutate(form);
          }}
          className="space-y-5 text-xs pt-2"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label htmlFor="plan-name" className="font-semibold">
                Plan name
              </label>
              <input
                id="plan-name"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Standard IB"
                className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 focus-outline"
              />
            </div>
            <div>
              <label htmlFor="plan-position" className="font-semibold">
                Ladder position
              </label>
              <input
                id="plan-position"
                type="number"
                min={1}
                value={form.position}
                onChange={(e) => setForm({ ...form, position: e.target.value })}
                className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 focus-outline"
              />
            </div>
          </div>

          <div>
            <label htmlFor="plan-desc" className="font-semibold">
              Description
            </label>
            <input
              id="plan-desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Who this tier is for"
              className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 focus-outline"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="plan-mode" className="font-semibold">
                Mode
              </label>
              <select
                id="plan-mode"
                value={form.mode}
                onChange={(e) => setForm({ ...form, mode: e.target.value })}
                className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 focus-outline"
              >
                {MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {MODES.find((m) => m.value === form.mode)?.hint}
              </p>
            </div>
            <div>
              <label htmlFor="plan-method" className="font-semibold">
                Commission method
              </label>
              <select
                id="plan-method"
                value={form.method}
                onChange={(e) => setForm({ ...form, method: e.target.value })}
                className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 focus-outline"
              >
                {METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {METHODS.find((m) => m.value === form.method)?.hint}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="plan-commission" className="font-semibold">
                Commission value {isPercentMethod ? '(% of spread)' : '(amount)'}
              </label>
              <input
                id="plan-commission"
                inputMode="decimal"
                value={form.commissionValue}
                onChange={(e) => setForm({ ...form, commissionValue: e.target.value })}
                className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 font-mono focus-outline"
              />
            </div>
            <div>
              <label htmlFor="plan-rebate" className="font-semibold">
                Client rebate value
              </label>
              <input
                id="plan-rebate"
                inputMode="decimal"
                value={form.rebateValue}
                onChange={(e) => setForm({ ...form, rebateValue: e.target.value })}
                disabled={form.mode === 'commission'}
                className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 font-mono disabled:opacity-50 focus-outline"
              />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-foreground">Two-level split</span>
              <span
                className={`font-mono text-[11px] ${shareTotal > 100 ? 'text-destructive font-bold' : 'text-muted-foreground'}`}
              >
                total {shareTotal}%{shareTotal > 100 ? ' — exceeds 100%' : ''}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="plan-l1" className="font-semibold">
                  L1 share (%)
                </label>
                <input
                  id="plan-l1"
                  inputMode="decimal"
                  value={form.l1Share}
                  onChange={(e) => setForm({ ...form, l1Share: e.target.value })}
                  className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 font-mono focus-outline"
                />
              </div>
              <div>
                <label htmlFor="plan-l2" className="font-semibold">
                  L2 share (%)
                </label>
                <input
                  id="plan-l2"
                  inputMode="decimal"
                  value={form.l2Share}
                  onChange={(e) => setForm({ ...form, l2Share: e.target.value })}
                  className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 font-mono focus-outline"
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Resolution stops at L2 — an IB three levels above a trading client earns nothing. Any
              remainder below 100% stays with the broker.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="plan-window" className="font-semibold">
                Settlement window (hours)
              </label>
              <input
                id="plan-window"
                type="number"
                min={0}
                value={form.settlementWindowHours}
                onChange={(e) => setForm({ ...form, settlementWindowHours: e.target.value })}
                className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 font-mono focus-outline"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                How long accruals wait before they are confirmed and credited.
              </p>
            </div>
            <div className="space-y-2 pt-5">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.rebateOnClose}
                  onChange={(e) => setForm({ ...form, rebateOnClose: e.target.checked })}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-semibold">Credit rebate on deal close</span>
                  <span className="block text-[11px] text-muted-foreground">
                    Skips the settlement window for the client rebate.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.selectable}
                  onChange={(e) => setForm({ ...form, selectable: e.target.checked })}
                  className="mt-0.5"
                />
                <span className="font-semibold">IBs may select this plan</span>
              </label>
            </div>
          </div>

          {form.rebateOnClose && (
            <div
              className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-[11px] text-warning"
              role="alert"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                <strong>Check this with the client before saving.</strong> Crediting the rebate on
                close pays out on trades that may later reverse, and Phase 1 has no clawback.
                ARCHITECTURE §12.8 recommends keeping both legs behind the same settlement window.
              </span>
            </div>
          )}

          {savePlan.isError && (
            <div
              className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
              role="alert"
            >
              {apiErrorMessage(savePlan.error, 'Failed to save the plan.')}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              disabled={savePlan.isPending}
              className="h-9 px-4 rounded-lg border border-input bg-card font-medium hover:bg-muted disabled:opacity-50 focus-outline"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savePlan.isPending}
              aria-busy={savePlan.isPending}
              className="h-9 px-4 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-50 focus-outline"
            >
              {savePlan.isPending ? 'Saving…' : editing ? 'Save Changes' : 'Create Plan'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
