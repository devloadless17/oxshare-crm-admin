'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { Agency, ClientRef } from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { useDebounced } from '@/hooks/use-debounced';
import { Modal } from '@/components/ui/modal';
import { toastError, toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';
import { PortalIdTag } from '@/components/clients/client-identity';

/**
 * Where a partner stands in the tree, changed by hand (owner, 7 Oct 2026):
 * make an individual a partner under an agency, cut a sub-partner loose to be
 * a main partner, and the picker every "under which main partner" question
 * shares.
 *
 * One rule runs through all of it and every dialog says so: a main partner
 * has no "introduced by", and a sub-partner's "introduced by" is the main
 * partner they sit under. The API keeps the two in step; the copy makes sure
 * the operator knows the attribution moves with the click.
 */

/**
 * A searchable list of MAIN partners (level 1, active) to place somebody
 * under. Sub-partners are left out because the tree has two levels and the API
 * refuses one as a parent; suspended partners because it refuses those too.
 * Searched on the server, so a book of thousands is reachable, not just the
 * first page.
 */
export function MainPartnerPicker({
  value,
  onChange,
  exclude,
  enabled,
  name = 'main-partner',
}: {
  value: ClientRef | null;
  onChange: (userId: ClientRef) => void;
  /** The partner being moved — never their own parent. */
  exclude?: ClientRef;
  enabled: boolean;
  name?: string;
}) {
  const [search, setSearch] = React.useState('');
  const term = useDebounced(search.trim(), 300);
  const partners = useResource(
    keys.ibPartners.forReassign(term),
    (signal) =>
      api.admin.getIbPartners(
        { page: 1, limit: 50, q: term || undefined, status: 'active' },
        signal,
      ),
    { enabled },
  );
  const options = (partners.data?.rows ?? []).filter(
    (row) => row.account.level === 1 && row.account.userId !== exclude,
  );

  return (
    <div className="space-y-2">
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('clientProfile.mainPartnerSearch')}
        aria-label={t('clientProfile.mainPartnerSearch')}
        className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm focus-outline"
      />
      <fieldset className="max-h-56 space-y-1.5 overflow-y-auto">
        <legend className="sr-only">{t('clientProfile.mainPartnerLegend')}</legend>
        {options.map((row) => {
          const label =
            [row.user.firstName, row.user.lastName].filter(Boolean).join(' ') ||
            row.user.email ||
            `#${row.user.portalId}`;
          return (
            <label
              key={row.account.userId}
              className={`flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 ${
                value === row.account.userId ? 'border-primary bg-primary/5' : 'border-border'
              }`}
            >
              <input
                type="radio"
                name={name}
                checked={value === row.account.userId}
                onChange={() => onChange(row.account.userId)}
                className="h-3.5 w-3.5 shrink-0"
              />
              <span className="min-w-0">
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <span className="truncate text-sm font-medium">{label}</span>
                  <PortalIdTag id={row.user.portalId} />
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {[row.user.email, row.agencyName].filter(Boolean).join(' · ')}
                </span>
              </span>
            </label>
          );
        })}
        {partners.status === 'ready' && options.length === 0 && (
          <p className="rounded-lg border border-border bg-muted/20 p-2.5 text-xs text-muted-foreground">
            {term ? t('clientProfile.mainPartnerNoMatch') : t('clientProfile.mainPartnerNone')}
          </p>
        )}
      </fieldset>
    </div>
  );
}

/**
 * Make an individual client a partner (owner, 7 Oct 2026): choose the agency,
 * and optionally a main partner to sit under — none makes them a main partner.
 * It is an approval on the server, so the referral code, commission wallet and
 * the client's email all follow as they do from the review queue.
 */
export function AppointPartnerDialog({
  open,
  onClose,
  userId,
  name,
}: {
  open: boolean;
  onClose: () => void;
  userId: ClientRef;
  name: string;
}) {
  const queryClient = useQueryClient();
  const [agencyId, setAgencyId] = React.useState('');
  const [placement, setPlacement] = React.useState<'main' | 'sub'>('main');
  const [parentId, setParentId] = React.useState<ClientRef | null>(null);

  const agencies = useResource<Agency[]>(
    keys.agencies.all(),
    (signal) => api.admin.getAgencies(signal),
    { enabled: open },
  );
  const options = agencies.data ?? [];

  const save = useMutation({
    mutationFn: () =>
      api.admin.appointIbPartner(userId, {
        agencyId,
        parentIbUserId: placement === 'sub' ? parentId : null,
      }),
    onSuccess: async () => {
      await invalidatePartnerViews(queryClient);
      toastSuccess(t('clientProfile.appointDone', { name }));
      onClose();
    },
    onError: (error) => toastError(error, t('clientProfile.appointFailed')),
  });

  const ready = Boolean(agencyId) && (placement === 'main' || parentId !== null);

  return (
    <Modal
      busy={save.isPending}
      open={open}
      onClose={onClose}
      title={t('clientProfile.appointTitle', { name })}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) save.mutate();
        }}
      >
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t('clientProfile.appointBody')}
        </p>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">{t('clientProfile.appointAgency')}</h3>
          <fieldset className="max-h-48 space-y-1.5 overflow-y-auto">
            <legend className="sr-only">{t('clientProfile.appointAgency')}</legend>
            {options.map((agency) => (
              <label
                key={agency.id}
                className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 ${
                  agencyId === agency.id ? 'border-primary bg-primary/5' : 'border-border'
                }`}
              >
                <input
                  type="radio"
                  name="appoint-agency"
                  checked={agencyId === agency.id}
                  onChange={() => setAgencyId(agency.id)}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{agency.name}</span>
                  {agency.description && (
                    <span className="block text-xs text-muted-foreground">
                      {agency.description}
                    </span>
                  )}
                  {!agency.enabled && (
                    <span className="mt-0.5 block text-[11px] text-warning">
                      {t('partnerReview.agencyClosed')}
                    </span>
                  )}
                </span>
              </label>
            ))}
            {agencies.status === 'ready' && options.length === 0 && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive"
              >
                {t('partnerReview.noAgenciesConfigured')}
              </p>
            )}
          </fieldset>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">{t('clientProfile.appointPlacement')}</h3>
          <div className="grid grid-cols-2 gap-2">
            {(['main', 'sub'] as const).map((value) => (
              <label
                key={value}
                className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 ${
                  placement === value ? 'border-primary bg-primary/5' : 'border-border'
                }`}
              >
                <input
                  type="radio"
                  name="appoint-placement"
                  checked={placement === value}
                  onChange={() => setPlacement(value)}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                />
                <span>
                  <span className="block text-sm font-medium">
                    {value === 'main'
                      ? t('clientProfile.appointAsMain')
                      : t('clientProfile.appointAsSub')}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {value === 'main'
                      ? t('clientProfile.appointAsMainHint')
                      : t('clientProfile.appointAsSubHint')}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {placement === 'sub' && (
            <MainPartnerPicker
              value={parentId}
              onChange={setParentId}
              exclude={userId}
              enabled={open}
              name="appoint-parent"
            />
          )}
        </div>

        <DialogFooter
          onClose={onClose}
          saving={save.isPending}
          disabled={!ready}
          label={t('clientProfile.appointSave')}
        />
      </form>
    </Modal>
  );
}

/**
 * Cut a sub-partner loose (owner, 7 Oct 2026): they become a main partner on
 * level 1 with no parent, and "introduced by" is removed — they are the
 * broker's partner now. Their own terms go with it (a main partner has none).
 */
export function MakeMainPartnerDialog({
  open,
  onClose,
  userId,
  name,
  parentName,
}: {
  open: boolean;
  onClose: () => void;
  userId: ClientRef;
  name: string;
  /** Who they are under now, when the reader may see it. */
  parentName: string | null;
}) {
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: () => api.admin.reassignIbPartnerParent(userId, null),
    onSuccess: async () => {
      await invalidatePartnerViews(queryClient);
      toastSuccess(t('clientProfile.makeMainDone', { name }));
      onClose();
    },
    onError: (error) => toastError(error, t('clientProfile.makeMainFailed')),
  });

  return (
    <Modal
      busy={save.isPending}
      open={open}
      onClose={onClose}
      title={t('clientProfile.makeMainTitle', { name })}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <p className="text-xs leading-relaxed text-muted-foreground">
          {parentName
            ? t('clientProfile.makeMainBodyNamed', { parent: parentName })
            : t('clientProfile.makeMainBody')}
        </p>
        <ul className="list-disc space-y-1 ps-5 text-xs text-muted-foreground">
          <li>{t('clientProfile.makeMainEffectLevel')}</li>
          <li>{t('clientProfile.makeMainEffectReferrer')}</li>
          <li>{t('clientProfile.makeMainEffectTerms')}</li>
        </ul>
        <DialogFooter
          onClose={onClose}
          saving={save.isPending}
          disabled={false}
          label={t('clientProfile.makeMainSave')}
        />
      </form>
    </Modal>
  );
}

export function DialogFooter({
  onClose,
  saving,
  disabled,
  label,
}: {
  onClose: () => void;
  saving: boolean;
  disabled: boolean;
  label: string;
}) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <button
        type="button"
        onClick={onClose}
        className="inline-flex h-9 items-center rounded-lg border border-border px-4 text-xs font-semibold hover:bg-muted focus-outline"
      >
        {t('common.cancel')}
      </button>
      <button
        type="submit"
        disabled={saving || disabled}
        className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 focus-outline"
      >
        {saving ? t('common.saving') : label}
      </button>
    </div>
  );
}

/**
 * Every screen a partner change is read back from — the profile and its
 * panels (`clients.all()`), the partner lists and pickers (`ibPartners.all()`),
 * and the review queue an appointment may have just decided.
 */
export async function invalidatePartnerViews(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: keys.clients.all() }),
    queryClient.invalidateQueries({ queryKey: keys.ibPartners.all() }),
    queryClient.invalidateQueries({ queryKey: keys.ibApplications.all() }),
  ]);
}
