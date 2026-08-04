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
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { t } from '@/lib/i18n';

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
  {
    value: 'commission',
    label: t('plans.modeCommission'),
    hint: 'IBs earn; clients get no rebate',
  },
  { value: 'rebate', label: t('plans.modeRebate'), hint: 'Clients get a rebate; IBs earn nothing' },
  {
    value: 'hybrid',
    label: t('plans.modeHybrid'),
    hint: 'Both an IB commission and a client rebate',
  },
];

const METHODS = [
  {
    value: 'spread_share',
    label: t('plans.methodSpread'),
    hint: 'Commission value is a percentage of the deal spread',
  },
  {
    value: 'per_lot',
    label: t('plans.methodPerLot'),
    hint: 'Commission value is money per traded lot',
  },
  {
    value: 'fixed_per_deal',
    label: t('plans.methodFixed'),
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
      // set it to 0 — on the form that decides how partners get paid. Throwing here
      // routes the message through the existing savePlan.isError block via
      // apiErrorMessage's error.message fallback.
      const position = parseIntegerField(state.position, 'Position', { min: 1 });
      const settlementWindow = parseIntegerField(state.settlementWindowHours, 'Settlement window', {
        min: 0,
      });
      const invalid = firstError(position, settlementWindow);
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
        settlementWindowHours: settlementWindow.ok ? settlementWindow.value : 0,
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

  // Float arithmetic is acceptable here, and only here, because this value never
  // leaves the component — it drives a "total N%" hint and an `> 100` warning.
  // Verified exhaustively: every split of 100 at 1dp and 2dp, plus 8dp cases like
  // 33.33333333 + 66.66666667, sums to exactly 100 in IEEE754 at this magnitude.
  // The shares themselves are posted as the strings they were typed as (§6.1).
  //
  // The disable is deliberate and narrow: the money-path rule (PLATFORM-CONVENTIONS
  // R-2.6) now bans Number() across this screen, which is right — every OTHER
  // value here is money. This one is a display-only percentage that never leaves
  // the component, and the authoritative split validation lives on the backend
  // (DECISIONS D-39). Keeping the rule and disabling this line makes the exception
  // reviewable; widening the rule to permit it would not.
  // eslint-disable-next-line no-restricted-syntax
  const shareTotal = (Number(form.l1Share) || 0) + (Number(form.l2Share) || 0);
  const isPercentMethod = form.method === 'spread_share';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('plans.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('plans.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          disabled={query.status !== 'ready' || !canManage}
          title={canManage ? undefined : 'Requires the commissions.manage permission'}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 focus-outline"
        >
          <Plus className="h-4 w-4" />
          {t('plans.newPlan')}
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
                        {t('plans.tier', { position: p.position })}
                      </span>
                      {!p.active && (
                        <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase">
                          {t('plans.inactive')}
                        </span>
                      )}
                      {!p.selectable && p.active && (
                        <span className="rounded-md bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning uppercase">
                          {t('plans.notSelectable')}
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
                    <dt className="text-muted-foreground">{t('plans.mode')}</dt>
                    <dd className="font-semibold text-foreground capitalize">{p.mode}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t('plans.method')}</dt>
                    <dd className="font-semibold text-foreground">
                      {METHODS.find((m) => m.value === p.method)?.label ?? p.method}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t('plans.commission')}</dt>
                    {/* String, rendered verbatim */}
                    <dd className="font-mono font-semibold text-foreground">
                      {p.commissionValue}
                      {p.method === 'spread_share' ? '%' : ''}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t('plans.clientRebate')}</dt>
                    <dd className="font-mono font-semibold text-foreground">{p.rebateValue}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t('plans.split')}</dt>
                    <dd className="font-mono font-semibold text-foreground">
                      {t('plans.splitValue', { l1: p.l1Share, l2: p.l2Share })}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t('plans.settlementWindow')}</dt>
                    <dd className="font-semibold text-foreground">
                      {t('plans.windowValue', { hours: p.settlementWindowHours })}
                    </dd>
                  </div>
                </dl>

                {p.rebateOnClose && (
                  <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-2.5 text-[11px] text-warning">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{t('plans.rebateOnCloseWarning')}</span>
                  </div>
                )}

                <div className="flex gap-2 border-t border-border/60 pt-3">
                  {!canManage && (
                    <span className="text-xs text-muted-foreground">{t('plans.viewOnly')}</span>
                  )}
                  {canManage && (
                    <>
                      <button
                        type="button"
                        onClick={() => openEdit(p)}
                        className="h-8 px-3 rounded-md border border-input bg-card text-xs font-semibold hover:bg-muted focus-outline"
                      >
                        {t('plans.edit')}
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
                {t('plans.name')}
              </label>
              <input
                id="plan-name"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t('plans.namePlaceholder')}
                className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 focus-outline"
              />
            </div>
            <div>
              <label htmlFor="plan-position" className="font-semibold">
                {t('plans.position')}
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
              {t('plans.description')}
            </label>
            <input
              id="plan-desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder={t('plans.descriptionPlaceholder')}
              className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 focus-outline"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="plan-mode" className="font-semibold">
                {t('plans.mode')}
              </label>
              <Select value={form.mode} onValueChange={(val) => setForm({ ...form, mode: val })}>
                <SelectTrigger className="mt-1 h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {MODES.find((m) => m.value === form.mode)?.hint}
              </p>
            </div>
            <div>
              <label htmlFor="plan-method" className="font-semibold">
                {t('plans.commissionMethod')}
              </label>
              <Select
                value={form.method}
                onValueChange={(val) => setForm({ ...form, method: val })}
              >
                <SelectTrigger className="mt-1 h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {METHODS.find((m) => m.value === form.method)?.hint}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="plan-commission" className="font-semibold">
                {isPercentMethod
                  ? t('plans.commissionValueLabelPct')
                  : t('plans.commissionValueLabelAmt')}
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
                {t('plans.rebateValue')}
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
              <span className="font-bold text-foreground">{t('plans.twoLevelSplit')}</span>
              <span
                className={`font-mono text-[11px] ${shareTotal > 100 ? 'text-destructive font-bold' : 'text-muted-foreground'}`}
              >
                {shareTotal > 100
                  ? t('plans.shareTotalExceeds', { total: shareTotal })
                  : t('plans.shareTotalValue', { total: shareTotal })}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="plan-l1" className="font-semibold">
                  {t('plans.l1Share')}
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
                  {t('plans.l2Share')}
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
            <p className="text-[11px] text-muted-foreground">{t('plans.l2NoteLong')}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="plan-window" className="font-semibold">
                {t('plans.windowHours')}
              </label>
              <input
                id="plan-window"
                type="number"
                min={0}
                value={form.settlementWindowHours}
                onChange={(e) => setForm({ ...form, settlementWindowHours: e.target.value })}
                className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 font-mono focus-outline"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">{t('plans.windowHint')}</p>
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
                  <span className="font-semibold">{t('plans.rebateOnClose')}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {t('plans.rebateOnCloseHint')}
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
                <span className="font-semibold">{t('plans.selectable')}</span>
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
                <strong>{t('plans.confirmHint')}</strong> {t('plans.rebateWarningLong')}
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
              {t('common.cancel')}
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
