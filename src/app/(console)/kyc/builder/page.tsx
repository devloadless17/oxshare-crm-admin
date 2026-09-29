'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Plus, RefreshCw, RotateCcw, Save } from 'lucide-react';
import api from '@/lib/api';
import { useResource } from '@/hooks/use-resource';
import { apiErrorCode, apiErrorMessage, apiFieldErrors } from '@/lib/api/errors';
import { AsyncBoundary } from '@/components/async-boundary';
import { Button } from '@/components/ui/button';
import { Tabs, TabPanel, type TabDefinition } from '@/components/ui/tabs';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toastSuccess } from '@/lib/toast';
import { StepCard, type KycStepConfig } from '@/components/kyc-builder/step-card';
import { type KycDocumentType, type KycFieldConfig } from '@/components/kyc-builder/field-editor';
import { BuilderOverview } from '@/components/kyc-builder/builder-overview';
import { AddStepDialog } from '@/components/kyc-builder/add-step-dialog';
import { placeRefusals, savePayload, type Refusals } from '@/components/kyc-builder/builder-save';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

export type { KycFieldConfig, KycStepConfig };

/** The one tab that is not a step — a literal, so it can never collide with a step id. */
const OVERVIEW_TAB = '__overview__';

/** The form, and the version a save must name (the `ETag` it was read with). */
interface BuilderForm {
  steps: KycStepConfig[];
  version?: string;
}

function etagOf(headers: unknown): string | undefined {
  const value = (headers as Record<string, unknown> | undefined)?.['etag'];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * The KYC onboarding builder — what a client is asked for, and in what order.
 *
 * ## What is the broker's, and what is the platform's (26 Sep 2026)
 *
 * The client's IDENTITY is fixed by the platform, as in any serious CRM: the
 * nine identity fields on Personal Information, the four built-in steps, and
 * the documents that prove identity and address. They arrive from the API
 * marked `system` / `core` and render as what they are — locked rows, a
 * document checklist, a fixed selfie line — so no control here can remove a
 * client's first name. (One could: deleting First Name and adding it back made
 * a custom box, and the real name stopped being asked. The report behind all of
 * this.) The broker owns everything else: questions on Personal Information,
 * steps of their own, which documents to accept, whether to ask for a selfie or
 * a proof of address, and every description.
 *
 * ## The server is the judge, and says where
 *
 * A save is checked against the rules (`kyc-config-integrity.ts`), and a
 * refusal names the step or field it is about — this screen puts the sentence
 * there and opens its tab. A save made from a version somebody else has since
 * changed is refused (`KYC_CONFIG_STALE`) instead of silently replacing their
 * work: the screen says so and offers to reload.
 *
 * ## The draft is the single source of truth
 *
 * `draft === null` means "no unsaved edits", so the server copy shows through
 * and Save simply drops it. Every edit goes through `setSteps`.
 */
export default function KycBuilderPage() {
  const { admin } = useAdmin();
  const canAddSteps = hasPermission(admin, 'kyc.create');
  const canDeleteSteps = hasPermission(admin, 'kyc.delete');
  const confirm = useConfirm();

  const [draft, setDraft] = React.useState<KycStepConfig[] | null>(null);
  /*
   * The version the draft was READ at. `query.data.version` is the LATEST read,
   * and a focus refetch replaces it while the draft is open — saving with that
   * would name a colleague's newer form as the one edited, and overwrite it.
   */
  const [draftVersion, setDraftVersion] = React.useState<string | undefined>(undefined);
  const [saving, setSaving] = React.useState(false);
  const [refusals, setRefusals] = React.useState<Refusals | null>(null);
  const [stale, setStale] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [tab, setTab] = React.useState(OVERVIEW_TAB);

  const query = useResource<BuilderForm>(keys.kyc.builder(), async (signal) => {
    const res = await api.get<KycStepConfig[]>('/admin/kyc-config', { signal });
    return { steps: res.data, version: etagOf(res.headers) };
  });
  // Served rather than duplicated: "a passport is one photo page" is a fact the
  // portal renders from too, and two copies would drift.
  const identityQuery = useResource<KycFieldConfig[]>(
    keys.kyc.identityCatalogue(),
    async (signal) =>
      (await api.get<KycFieldConfig[]>('/admin/kyc-config/identity-catalogue', { signal })).data,
  );
  const catalogueQuery = useResource<KycDocumentType[]>(
    keys.kyc.documentCatalogue(),
    async (signal) =>
      (await api.get<KycDocumentType[]>('/admin/kyc-config/document-catalogue', { signal })).data,
  );

  const steps = React.useMemo(() => draft ?? query.data?.steps ?? [], [draft, query.data]);
  const dirty = draft !== null;

  const setSteps = (next: KycStepConfig[] | ((prev: KycStepConfig[]) => KycStepConfig[])) => {
    // An edit answers the last refusal — it is about a form that no longer exists.
    setRefusals(null);
    if (draft === null) setDraftVersion(query.data?.version);
    setDraft((prev) => {
      const base = prev ?? query.data?.steps ?? [];
      return (typeof next === 'function' ? next(base) : next).map((step, index) => ({
        ...step,
        stepNumber: index + 1,
      }));
    });
  };
  const patchStep = (id: string, patch: Partial<KycStepConfig>) =>
    setSteps((prev) => prev.map((step) => (step.id === id ? { ...step, ...patch } : step)));
  const patchFields = (id: string, change: (fields: KycFieldConfig[]) => KycFieldConfig[]) =>
    setSteps((prev) =>
      prev.map((step) => (step.id === id ? { ...step, fields: change(step.fields) } : step)),
    );

  /** A question moves with its answers: keys are unique across the form (Phase 2). */
  const moveField = (fromId: string, fieldId: string, toId: string) =>
    setSteps((prev) => {
      const field = prev.find((step) => step.id === fromId)?.fields.find((f) => f.id === fieldId);
      if (!field) return prev;
      return prev.map((step) =>
        step.id === fromId
          ? { ...step, fields: step.fields.filter((f) => f.id !== fieldId) }
          : step.id === toId
            ? { ...step, fields: [...step.fields, field] }
            : step,
      );
    });

  const reload = async () => {
    setDraft(null);
    setDraftVersion(undefined);
    setRefusals(null);
    setStale(false);
    await query.refetch();
  };

  const handleSave = async () => {
    setSaving(true);
    setRefusals(null);
    try {
      const version = draftVersion ?? query.data?.version;
      // `format: 2`: this console knows identity placements and optional evidence;
      // an older one is refused (409 KYC_BUILDER_OUTDATED) rather than erase them.
      const body = { format: 2, steps: savePayload(steps) };
      if (version) await api.put('/admin/kyc-config', body, { headers: { 'If-Match': version } });
      else await api.put('/admin/kyc-config', body);
      setDraft(null);
      setDraftVersion(undefined);
      await query.refetch();
      toastSuccess(t('builder.saved'));
    } catch (error) {
      if (
        apiErrorCode(error) === 'KYC_CONFIG_STALE' ||
        apiErrorCode(error) === 'KYC_BUILDER_OUTDATED'
      ) {
        setStale(true);
        return;
      }
      const placed = placeRefusals(apiFieldErrors(error), steps);
      setRefusals(placed);
      if (placed.firstStepId) setTab(placed.firstStepId);
      toast.error(apiErrorMessage(error, t('builder.saveFailed')), { duration: 8000 });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    const ok = await confirm({
      title: t('builder.confirmResetTitle'),
      description: t('builder.confirmResetBody'),
      confirmLabel: t('builder.resetDefaults'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.post('/admin/kyc-config/reset');
      await reload();
      setTab(OVERVIEW_TAB);
      toastSuccess(t('builder.resetDone'));
    } catch (error) {
      toast.error(apiErrorMessage(error, t('builder.resetFailed')), { duration: 8000 });
    }
  };

  const addStep = ({ title, description }: { title: string; description: string }) => {
    const step: KycStepConfig = {
      id: `step-${Date.now()}`,
      stepNumber: steps.length + 1,
      // No address: the server gives a new step one from its title.
      slug: '',
      title,
      description: description || t('builder.defaultStepDescription'),
      icon: 'FileText',
      enabled: true,
      fields: [],
      core: false,
      alwaysOn: false,
    };
    setSteps((prev) => [...prev, step]);
    setAdding(false);
    setTab(step.id);
    toastSuccess(t('builder.stepAdded', { title }));
  };

  const deleteStep = async (step: KycStepConfig) => {
    const ok = await confirm({
      title: t('builder.confirmDeleteStepTitle', { title: step.title }),
      description: t('builder.confirmDeleteStepBody'),
      confirmLabel: t('common.delete'),
      destructive: true,
    });
    if (!ok) return;
    setSteps((prev) => prev.filter((candidate) => candidate.id !== step.id));
    setTab(OVERVIEW_TAB);
    toastSuccess(t('builder.stepDeleted'));
  };

  const addField = (stepId: string) => {
    const stamp = Date.now();
    patchFields(stepId, (fields) => [
      ...fields,
      {
        id: `field-${stamp}`,
        name: `customField_${stamp}`,
        label: t('builder.newField'),
        type: 'text',
        required: false,
      },
    ]);
  };

  // A deleted step's tab falls back to the overview, computed rather than fixed in an effect.
  const tabs: TabDefinition[] = [
    { value: OVERVIEW_TAB, label: t('builder.tabOverview') },
    ...steps.map((step) => ({ value: step.id, label: `${step.stepNumber}. ${step.title}` })),
  ];
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
            onClick={() => void handleReset()}
            disabled={saving}
            className="gap-2"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            <span>{t('builder.resetDefaults')}</span>
          </Button>
          {canAddSteps && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAdding(true)}
              className="gap-2 border-primary/30 text-link hover:bg-primary/10"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>{t('builder.addCustomStep')}</span>
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => void handleSave()}
            disabled={saving || !dirty}
            className="gap-2 shadow-md shadow-primary/20"
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            <span>{saving ? t('builder.savingAll') : t('builder.saveAll')}</span>
          </Button>
        </div>
      </div>

      {stale && (
        <div
          role="alert"
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs text-foreground"
        >
          <span>{t('builder.staleBody')}</span>
          <Button size="sm" variant="outline" onClick={() => void reload()} className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            {t('builder.reload')}
          </Button>
        </div>
      )}
      {refusals?.form && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-xs font-medium text-destructive"
        >
          {refusals.form}
        </p>
      )}

      <AsyncBoundary
        status={query.status}
        label={t('common.loading')}
        endpoints={['GET /admin/kyc-config']}
        onRetry={query.refetch}
        errorMessage={t('builder.loadFailed')}
        error={query.error}
      >
        <div className="mt-6 flex items-end justify-between gap-4">
          <Tabs tabs={tabs} value={activeTab} onValueChange={setTab} idPrefix="kyc-builder" />
          <p className="hidden shrink-0 pb-2 text-[11px] text-muted-foreground sm:block">
            {t('builder.stepsCount', { count: steps.length })} ·{' '}
            {t('builder.activeCount', { count: steps.filter((step) => step.enabled).length })}
          </p>
        </div>

        <TabPanel value={OVERVIEW_TAB} activeValue={activeTab} idPrefix="kyc-builder">
          <BuilderOverview steps={steps} onReorder={setSteps} onOpen={setTab} />
        </TabPanel>

        {activeStep && (
          <TabPanel value={activeStep.id} activeValue={activeTab} idPrefix="kyc-builder">
            <StepCard
              step={activeStep}
              canDelete={canDeleteSteps}
              catalogue={catalogueQuery.data ?? []}
              refusal={refusals?.byStep[activeStep.id]}
              onToggleEnabled={() => patchStep(activeStep.id, { enabled: !activeStep.enabled })}
              onDelete={() => void deleteStep(activeStep)}
              onPatch={(patch) => patchStep(activeStep.id, patch)}
              onAddField={() => addField(activeStep.id)}
              onPatchField={(fieldId, patch) =>
                patchFields(activeStep.id, (fields) =>
                  fields.map((field) => (field.id === fieldId ? { ...field, ...patch } : field)),
                )
              }
              onRemoveField={(fieldId) =>
                patchFields(activeStep.id, (fields) =>
                  fields.filter((field) => field.id !== fieldId),
                )
              }
              onReorderFields={(fields) => patchFields(activeStep.id, () => fields)}
              onMoveField={(fieldId, toId) => moveField(activeStep.id, fieldId, toId)}
              moveTargets={steps
                .filter((candidate) => candidate.id !== activeStep.id)
                .map((candidate) => ({ id: candidate.id, title: candidate.title }))}
              identityCatalogue={identityQuery.data ?? []}
            />
          </TabPanel>
        )}
      </AsyncBoundary>

      {adding && <AddStepDialog onAdd={addStep} onClose={() => setAdding(false)} />}
    </div>
  );
}
