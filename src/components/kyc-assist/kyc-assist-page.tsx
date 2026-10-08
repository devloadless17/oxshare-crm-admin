'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Ban,
  Hourglass,
  RotateCcw,
  ShieldCheck,
  Undo2,
  UserCog,
  type LucideIcon,
} from 'lucide-react';
import api from '@/lib/api';
import type { KycAssistStep, KycAssistTarget, KycAssistView } from '@/lib/api/admin';
import { apiFieldErrors } from '@/lib/api/errors';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { PermittedLink } from '@/components/permitted-link';
import { clientName, PortalIdTag } from '@/components/clients/client-identity';
import { KycStatusBadge } from '@/components/clients/profile/profile-cards';
import { DocLightbox } from '@/components/kyc-review/doc-lightbox';
import { toastError, toastSuccess } from '@/lib/toast';
import { keys } from '@/lib/query-keys';
import { t } from '@/lib/i18n';
import { AssistStepCard } from './assist-step-card';
import { AssistBar } from './assist-bar';
import { ReturnDialog } from './return-dialog';
import { useUnsavedGuard } from './use-unsaved-guard';
import { keepDrafts, keptDrafts, type Drafts } from './unsaved-drafts';

/** The answer on record for a typed question. The personal step's ARE the client's profile. */
function recorded(view: KycAssistView, slug: string, name: string): string {
  if (slug === 'personal') return view.personalInfo?.[name] ?? '';
  const answer = view.stepData?.[slug]?.[name];
  return typeof answer === 'string' ? answer : '';
}

function Notice({
  icon: Icon,
  tone = 'neutral',
  title,
  children,
  actions,
}: {
  icon: LucideIcon;
  tone?: 'neutral' | 'warning' | 'success' | 'destructive';
  title?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const toneClass = {
    neutral: 'border-border bg-muted/40 text-muted-foreground',
    warning: 'border-warning/40 bg-warning/10 text-foreground',
    success: 'border-success/40 bg-success/10 text-foreground',
    destructive: 'border-destructive/40 bg-destructive/5 text-foreground',
  }[tone];
  return (
    <div className={`flex items-start gap-3 rounded-xl border p-3.5 text-xs ${toneClass}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-1">
        {title && <p className="font-semibold text-foreground">{title}</p>}
        <div className="leading-relaxed">{children}</div>
        {actions && <div className="flex flex-wrap gap-3 pt-1">{actions}</div>}
      </div>
    </div>
  );
}

/**
 * "COMPLETE KYC" (backend 0210) — staff do a client's KYC FOR them.
 *
 * For clients who cannot do it themselves. Every action is the CLIENT's own
 * (the server runs the client's KYC rules), recorded under the staff member:
 * this page renders the server's layout and sends answers and files back to
 * the slots it named. It decides nothing — not which pages a document has, not
 * what is missing, not whether the KYC may be changed.
 *
 * Answers are saved explicitly (Save, or Submit, which saves first), and only
 * the ones that CHANGED: echoing the whole form would overwrite what the client
 * or a colleague wrote a moment ago. Files go up the moment they are chosen.
 */
export function KycAssistPage({ clientId, view }: { clientId: string; view: KycAssistView }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { admin } = useAdmin();
  const canReview = hasPermission(admin, 'kyc.review');
  const adminId = admin?.id ?? '';
  // Answers this operator left unsaved here (by the Back button), offered back while the
  // KYC is still open to changes.
  const [restored] = React.useState(() =>
    view.editable ? keptDrafts(adminId, clientId) : undefined,
  );
  const [drafts, setDrafts] = React.useState<Drafts>(() => restored ?? {});
  const [offerRestored, setOfferRestored] = React.useState(restored !== undefined);
  const [errors, setErrors] = React.useState<Drafts>({});
  const [busy, setBusy] = React.useState<'save' | 'submit' | 'return' | null>(null);
  const [returning, setReturning] = React.useState(false);
  const [lightbox, setLightbox] = React.useState<{ filePath: string; label: string } | null>(null);

  const changesOf = (slug: string): Record<string, string> =>
    Object.fromEntries(
      Object.entries(drafts[slug] ?? {}).filter(
        ([name, value]) => value !== recorded(view, slug, name),
      ),
    );
  const dirtySlugs = view.steps
    .map((step) => step.slug)
    .filter((slug) => Object.keys(changesOf(slug)).length > 0);
  const dirty = dirtySlugs.length > 0;

  // Leaving with unsaved answers asks first — the tab, or any link in the console —
  // and choosing Leave drops them, as the question said it would. For good: a refetch
  // landing while the page closes must not keep them again.
  const left = React.useRef(false);
  useUnsavedGuard(dirty, () => {
    left.current = true;
    keepDrafts(adminId, clientId, {});
  });

  // The unsaved answers, kept in memory: what the Back button cannot be asked about.
  const unsaved = React.useMemo(() => {
    const kept: Drafts = {};
    if (!view.editable) return kept;
    for (const { slug } of view.steps) {
      const changed = Object.entries(drafts[slug] ?? {}).filter(
        ([name, value]) => value !== recorded(view, slug, name),
      );
      if (changed.length > 0) kept[slug] = Object.fromEntries(changed);
    }
    return kept;
  }, [drafts, view]);
  React.useEffect(() => {
    if (!left.current) keepDrafts(adminId, clientId, unsaved);
  }, [adminId, clientId, unsaved]);

  const discardRestored = () => {
    setDrafts({});
    setErrors({});
    setOfferRestored(false);
  };

  /** Every write answers with the page as it now stands — shown at once. */
  const accept = (next: KycAssistView) => {
    queryClient.setQueryData(keys.kyc.assist(clientId), next);
    // The queue, the review and the client's profile read the same record. Marked stale
    // without re-reading THIS page (it is current, and its read is an audited one) …
    void queryClient.invalidateQueries({ queryKey: keys.kyc.all(), refetchType: 'none' });
    // … except the badge on every page, and the client's own profile.
    void queryClient.invalidateQueries({ queryKey: keys.kyc.pendingCount() });
    void queryClient.invalidateQueries({ queryKey: keys.clients.detail(clientId) });
  };

  const forget = (slug: string) => {
    setDrafts(({ [slug]: _saved, ...rest }) => rest);
    setErrors(({ [slug]: _cleared, ...rest }) => rest);
  };

  /** Saves every step with changes, in order; stops at the first refusal and shows it. */
  const saveChanges = async (): Promise<boolean> => {
    for (const slug of dirtySlugs) {
      try {
        accept(await api.admin.saveKycAssistStep(clientId, slug, changesOf(slug)));
        forget(slug);
      } catch (error) {
        const fields = apiFieldErrors(error);
        if (Object.keys(fields).length > 0)
          setErrors((current) => ({ ...current, [slug]: fields }));
        toastError(error, t('kycAssist.saveFailed'));
        document.getElementById(`assist-step-${slug}`)?.scrollIntoView({ behavior: 'smooth' });
        return false;
      }
    }
    return true;
  };

  const save = async () => {
    setBusy('save');
    try {
      if (await saveChanges()) toastSuccess(t('kycAssist.saved'));
    } finally {
      setBusy(null);
    }
  };

  const submit = async (approve: boolean) => {
    setBusy('submit');
    try {
      if (!(await saveChanges())) return;
      const next = await api.admin.submitKycAssist(clientId, approve);
      accept(next);
      toastSuccess(next.status === 'approved' ? t('kycAssist.approved') : t('kycAssist.submitted'));
      router.push(`/clients/${clientId}`);
    } catch (error) {
      // The server's sentence — what is still missing, or why it may not be approved.
      toastError(error, t('kycAssist.submitFailed'));
      void queryClient.invalidateQueries({ queryKey: keys.kyc.assist(clientId) });
    } finally {
      setBusy(null);
    }
  };

  // A refusal is shown on the tile that sent it (`UploadTile`), so this only accepts.
  const upload = async (file: File, target: KycAssistTarget) => {
    accept(await api.admin.uploadKycAssistFile(clientId, file, file.name, target));
  };

  const returnToEdit = async (reason: string) => {
    setBusy('return');
    try {
      accept(await api.admin.returnKycAssist(clientId, reason));
      setReturning(false);
      toastSuccess(t('kycAssist.returnedToEdit'));
    } catch (error) {
      toastError(error, t('kycAssist.returnFailed'));
    } finally {
      setBusy(null);
    }
  };

  const valuesFor = (step: KycAssistStep) =>
    Object.fromEntries(
      step.fields
        .filter((field) => !field.upload)
        .map((field) => [
          field.name,
          drafts[step.slug]?.[field.name] ?? recorded(view, step.slug, field.name),
        ]),
    );
  // Named by the one helper; a role that hides the name still sees the Portal ID beside it.
  const name = clientName(view.personalInfo?.firstName, view.personalInfo?.lastName);
  const done = view.steps.filter((step) => step.complete).length;
  const waiting = view.status === 'submitted' || view.status === 'under_review';
  const reviewLink = (
    <PermittedLink
      href={`/kyc/${view.userId}`}
      className="font-semibold text-link hover:underline focus-outline"
    >
      {t('kycAssist.openReview')}
    </PermittedLink>
  );

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <Link
        href={`/clients/${clientId}`}
        className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground focus-outline"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        {t('kycAssist.back')}
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1.5">
          <h1 className="text-xl font-bold text-foreground">{t('kycAssist.title')}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {name && <span className="font-semibold text-foreground">{name}</span>}
            <PortalIdTag id={view.userId} />
            <KycStatusBadge status={view.status} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground tabular">
          {t('kycAssist.progress', { done, total: view.steps.length })}
        </p>
      </header>

      <Notice icon={UserCog}>{t('kycAssist.banner')}</Notice>

      {view.suspended && (
        <Notice icon={Ban} tone="destructive" title={t('kycAssist.suspendedTitle')}>
          {t('kycAssist.suspendedBody')}
        </Notice>
      )}
      {offerRestored && dirty && (
        <Notice
          icon={RotateCcw}
          tone="warning"
          title={t('kycAssist.restoredTitle')}
          actions={
            <button
              type="button"
              onClick={discardRestored}
              className="font-semibold text-link hover:underline focus-outline"
            >
              {t('kycAssist.restoredDiscard')}
            </button>
          }
        >
          {t('kycAssist.restoredBody')}
        </Notice>
      )}

      {waiting && (
        <Notice
          icon={Hourglass}
          tone="warning"
          title={t('kycAssist.waitingTitle')}
          actions={
            <>
              {reviewLink}
              {canReview && !view.suspended && (
                <button
                  type="button"
                  onClick={() => setReturning(true)}
                  className="font-semibold text-link hover:underline focus-outline"
                >
                  {t('kycAssist.returnToEdit')}
                </button>
              )}
            </>
          }
        >
          {t('kycAssist.waitingBody')}
        </Notice>
      )}
      {view.status === 'approved' && (
        <Notice
          icon={ShieldCheck}
          tone="success"
          title={t('kycAssist.verifiedTitle')}
          actions={reviewLink}
        >
          {t('kycAssist.verifiedBody')}
        </Notice>
      )}
      {view.status === 'rejected' && view.rejectionReason && (
        <Notice icon={Undo2} tone="destructive" title={t('kycAssist.returnedTitle')}>
          {view.rejectionReason}
        </Notice>
      )}

      {view.steps.map((step, index) => (
        <AssistStepCard
          key={step.slug}
          step={step}
          number={index + 1}
          values={valuesFor(step)}
          errors={errors[step.slug] ?? {}}
          disabled={!view.editable || busy !== null}
          onChange={(field, value) => {
            setDrafts((current) => ({
              ...current,
              [step.slug]: { ...current[step.slug], [field]: value },
            }));
            setErrors((current) => {
              const { [field]: _answered, ...rest } = current[step.slug] ?? {};
              return { ...current, [step.slug]: rest };
            });
          }}
          onUpload={upload}
          onOpen={(filePath, label) => setLightbox({ filePath, label })}
        />
      ))}

      <AssistBar
        steps={view.steps}
        complete={view.complete}
        editable={view.editable}
        dirty={dirty}
        canApprove={canReview}
        busy={busy === 'return' ? null : busy}
        onSave={() => void save()}
        onSubmit={(approve) => void submit(approve)}
      />

      {lightbox && (
        <DocLightbox
          docs={[lightbox]}
          index={0}
          onClose={() => setLightbox(null)}
          onNavigate={() => undefined}
        />
      )}
      <ReturnDialog
        open={returning}
        busy={busy === 'return'}
        onClose={() => setReturning(false)}
        onConfirm={(reason) => void returnToEdit(reason)}
      />
    </div>
  );
}
