'use client';

import * as React from 'react';
import type { components } from '@/lib/api/types.gen';
import api from '@/lib/api';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import {
  Layers,
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { t } from '@/lib/i18n';

/**
 * Aliases, not hand-written copies — R-1.1.
 *
 * These had ALREADY drifted from the schema they describe, which is the whole
 * argument in one place: the hand-written field type omitted `"camera"`, and
 * both `description` and `icon` were required here while the API marks them
 * optional. Nothing failed, because nothing compared them — the builder simply
 * held a slightly wrong picture of the config it edits.
 */
export type KycFieldConfig = components['schemas']['KycFieldConfigDto'];
export type KycStepConfig = components['schemas']['KycStepConfigDto'];

// FR-CORE-15 mandates the identity document, selfie, and proof-of-address steps for
// every customer, and FR-IND-03 requires the profile step. These cannot be disabled,
// deleted, or re-slugged from the builder — the client flow submits by slug and the
// FSD's acceptance criteria depend on them (DECISIONS D-29).
const MANDATORY_SLUGS: readonly string[] = ['personal', 'document', 'selfie', 'address'];
const isMandatoryStep = (step: KycStepConfig) => MANDATORY_SLUGS.includes(step.slug);

export default function KycBuilderPage() {
  // The editor holds a draft. `null` means "no unsaved edits", so the server
  // copy shows through — which is what makes Save and Reset simply drop it.
  const [draft, setDraft] = React.useState<KycStepConfig[] | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [toast, setToast] = React.useState<{ message: string; type: 'success' | 'error' } | null>(
    null,
  );
  const [expandedStep, setExpandedStep] = React.useState<string | null>(null);

  // New step modal state
  const [showAddModal, setShowAddModal] = React.useState(false);
  const [newStepTitle, setNewStepTitle] = React.useState('');
  const [newStepSlug, setNewStepSlug] = React.useState('');
  const [newStepDesc, setNewStepDesc] = React.useState('');
  const [newStepIcon] = React.useState('FileText');

  const query = useResource<KycStepConfig[]>(
    ['kyc-config'],
    async (signal) => (await api.get<KycStepConfig[]>('/admin/kyc-config', { signal })).data,
  );

  const steps = draft ?? query.data ?? [];
  const loading = query.status === 'loading';
  const setSteps = (next: KycStepConfig[] | ((prev: KycStepConfig[]) => KycStepConfig[])) =>
    setDraft((prev) => (typeof next === 'function' ? next(prev ?? query.data ?? []) : next));

  // First step opens by default without an effect writing state on mount.
  const expandedStepId =
    expandedStep === null && steps.length > 0 ? (steps[0]?.id ?? null) : expandedStep;

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Save all step changes.
  //
  // The endpoint is asymmetric on purpose: GET /admin/kyc-config returns a bare
  // array, PUT takes { steps }. Sending the bare array back is silently wrong —
  // it deserialises to a KycConfigDto whose `steps` is undefined — so the wrap
  // is load-bearing, not styling.
  const handleSaveAll = async () => {
    try {
      setSaving(true);
      await api.put('/admin/kyc-config', { steps });
      setDraft(null);
      await query.refetch();
      showNotification('KYC onboarding steps updated successfully!');
    } catch (error) {
      // Never swallow this. A blind `catch` here is what let the payload bug
      // above survive: the request 400'd and the UI said "Error saving".
      showNotification(apiErrorMessage(error, 'Error saving configuration.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  // Reset to default configuration
  const handleReset = async () => {
    if (!confirm('Are you sure you want to reset all KYC onboarding steps to defaults?')) return;
    try {
      setSaving(true);
      await api.post('/admin/kyc-config/reset');
      setDraft(null);
      await query.refetch();
      showNotification('Reset to default KYC configuration.');
    } catch {
      showNotification('Failed to reset steps.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Move step up or down
  const moveStep = (index: number, direction: 'up' | 'down') => {
    const newSteps = [...steps];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= newSteps.length) return;

    const moved = newSteps[index];
    const displaced = newSteps[targetIdx];
    // `index` was never bounds-checked, only `targetIdx` was. Guarding both is
    // what makes the swap below total.
    if (!moved || !displaced) return;
    newSteps[index] = displaced;
    newSteps[targetIdx] = moved;

    // Update step numbers
    const reindexed = newSteps.map((s, idx) => ({ ...s, stepNumber: idx + 1 }));
    setSteps(reindexed);
  };

  // Toggle step active state
  const toggleStepEnabled = (id: string) => {
    const step = steps.find((s) => s.id === id);
    if (step && isMandatoryStep(step) && step.enabled) {
      setToast({
        message: `"${step.title}" is required by the KYC spec (FR-CORE-15) and cannot be disabled.`,
        type: 'error',
      });
      return;
    }
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)));
  };

  // Update step field info
  const updateStepField = (stepId: string, fieldKey: keyof KycStepConfig, value: unknown) => {
    setSteps((prev) => prev.map((s) => (s.id === stepId ? { ...s, [fieldKey]: value } : s)));
  };

  // Add field to a step
  const addFieldToStep = (stepId: string) => {
    const fieldId = `field-${Date.now()}`;
    const newField: KycFieldConfig = {
      id: fieldId,
      name: `customField_${Date.now()}`,
      label: t('builder.newField'),
      type: 'text',
      required: false,
    };

    setSteps((prev) =>
      prev.map((s) => (s.id === stepId ? { ...s, fields: [...s.fields, newField] } : s)),
    );
  };

  // Delete field from a step
  const removeFieldFromStep = (stepId: string, fieldId: string) => {
    setSteps((prev) =>
      prev.map((s) =>
        s.id === stepId ? { ...s, fields: s.fields.filter((f) => f.id !== fieldId) } : s,
      ),
    );
  };

  // Update specific field configuration inside a step
  const updateInnerField = (stepId: string, fieldId: string, patch: Partial<KycFieldConfig>) => {
    setSteps((prev) =>
      prev.map((s) => {
        if (s.id !== stepId) return s;
        return {
          ...s,
          fields: s.fields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)),
        };
      }),
    );
  };

  // Add a new custom step
  const handleAddStepSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStepTitle.trim()) return;

    const slug = newStepSlug.trim() || newStepTitle.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const newStep: KycStepConfig = {
      id: `step-${Date.now()}`,
      stepNumber: steps.length + 1,
      slug,
      title: newStepTitle,
      description: newStepDesc || 'Custom onboarding step.',
      icon: newStepIcon,
      enabled: true,
      fields: [],
    };

    setSteps((prev) => [...prev, newStep]);
    setShowAddModal(false);
    setNewStepTitle('');
    setNewStepSlug('');
    setNewStepDesc('');
    setExpandedStep(newStep.id);
    showNotification(`Added step "${newStep.title}". Remember to click Save All Changes!`);
  };

  // Delete a step
  const deleteStep = (id: string) => {
    const step = steps.find((s) => s.id === id);
    if (step && isMandatoryStep(step)) {
      setToast({
        message: `"${step.title}" is required by the KYC spec (FR-CORE-15) and cannot be deleted.`,
        type: 'error',
      });
      return;
    }
    if (!confirm('Are you sure you want to delete this step?')) return;
    const filtered = steps.filter((s) => s.id !== id);
    const reindexed = filtered.map((s, idx) => ({ ...s, stepNumber: idx + 1 }));
    setSteps(reindexed);
    showNotification('Step deleted.');
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {/* Toast Banner */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed top-20 end-8 z-50 flex items-center gap-3 rounded-xl border px-4 py-3 text-xs font-semibold shadow-2xl animate-in fade-in-0 slide-in-from-top-4 ${
            toast.type === 'success'
              ? 'border-success/30 bg-success/10 text-success'
              : 'border-destructive/30 bg-destructive/10 text-destructive'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2.5 text-link mb-1">
            <Layers className="h-6 w-6" />
            <span className="text-xs font-bold uppercase tracking-wider">
              {t('builder.section')}
            </span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
            {t('builder.title')}
          </h1>
          <p className="text-xs text-muted-foreground mt-1">{t('builder.subtitle')}</p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleReset()}
            disabled={saving}
            className="gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            <span>{t('builder.resetDefaults')}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddModal(true)}
            className="gap-2 border-primary/30 text-link hover:bg-primary/10"
          >
            <Plus className="h-4 w-4" />
            <span>{t('builder.addCustomStep')}</span>
          </Button>
          <Button
            size="sm"
            onClick={() => void handleSaveAll()}
            disabled={saving}
            className="gap-2 shadow-md shadow-primary/20"
          >
            <Save className="h-4 w-4" />
            <span>{saving ? 'Saving...' : 'Save All Changes'}</span>
          </Button>
        </div>
      </div>

      {/* Steps List */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-28 w-full rounded-2xl border border-border bg-card/40 animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {steps.map((step, idx) => {
            const isExpanded = expandedStepId === step.id;
            return (
              <div
                key={step.id}
                className={`rounded-2xl border transition-all duration-200 ${
                  step.enabled
                    ? 'border-border bg-card shadow-sm'
                    : 'border-border/50 bg-muted/20 opacity-75'
                }`}
              >
                {/* Step Card Header */}
                <div className="flex items-center justify-between p-4 md:p-5 gap-4">
                  <div className="flex items-center gap-3.5 flex-1 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-link font-bold text-sm">
                      {step.stepNumber}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-foreground truncate">{step.title}</h3>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                            step.enabled
                              ? 'bg-success/10 text-success'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {step.enabled ? 'Active' : 'Disabled'}
                        </span>
                        {isMandatoryStep(step) && (
                          <span
                            className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-link border border-primary/20"
                            title={t('kycBuilder.requiredStepTitle')}
                          >
                            {t('builder.required')}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {step.description}
                      </p>
                    </div>
                  </div>

                  {/* Step Control Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Move Up */}
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveStep(idx, 'up')}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed focus-outline"
                      title={t('kycBuilder.moveStepUp')}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>

                    {/* Move Down */}
                    <button
                      type="button"
                      disabled={idx === steps.length - 1}
                      onClick={() => moveStep(idx, 'down')}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed focus-outline"
                      title={t('kycBuilder.moveStepDown')}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>

                    {/* Active Toggle */}
                    <Button
                      variant={step.enabled ? 'outline' : 'default'}
                      size="sm"
                      onClick={() => toggleStepEnabled(step.id)}
                      disabled={isMandatoryStep(step) && step.enabled}
                      title={
                        isMandatoryStep(step) && step.enabled
                          ? 'Required step — cannot be disabled'
                          : undefined
                      }
                      className="text-xs h-8 px-2.5"
                    >
                      {step.enabled ? 'Disable' : 'Enable'}
                    </Button>

                    {/* Delete Step */}
                    <button
                      type="button"
                      onClick={() => deleteStep(step.id)}
                      disabled={isMandatoryStep(step)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 ms-1 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent focus-outline"
                      title={
                        isMandatoryStep(step) ? 'Required step — cannot be deleted' : 'Delete Step'
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>

                    {/* Expand/Collapse Toggle */}
                    <button
                      type="button"
                      onClick={() => setExpandedStep(isExpanded ? null : step.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-foreground hover:bg-accent ms-1 focus-outline"
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded Fields Editor */}
                {isExpanded && (
                  <div className="border-t border-border p-4 md:p-6 space-y-6 bg-muted/10 rounded-b-2xl">
                    {/* Step Basic Meta */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs">{t('builder.stepTitle')}</Label>
                        <Input
                          value={step.title}
                          onChange={(e) => updateStepField(step.id, 'title', e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">
                          {t('builder.slugIdentifier')}
                          {isMandatoryStep(step) && (
                            <span className="ms-2 font-normal text-muted-foreground">
                              {t('builder.slugLockedFull')}
                            </span>
                          )}
                        </Label>
                        <Input
                          value={step.slug}
                          disabled={isMandatoryStep(step)}
                          onChange={(e) => updateStepField(step.id, 'slug', e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5 md:col-span-2">
                        <Label className="text-xs">{t('builder.stepDescription')}</Label>
                        <Input
                          value={step.description}
                          onChange={(e) => updateStepField(step.id, 'description', e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Fields List Header */}
                    <div className="space-y-4 pt-2 border-t border-border">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                            {t('builder.fieldsCount', { count: step.fields.length })}
                          </h4>
                          <p className="text-[11px] text-muted-foreground">
                            {t('builder.fieldsHint')}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => addFieldToStep(step.id)}
                          className="gap-1.5 text-link border-primary/30 hover:bg-primary/10 h-8 text-xs"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>{t('builder.addField')}</span>
                        </Button>
                      </div>

                      {/* Fields Table / Grid */}
                      {step.fields.length === 0 ? (
                        <div className="py-6 text-center text-xs text-muted-foreground border border-dashed rounded-xl">
                          {t('builder.noFieldsHint')}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {step.fields.map((f) => (
                            <div
                              key={f.id}
                              className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-border bg-card/60"
                            >
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1 w-full">
                                <div className="space-y-1">
                                  <Label className="text-[11px]">{t('builder.fieldLabel')}</Label>
                                  <Input
                                    value={f.label}
                                    onChange={(e) =>
                                      updateInnerField(step.id, f.id, { label: e.target.value })
                                    }
                                    className="h-8 text-xs"
                                  />
                                </div>

                                <div className="space-y-1">
                                  <Label className="text-[11px]">{t('builder.keyName')}</Label>
                                  <Input
                                    value={f.name}
                                    onChange={(e) =>
                                      updateInnerField(step.id, f.id, { name: e.target.value })
                                    }
                                    className="h-8 text-xs font-mono"
                                  />
                                </div>

                                <div className="space-y-1">
                                  <Label className="text-[11px]">{t('builder.inputType')}</Label>
                                  <Select
                                    value={f.type}
                                    onValueChange={(val) =>
                                      updateInnerField(step.id, f.id, {
                                        type: val as KycFieldConfig['type'],
                                      })
                                    }
                                  >
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="text">{t('builder.typeText')}</SelectItem>
                                      <SelectItem value="date">{t('builder.typeDate')}</SelectItem>
                                      <SelectItem value="phone">
                                        {t('builder.typePhone')}
                                      </SelectItem>
                                      <SelectItem value="select">
                                        {t('builder.typeSelect')}
                                      </SelectItem>
                                      <SelectItem value="file">{t('builder.typeFile')}</SelectItem>
                                      <SelectItem value="camera">
                                        {t('builder.typeCamera')}
                                      </SelectItem>
                                      <SelectItem value="checkbox">
                                        {t('builder.typeCheckbox')}
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>

                              <div className="flex items-center gap-3 self-end sm:self-center pt-2 sm:pt-0">
                                {/* The id carries both ids: this renders once per
                                    field per step, and a shared id would point
                                    every label at the first checkbox. */}
                                <div className="flex items-center gap-1.5">
                                  <Checkbox
                                    id={`field-required-${step.id}-${f.id}`}
                                    checked={f.required}
                                    onCheckedChange={(value) =>
                                      updateInnerField(step.id, f.id, {
                                        required: value === true,
                                      })
                                    }
                                  />
                                  <label
                                    htmlFor={`field-required-${step.id}-${f.id}`}
                                    className="cursor-pointer text-xs font-medium"
                                  >
                                    {t('builder.required')}
                                  </label>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => removeFieldFromStep(step.id, f.id)}
                                  className="flex h-7 w-7 items-center justify-center rounded-md text-destructive hover:bg-destructive/10 focus-outline"
                                  title={t('kycBuilder.removeField')}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Custom Step Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl animate-in fade-in-0 zoom-in-95 duration-150">
            <div className="flex items-center gap-2 text-link mb-1">
              <Sparkles className="h-5 w-5" />
              <h3 className="text-lg font-bold text-foreground">{t('builder.newStepTitle')}</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-6">{t('builder.newStepBody')}</p>

            <form onSubmit={handleAddStepSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label>
                  {t('builder.stepTitle')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  required
                  placeholder={t('builder.titlePlaceholder')}
                  value={newStepTitle}
                  onChange={(e) => setNewStepTitle(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>{t('builder.urlSlug')}</Label>
                <Input
                  placeholder={t('builder.slugPlaceholder')}
                  value={newStepSlug}
                  onChange={(e) => setNewStepSlug(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>{t('builder.guidance')}</Label>
                <Input
                  placeholder={t('builder.guidancePlaceholder')}
                  value={newStepDesc}
                  onChange={(e) => setNewStepDesc(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit">{t('builder.addStep')}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
