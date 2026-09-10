'use client';

import * as React from 'react';
import api from '@/lib/api';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { AlertTriangle, ArrowDown, ArrowUp, Plus, Save, Sparkles } from 'lucide-react';
import { PageLoader } from '@/components/ui/loader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabPanel, type TabDefinition } from '@/components/ui/tabs';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toastSuccess } from '@/lib/toast';
import { toast } from 'sonner';
import { StepCard, type KycStepConfig } from '@/components/kyc-builder/step-card';
import { type KycDocumentType, type KycFieldConfig } from '@/components/kyc-builder/field-editor';
import { SortableList, SortableRow } from '@/components/kyc-builder/sortable-row';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

export type { KycFieldConfig, KycStepConfig };

/**
 * The one tab that is not a step. A literal rather than an index, because every
 * other tab's value is a step id and `''` would collide with an unsaved one.
 */
const OVERVIEW_TAB = '__overview__';

/**
 * The KYC onboarding builder — what a client is asked for, and in what order.
 *
 * ## Three tabs, because this screen answers three different questions
 *
 * It was one long scroll of accordions. That is fine for editing ONE step and
 * poor at everything else: "what does a client actually walk through" and "is
 * any key name duplicated" both required opening every card in turn and holding
 * the answer in your head.
 *
 *   · Steps & Fields — the editor. Reorder, rename, add and remove.
 *   · Flow Preview   — the client's path, disabled steps struck out.
 *   · All Fields     — every field in one table, with the problems called out.
 *
 * The last two are READ-ONLY on purpose. A screen that lets you edit the same
 * value in three places has to answer which one wins; these two are for seeing.
 *
 * ## Full width, no `max-w-6xl`
 *
 * The page was centred in a 72rem column, which on a wide monitor left the
 * field grid cramped in the middle with empty space either side — and the field
 * editor has four inputs across. The console's own padding is the only margin
 * this needs.
 *
 * ## The draft is the single source of truth
 *
 * `draft === null` means "no unsaved edits", so the server copy shows through
 * and Save/Reset simply drop it. Every mutation goes through `setSteps`, which
 * seeds the draft from the query on first edit — so nothing is lost between a
 * refetch and a keystroke.
 */
export default function KycBuilderPage() {
  const [draft, setDraft] = React.useState<KycStepConfig[] | null>(null);
  const [saving, setSaving] = React.useState(false);
  const confirm = useConfirm();
  const [tab, setTab] = React.useState(OVERVIEW_TAB);

  const [showAddModal, setShowAddModal] = React.useState(false);
  const [newStepTitle, setNewStepTitle] = React.useState('');
  const [newStepSlug, setNewStepSlug] = React.useState('');
  const [newStepDesc, setNewStepDesc] = React.useState('');

  const query = useResource<KycStepConfig[]>(
    keys.kyc.config(),
    async (signal) => (await api.get<KycStepConfig[]>('/admin/kyc-config', { signal })).data,
  );

  /*
   * The documents a `document` field may accept, SERVED rather than duplicated
   * here. "A passport is one photo page" is a fact the client portal renders
   * from too, and two copies of it would drift the moment one was edited.
   */
  const catalogueQuery = useResource<KycDocumentType[]>(
    keys.kyc.documentCatalogue(),
    async (signal) =>
      (await api.get<KycDocumentType[]>('/admin/kyc-config/document-catalogue', { signal })).data,
  );
  const catalogue = catalogueQuery.data ?? [];

  /*
   * Memoised because the `??` chain builds a NEW array identity on every
   * render when both sides are undefined, which would make the `allFields`
   * memo below recompute on every keystroke — the opposite of what it is for.
   */
  const steps = React.useMemo(() => draft ?? query.data ?? [], [draft, query.data]);
  const loading = query.status === 'loading';
  const dirty = draft !== null;

  const setSteps = (next: KycStepConfig[] | ((prev: KycStepConfig[]) => KycStepConfig[])) =>
    setDraft((prev) => (typeof next === 'function' ? next(prev ?? query.data ?? []) : next));

  /*
   * This screen grew its OWN toast before the console had one: a piece of
   * state, a `setTimeout(4000)` to clear it, and a fixed-position div at the
   * top of the JSX. `sonner` does all of it, so this wrapper survives only as
   * the shape the call sites already use.
   */
  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    if (type === 'error') {
      // Not `toastError`: these are LOCAL refusals raised by this screen, not
      // API failures, so there is no error object to unwrap.
      //
      // The example this used to give — "that step is mandatory" — no longer
      // happens. The mandatory-step rule was retired by the owner on 15 Aug
      // 2026, and `deleteStep` below now confirms and removes ANY step, which
      // correctly matches what the API accepts.
      toast.error(message, { duration: 8000 });
      return;
    }
    toastSuccess(message);
  };

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
      showNotification(t('builder.saved'));
    } catch (error) {
      // Never swallow this. A blind `catch` here is what let the payload bug
      // above survive: the request 400'd and the UI said "Error saving".
      showNotification(apiErrorMessage(error, t('builder.saveFailed')), 'error');
    } finally {
      setSaving(false);
    }
  };

  /** `stepNumber` is positional, so it is recomputed rather than carried. */
  const renumber = (list: KycStepConfig[]) =>
    list.map((step, index) => ({ ...step, stepNumber: index + 1 }));

  const moveStep = (index: number, direction: 'up' | 'down') => {
    const next = [...steps];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= next.length) return;

    const moved = next[index];
    const displaced = next[targetIdx];
    // `index` was never bounds-checked, only `targetIdx` was. Guarding both is
    // what makes the swap below total.
    if (!moved || !displaced) return;
    next[index] = displaced;
    next[targetIdx] = moved;

    setSteps(renumber(next));
  };

  const toggleStepEnabled = (id: string) =>
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)));

  const patchStep = (stepId: string, patch: Partial<KycStepConfig>) =>
    setSteps((prev) => prev.map((s) => (s.id === stepId ? { ...s, ...patch } : s)));

  const addFieldToStep = (stepId: string) => {
    const stamp = Date.now();
    const newField: KycFieldConfig = {
      id: `field-${stamp}`,
      name: `customField_${stamp}`,
      label: t('builder.newField'),
      type: 'text',
      required: false,
    };
    setSteps((prev) =>
      prev.map((s) => (s.id === stepId ? { ...s, fields: [...s.fields, newField] } : s)),
    );
  };

  const removeFieldFromStep = (stepId: string, fieldId: string) =>
    setSteps((prev) =>
      prev.map((s) =>
        s.id === stepId ? { ...s, fields: s.fields.filter((f) => f.id !== fieldId) } : s,
      ),
    );

  const patchField = (stepId: string, fieldId: string, patch: Partial<KycFieldConfig>) =>
    setSteps((prev) =>
      prev.map((s) =>
        s.id === stepId
          ? { ...s, fields: s.fields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)) }
          : s,
      ),
    );

  const reorderFields = (stepId: string, fields: KycFieldConfig[]) =>
    setSteps((prev) => prev.map((s) => (s.id === stepId ? { ...s, fields } : s)));

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
      icon: 'FileText',
      enabled: true,
      fields: [],
    };

    setSteps((prev) => [...prev, newStep]);
    setShowAddModal(false);
    setNewStepTitle('');
    setNewStepSlug('');
    setNewStepDesc('');
    // Straight to the new step's own tab — adding one and staying on the
    // overview looks like nothing happened.
    setTab(newStep.id);
    showNotification(t('builder.stepAdded', { title: newStep.title }));
  };

  // `async` because the confirmation is a promise now rather than a blocking
  // `window.confirm` — every caller must `void` it.
  const deleteStep = async (id: string) => {
    const step = steps.find((s) => s.id === id);
    /*
     * The button for this is already disabled at `total <= 1`, and that is UX.
     * This is the refusal.
     *
     * Client-side gating is never the guarantee — the same rule this app states
     * about permissions. Keeping it here means the rule survives a keyboard
     * path, a future call site that forgets to pass `total`, and the ordinary
     * drift of a screen that gets rebuilt. It costs two lines.
     *
     * NOT the rule the owner retired on 15 Aug. That one pinned WHICH four
     * steps were undeletable and refused deletions an operator legitimately
     * wanted; this refuses only the one that leaves nothing behind, which is
     * not a configuration but the absence of one.
     */
    if (steps.length <= 1) {
      showNotification(t('builder.deleteLastStepRefused'), 'error');
      return;
    }
    const ok = await confirm({
      title: t('builder.confirmDeleteStepTitle', { title: step?.title ?? '' }),
      description: t('builder.confirmDeleteStepBody'),
      confirmLabel: t('common.delete'),
      destructive: true,
    });
    if (!ok) return;
    setSteps(renumber(steps.filter((s) => s.id !== id)));
    showNotification(t('builder.stepDeleted'));
  };

  /*
   * The problems the "All Fields" tab exists to surface.
   *
   * A duplicate key name is the dangerous one: the portal submits by `name`, so
   * two fields sharing one means the second silently overwrites the first in
   * the payload. It is invisible in the editor because the two live in
   * different steps — which is exactly why this list is computed across ALL of
   * them rather than per card.
   */
  const allFields = React.useMemo(
    () => steps.flatMap((step) => step.fields.map((field) => ({ step, field }))),
    [steps],
  );

  const duplicateNames = React.useMemo(() => {
    const seen = new Map<string, number>();
    for (const { field } of allFields) {
      seen.set(field.name, (seen.get(field.name) ?? 0) + 1);
    }
    return new Set([...seen.entries()].filter(([, count]) => count > 1).map(([name]) => name));
  }, [allFields]);

  const emptySelects = React.useMemo(
    () =>
      new Set(
        allFields
          .filter(({ field }) => field.type === 'select' && (field.options ?? []).length === 0)
          .map(({ field }) => field.id),
      ),
    [allFields],
  );

  const problemCount = duplicateNames.size + emptySelects.size;
  const activeSteps = steps.filter((step) => step.enabled);

  /*
   * ONE TAB PER STEP, plus an overview.
   *
   * The steps used to stack vertically as accordions, so reaching step five
   * meant scrolling past four open or shut cards and the page grew without
   * bound as steps were added. A tab per step gives each one the full width and
   * the whole viewport, which is what the four-across field grid needs.
   *
   * The overview stays FIRST because it is the only place the flow reads as a
   * flow — a tab strip deliberately shows one step at a time, so "what does the
   * client walk through" needs somewhere to live.
   *
   * The step's own number is its label prefix, so the strip doubles as the
   * order: reordering a step visibly moves its tab.
   */
  const tabs: TabDefinition[] = [
    { value: OVERVIEW_TAB, label: t('builder.tabOverview') },
    ...steps.map((step) => ({
      value: step.id,
      label: `${step.stepNumber}. ${step.title}`,
    })),
  ];

  /*
   * A deleted or freshly-loaded step can leave `tab` pointing at nothing, which
   * would render an empty page with no tab selected. Falling back to the
   * overview is computed rather than corrected in an effect — an effect would
   * render the blank frame first and fix it on a second pass.
   */
  const activeTab = tabs.some((entry) => entry.value === tab) ? tab : OVERVIEW_TAB;
  const activeStep = steps.find((step) => step.id === activeTab) ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col pb-12">
      <div className="flex flex-col justify-between gap-4 border-b border-border pb-6 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
            {t('builder.title')}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">{t('builder.subtitle')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Says the draft is not live yet. Without it, an operator who edits,
              navigates away and returns has silently lost the changes. */}
          {dirty && (
            <span
              className="rounded-lg border border-warning/30 bg-warning/10 px-2.5 py-1 text-[11px] font-semibold text-warning"
              title={t('builder.unsavedBody')}
            >
              {t('builder.unsaved')}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddModal(true)}
            className="gap-2 border-primary/30 text-link hover:bg-primary/10"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>{t('builder.addCustomStep')}</span>
          </Button>
          <Button
            size="sm"
            onClick={() => void handleSaveAll()}
            disabled={saving}
            className="gap-2 shadow-md shadow-primary/20"
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            <span>{saving ? t('builder.savingAll') : t('builder.saveAll')}</span>
          </Button>
        </div>
      </div>

      <div className="mt-6 flex items-end justify-between gap-4">
        <Tabs tabs={tabs} value={activeTab} onValueChange={setTab} idPrefix="kyc-builder" />
        <p className="hidden shrink-0 pb-2 text-[11px] text-muted-foreground sm:block">
          {t('builder.stepsCount', { count: steps.length })} ·{' '}
          {t('builder.activeCount', { count: activeSteps.length })} ·{' '}
          {t('builder.totalFields', { count: allFields.length })}
        </p>
      </div>

      {/*
        `PageLoader`, not four pulsing placeholder cards.

        This was the only skeleton in the console — every other screen loads
        through `PageLoader` or `AsyncBoundary` — so the KYC builder was the one
        page that waited differently. A skeleton earns its keep when it previews
        the shape of what is coming; four identical grey rectangles do not,
        because the builder renders tabs and a form rather than four cards.

        `animate-pulse` also fails the same way `animate-spin` does: the blanket
        reduced-motion rule in globals.css cuts every animation to 0.001ms, so
        for those users this froze into four static grey blocks with nothing
        anywhere saying the page was still working. `PageLoader` carries
        `role="status"` and a label, and its mark keeps moving.
      */}
      {loading ? (
        <PageLoader label={t('common.loading')} />
      ) : (
        <>
          <TabPanel value={OVERVIEW_TAB} activeValue={activeTab} idPrefix="kyc-builder">
            {steps.length === 0 ? (
              <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
                {t('builder.noSteps')}
              </div>
            ) : (
              <div className="space-y-8">
                <section>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-bold text-foreground">
                        {t('builder.tabPreview')}
                      </h2>
                      <p className="text-xs text-muted-foreground">{t('builder.previewIntro')}</p>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{t('builder.dragHint')}</p>
                  </div>

                  {/*
                   * REORDERING LIVES HERE, not on a step's own tab. A tab shows
                   * one step, and "move this one earlier" is a statement about
                   * the sequence — you cannot judge it without seeing the
                   * others. So the overview carries the drag handles and the
                   * arrows, and each row opens its tab.
                   */}
                  <SortableList items={steps} onReorder={(next) => setSteps(renumber(next))}>
                    <ol className="space-y-2">
                      {steps.map((step, index) => (
                        <SortableRow
                          key={step.id}
                          id={step.id}
                          handleLabel={t('builder.reorderStep', { title: step.title })}
                        >
                          <li
                            className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 ${
                              step.enabled
                                ? 'border-border bg-card'
                                : 'border-border/50 bg-muted/20'
                            }`}
                          >
                            <span
                              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                                step.enabled
                                  ? 'bg-primary/10 text-link'
                                  : 'bg-muted text-muted-foreground'
                              }`}
                            >
                              {step.stepNumber}
                            </span>

                            <button
                              type="button"
                              onClick={() => setTab(step.id)}
                              className="focus-outline min-w-0 flex-1 rounded-md text-left"
                            >
                              <span
                                className={`text-sm font-semibold ${
                                  step.enabled
                                    ? 'text-foreground hover:text-link'
                                    : 'text-muted-foreground line-through'
                                }`}
                              >
                                {step.title}
                              </span>
                              <span className="ms-2 text-[11px] text-muted-foreground">
                                {t('builder.fieldsCount', { count: step.fields.length })}
                              </span>
                              {!step.enabled && (
                                <span className="ms-2 text-[11px] text-muted-foreground">
                                  {t('builder.previewSkipped')}
                                </span>
                              )}
                            </button>

                            <div className="flex shrink-0 items-center gap-1.5">
                              <button
                                type="button"
                                disabled={index === 0}
                                onClick={() => moveStep(index, 'up')}
                                className="focus-outline flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30"
                                title={t('kycBuilder.moveStepUp')}
                              >
                                <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                disabled={index === steps.length - 1}
                                onClick={() => moveStep(index, 'down')}
                                className="focus-outline flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30"
                                title={t('kycBuilder.moveStepDown')}
                              >
                                <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setTab(step.id)}
                                className="h-7 px-2.5 text-[11px]"
                              >
                                {t('builder.openStep')}
                              </Button>
                            </div>
                          </li>
                        </SortableRow>
                      ))}
                    </ol>
                  </SortableList>
                </section>

                <section>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-bold text-foreground">{t('builder.tabAll')}</h2>
                      <p className="text-xs text-muted-foreground">{t('builder.allFieldsIntro')}</p>
                    </div>
                    <span
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold ${
                        problemCount > 0
                          ? 'border border-warning/30 bg-warning/10 text-warning'
                          : 'border border-success/30 bg-success/10 text-success'
                      }`}
                    >
                      {problemCount > 0
                        ? t('builder.problemsFound', { count: problemCount })
                        : t('builder.noProblems')}
                    </span>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-border bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-semibold">{t('builder.colStep')}</th>
                          <th className="px-3 py-2 font-semibold">{t('builder.colField')}</th>
                          <th className="px-3 py-2 font-semibold">{t('builder.colKey')}</th>
                          <th className="px-3 py-2 font-semibold">{t('builder.colType')}</th>
                          <th className="px-3 py-2 font-semibold">{t('builder.colRequired')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allFields.map(({ step, field }) => {
                          const duplicate = duplicateNames.has(field.name);
                          const emptySelect = emptySelects.has(field.id);
                          return (
                            <tr
                              key={`${step.id}-${field.id}`}
                              className="border-b border-border/50"
                            >
                              <td className="px-3 py-2">
                                <button
                                  type="button"
                                  onClick={() => setTab(step.id)}
                                  className="focus-outline rounded-md text-muted-foreground hover:text-link"
                                >
                                  {step.title}
                                </button>
                              </td>
                              <td className="px-3 py-2 font-medium">{field.label}</td>
                              <td className="px-3 py-2">
                                <span className="font-mono">{field.name}</span>
                                {duplicate && (
                                  <span className="ms-2 inline-flex items-center gap-1 rounded-md border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
                                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                                    {t('builder.duplicateKey')}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <span className="font-mono text-muted-foreground">
                                  {field.type}
                                </span>
                                {emptySelect && (
                                  <span className="ms-2 inline-flex items-center gap-1 rounded-md border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
                                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                                    {t('builder.emptySelect')}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-muted-foreground">
                                {field.required ? t('builder.yes') : t('builder.no')}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            )}
          </TabPanel>

          {/*
           * One panel per step, and only the ACTIVE one is mounted — `TabPanel`
           * returns null otherwise. So a config with twenty steps renders one
           * step's inputs rather than twenty, which is the other half of why
           * this is tabs rather than a stack of accordions.
           */}
          {activeStep && (
            <TabPanel value={activeStep.id} activeValue={activeTab} idPrefix="kyc-builder">
              <StepCard
                step={activeStep}
                index={steps.indexOf(activeStep)}
                total={steps.length}
                onMove={(direction) => moveStep(steps.indexOf(activeStep), direction)}
                onToggleEnabled={() => toggleStepEnabled(activeStep.id)}
                onDelete={() => void deleteStep(activeStep.id)}
                onPatch={(patch) => patchStep(activeStep.id, patch)}
                onAddField={() => addFieldToStep(activeStep.id)}
                onPatchField={(fieldId, patch) => patchField(activeStep.id, fieldId, patch)}
                onRemoveField={(fieldId) => removeFieldFromStep(activeStep.id, fieldId)}
                onReorderFields={(fields) => reorderFields(activeStep.id, fields)}
                catalogue={catalogue}
              />
            </TabPanel>
          )}
        </>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl duration-150 animate-in fade-in-0 zoom-in-95">
            <div className="mb-1 flex items-center gap-2 text-link">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
              <h3 className="text-lg font-bold text-foreground">{t('builder.newStepTitle')}</h3>
            </div>
            <p className="mb-6 text-xs text-muted-foreground">{t('builder.newStepBody')}</p>

            <form onSubmit={handleAddStepSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-step-title">
                  {t('builder.stepTitle')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="new-step-title"
                  required
                  placeholder={t('builder.titlePlaceholder')}
                  value={newStepTitle}
                  onChange={(e) => setNewStepTitle(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-step-slug">{t('builder.urlSlug')}</Label>
                <Input
                  id="new-step-slug"
                  placeholder={t('builder.slugPlaceholder')}
                  value={newStepSlug}
                  onChange={(e) => setNewStepSlug(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-step-desc">{t('builder.guidance')}</Label>
                <Input
                  id="new-step-desc"
                  placeholder={t('builder.guidancePlaceholder')}
                  value={newStepDesc}
                  onChange={(e) => setNewStepDesc(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
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
