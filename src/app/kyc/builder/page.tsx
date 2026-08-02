'use client';

import * as React from 'react';
import api from '@/lib/api';
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
  FileText,
  User,
  Camera,
  Home,
  CheckSquare,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface KycFieldConfig {
  id: string;
  name: string;
  label: string;
  type: 'text' | 'date' | 'phone' | 'select' | 'file' | 'checkbox';
  required: boolean;
  options?: string[];
  hint?: string;
}

export interface KycStepConfig {
  id: string;
  stepNumber: number;
  slug: string;
  title: string;
  description: string;
  icon: string;
  enabled: boolean;
  fields: KycFieldConfig[];
}

// FR-CORE-15 mandates the identity document, selfie, and proof-of-address steps for
// every customer, and FR-IND-03 requires the profile step. These cannot be disabled,
// deleted, or re-slugged from the builder — the client flow submits by slug and the
// FSD's acceptance criteria depend on them (DECISIONS D-29).
const MANDATORY_SLUGS: readonly string[] = ['personal', 'document', 'selfie', 'address'];
const isMandatoryStep = (step: KycStepConfig) => MANDATORY_SLUGS.includes(step.slug);

export default function KycBuilderPage() {
  const [steps, setSteps] = React.useState<KycStepConfig[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [toast, setToast] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [expandedStep, setExpandedStep] = React.useState<string | null>(null);

  // New step modal state
  const [showAddModal, setShowAddModal] = React.useState(false);
  const [newStepTitle, setNewStepTitle] = React.useState('');
  const [newStepSlug, setNewStepSlug] = React.useState('');
  const [newStepDesc, setNewStepDesc] = React.useState('');
  const [newStepIcon, setNewStepIcon] = React.useState('FileText');

// Load configuration on mount
  const fetchConfig = React.useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/admin/kyc-config');
      setSteps(data);
      if (data.length > 0) setExpandedStep(data[0].id);
    } catch {
      setToast({ message: 'Failed to load KYC step configuration.', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Save all step changes
  const handleSaveAll = async () => {
    try {
      setSaving(true);
      const { data } = await api.put('/admin/kyc-config', steps);
      setSteps(data);
      showNotification('KYC onboarding steps updated successfully!');
    } catch {
      showNotification('Error saving configuration.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Reset to default configuration
  const handleReset = async () => {
    if (!confirm('Are you sure you want to reset all KYC onboarding steps to defaults?')) return;
    try {
      setSaving(true);
      const { data } = await api.post('/admin/kyc-config/reset');
      setSteps(data);
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

    const temp = newSteps[index];
    newSteps[index] = newSteps[targetIdx];
    newSteps[targetIdx] = temp;

    // Update step numbers
    const reindexed = newSteps.map((s, idx) => ({ ...s, stepNumber: idx + 1 }));
    setSteps(reindexed);
  };

  // Toggle step active state
  const toggleStepEnabled = (id: string) => {
    const step = steps.find((s) => s.id === id);
    if (step && isMandatoryStep(step) && step.enabled) {
      setToast({ message: `"${step.title}" is required by the KYC spec (FR-CORE-15) and cannot be disabled.`, type: 'error' });
      return;
    }
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)),
    );
  };

  // Update step field info
  const updateStepField = (stepId: string, fieldKey: keyof KycStepConfig, value: unknown) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === stepId ? { ...s, [fieldKey]: value } : s)),
    );
  };

  // Add field to a step
  const addFieldToStep = (stepId: string) => {
    const fieldId = `field-${Date.now()}`;
    const newField: KycFieldConfig = {
      id: fieldId,
      name: `customField_${Date.now()}`,
      label: 'New Field',
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
      setToast({ message: `"${step.title}" is required by the KYC spec (FR-CORE-15) and cannot be deleted.`, type: 'error' });
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
          className={`fixed top-20 right-8 z-50 flex items-center gap-3 rounded-xl border px-4 py-3 text-xs font-semibold shadow-2xl animate-in fade-in-0 slide-in-from-top-4 ${
            toast.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2.5 text-blue-600 dark:text-blue-400 mb-1">
            <Layers className="h-6 w-6" />
            <span className="text-xs font-bold uppercase tracking-wider">KYC Management</span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">KYC Onboarding Workflow Builder</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Customize, add, edit, or disable steps and fields for client identity verification onboarding.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={handleReset} disabled={saving} className="gap-2">
            <RotateCcw className="h-4 w-4" />
            <span>Reset Defaults</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowAddModal(true)} className="gap-2 border-blue-500/30 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40">
            <Plus className="h-4 w-4" />
            <span>Add Custom Step</span>
          </Button>
          <Button size="sm" onClick={handleSaveAll} disabled={saving} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20">
            <Save className="h-4 w-4" />
            <span>{saving ? 'Saving...' : 'Save All Changes'}</span>
          </Button>
        </div>
      </div>

      {/* Steps List */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 w-full rounded-2xl border border-border bg-card/40 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {steps.map((step, idx) => {
            const isExpanded = expandedStep === step.id;
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
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 font-bold text-sm">
                      {step.stepNumber}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-foreground truncate">{step.title}</h3>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                          step.enabled ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground'
                        }`}>
                          {step.enabled ? 'Active' : 'Disabled'}
                        </span>
                        {isMandatoryStep(step) && (
                          <span
                            className="rounded-md bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-500 border border-blue-500/20"
                            title="Required by FR-CORE-15 — cannot be disabled or deleted"
                          >
                            Required
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{step.description}</p>
                    </div>
                  </div>

                  {/* Step Control Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Move Up */}
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveStep(idx, 'up')}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent disabled:opacity-30 transition-colors"
                      title="Move Step Up"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>

                    {/* Move Down */}
                    <button
                      type="button"
                      disabled={idx === steps.length - 1}
                      onClick={() => moveStep(idx, 'down')}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent disabled:opacity-30 transition-colors"
                      title="Move Step Down"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>

                    {/* Active Toggle */}
                    <Button
                      variant={step.enabled ? 'outline' : 'default'}
                      size="sm"
                      onClick={() => toggleStepEnabled(step.id)}
                      disabled={isMandatoryStep(step) && step.enabled}
                      title={isMandatoryStep(step) && step.enabled ? 'Required step — cannot be disabled' : undefined}
                      className="text-xs h-8 px-2.5"
                    >
                      {step.enabled ? 'Disable' : 'Enable'}
                    </Button>

                    {/* Delete Step */}
                    <button
                      type="button"
                      onClick={() => deleteStep(step.id)}
                      disabled={isMandatoryStep(step)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-rose-500/30 text-rose-500 hover:bg-rose-500/10 transition-colors ml-1 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                      title={isMandatoryStep(step) ? 'Required step — cannot be deleted' : 'Delete Step'}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>

                    {/* Expand/Collapse Toggle */}
                    <button
                      type="button"
                      onClick={() => setExpandedStep(isExpanded ? null : step.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-foreground hover:bg-accent transition-colors ml-1"
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Expanded Fields Editor */}
                {isExpanded && (
                  <div className="border-t border-border p-4 md:p-6 space-y-6 bg-muted/10 rounded-b-2xl">
                    {/* Step Basic Meta */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Step Title</Label>
                        <Input
                          value={step.title}
                          onChange={(e) => updateStepField(step.id, 'title', e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">
                          URL Slug Identifier
                          {isMandatoryStep(step) && (
                            <span className="ml-2 font-normal text-muted-foreground">(locked — the client flow submits by this slug)</span>
                          )}
                        </Label>
                        <Input
                          value={step.slug}
                          disabled={isMandatoryStep(step)}
                          onChange={(e) => updateStepField(step.id, 'slug', e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5 md:col-span-2">
                        <Label className="text-xs">Description / Instructions</Label>
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
                          <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">Form Fields ({step.fields.length})</h4>
                          <p className="text-[11px] text-muted-foreground">Configure field labels, input types, and requirement flags.</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => addFieldToStep(step.id)}
                          className="gap-1.5 text-blue-600 border-blue-500/30 hover:bg-blue-50 dark:hover:bg-blue-950/30 h-8 text-xs"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>Add Field</span>
                        </Button>
                      </div>

                      {/* Fields Table / Grid */}
                      {step.fields.length === 0 ? (
                        <div className="py-6 text-center text-xs text-muted-foreground border border-dashed rounded-xl">
                          No custom fields added yet. Click &quot;Add Field&quot; to configure inputs.
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
                                  <Label className="text-[11px]">Field Label</Label>
                                  <Input
                                    value={f.label}
                                    onChange={(e) => updateInnerField(step.id, f.id, { label: e.target.value })}
                                    className="h-8 text-xs"
                                  />
                                </div>

                                <div className="space-y-1">
                                  <Label className="text-[11px]">Key Name</Label>
                                  <Input
                                    value={f.name}
                                    onChange={(e) => updateInnerField(step.id, f.id, { name: e.target.value })}
                                    className="h-8 text-xs font-mono"
                                  />
                                </div>

                                <div className="space-y-1">
                                  <Label className="text-[11px]">Input Type</Label>
                                  <Select
                                    value={f.type}
                                    onValueChange={(val) => updateInnerField(step.id, f.id, { type: val as KycFieldConfig['type'] })}
                                  >
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="text">Text Input</SelectItem>
                                      <SelectItem value="date">Date Picker</SelectItem>
                                      <SelectItem value="phone">Phone Input</SelectItem>
                                      <SelectItem value="select">Dropdown Select</SelectItem>
                                      <SelectItem value="file">File Uploader</SelectItem>
                                      <SelectItem value="camera">Live Camera</SelectItem>
                                      <SelectItem value="checkbox">Checkbox</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>

                              <div className="flex items-center gap-3 self-end sm:self-center pt-2 sm:pt-0">
                                <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={f.required}
                                    onChange={(e) => updateInnerField(step.id, f.id, { required: e.target.checked })}
                                    className="rounded border-input text-blue-600 focus:ring-blue-600"
                                  />
                                  <span>Required</span>
                                </label>

                                <button
                                  type="button"
                                  onClick={() => removeFieldFromStep(step.id, f.id)}
                                  className="flex h-7 w-7 items-center justify-center rounded-md text-rose-500 hover:bg-rose-500/10 transition-colors"
                                  title="Remove Field"
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
            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-1">
              <Sparkles className="h-5 w-5" />
              <h3 className="text-lg font-bold text-foreground">Add Custom Onboarding Step</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-6">
              Create a new step for your KYC verification flow.
            </p>

            <form onSubmit={handleAddStepSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Step Title <span className="text-rose-500">*</span></Label>
                <Input
                  required
                  placeholder="e.g., Employment & Tax Declaration"
                  value={newStepTitle}
                  onChange={(e) => setNewStepTitle(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>URL Slug</Label>
                <Input
                  placeholder="e.g., employment (optional)"
                  value={newStepSlug}
                  onChange={(e) => setNewStepSlug(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Description / Guidance</Label>
                <Input
                  placeholder="e.g., Provide details about your employment status and source of funds."
                  value={newStepDesc}
                  onChange={(e) => setNewStepDesc(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white">
                  Add Step
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
