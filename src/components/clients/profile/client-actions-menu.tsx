'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AtSign,
  Ban,
  CheckCircle2,
  Pencil,
  Coins,
  ScrollText,
  FileText,
  Network,
  Percent,
  ShieldCheck,
  Tags,
  Users,
} from 'lucide-react';
import api from '@/lib/api';
import type { ClientProfile, IbPartnerDetail } from '@/lib/api/admin';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { RowActions, type RowAction } from '@/components/row-actions';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toastError, toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * Everything an operator can DO to this client, behind one trigger.
 *
 * ## Why a menu rather than a row of buttons
 *
 * The set is conditional twice over — on the viewer's permissions and on
 * whether the client is a partner — so laid out flat it is a header whose
 * shape changes per client and per admin, and whose most destructive item
 * ("suspend") sits next to its most routine one ("open KYC"). A menu keeps the
 * header stable, groups the partner actions behind a separator, and puts every
 * irreversible item behind a confirmation.
 *
 * ## It is NOT the enforcement
 *
 * Each mutation's endpoint carries its own `@RequirePermissions`, and the API
 * refuses regardless of what this renders. The `hasPermission` checks here stop
 * an operator reaching for something they will be refused — ARCHITECTURE §8.8,
 * the same relationship every other screen in this console has with its guard.
 *
 * An admin holding none of the keys gets an empty array, and `RowActions`
 * renders nothing at all rather than a trigger whose menu is empty.
 *
 * ## Every write invalidates BOTH queries
 *
 * The profile and the partner detail are separate requests behind separate
 * permissions, and several of these actions change what the other one returns —
 * suspending a partner changes their standing, not their client record, and
 * vice versa. Invalidating one would leave the header and the tab disagreeing
 * about the same person on the same screen.
 */
export function ClientActionsMenu({
  profile,
  partner,
  onManageTags,
  onChangeProgram,
  onReassignParent,
  onEditProfile,
  onChangeEmail,
  onShowDocuments,
  onShowNetwork,
}: {
  profile: ClientProfile;
  /** Null when this client is not a partner — the partner block is then absent. */
  partner: IbPartnerDetail | null;
  onManageTags: () => void;
  onChangeProgram: () => void;
  onReassignParent: () => void;
  onEditProfile: () => void;
  onChangeEmail: () => void;
  /**
   * Both of these move the page to a TAB, which is why they are callbacks and
   * not links. The menu renders above the tab strip and is therefore reachable
   * from all six tabs, while their targets live inside one — a `TabPanel`
   * returns null when it is not active, so the old `#documents` hash resolved
   * to nothing five-sixths of the time and the item read as broken.
   */
  onShowDocuments: () => void;
  onShowNetwork: () => void;
}) {
  const { admin } = useAdmin();
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const canEditClient = hasPermission(admin, 'clients.edit');
  /*
   * A SEPARATE key, not `clients.edit`.
   *
   * Changing the address an account signs in with is an account-takeover
   * primitive, and the API gates it on its own permission for that reason. If
   * this menu derived the item from `clients.edit`, the console would offer a
   * control that the API then refuses — and the operator would read the refusal
   * as a bug rather than as the boundary it is.
   */
  const canChangeEmail = hasPermission(admin, 'clients.email');
  const canSuspendClient = hasPermission(admin, 'clients.suspend');
  const canEditPartner = hasPermission(admin, 'ib.partners.edit');
  const canSuspendPartner = hasPermission(admin, 'ib.partners.suspend');
  const canAssignTags = hasPermission(admin, 'clients.tag');
  const canReviewKyc = hasPermission(admin, 'kyc.review');
  const canViewDocs = hasPermission(admin, 'kyc.documents.view') || canReviewKyc;
  const canViewCommissions =
    hasPermission(admin, 'ib.view') || hasPermission(admin, 'ib.commissions.view');
  const canViewClients = hasPermission(admin, 'clients.view');
  const canViewAudit = hasPermission(admin, 'audit.view');

  const name =
    [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.email || '';

  /*
   * `clients.all()` rather than the detail key alone: suspending from the
   * profile and pressing Back showed the row still reading Active, because the
   * LIST used to live under a different root (`['clients']`) from the PROFILE
   * (`['client', id]`) and no invalidate could reach both. One root now, so
   * this covers the list, this profile and the partner panel together.
   */
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.clients.all() }),
      queryClient.invalidateQueries({ queryKey: keys.stats.all() }),
    ]);
  };

  const setStatus = useMutation({
    mutationFn: (status: 'active' | 'suspended') => api.admin.setClientStatus(profile.id, status),
    onSuccess: async (_data, status) => {
      await invalidate();
      toastSuccess(t('clientProfile.statusChanged', { status }));
    },
    onError: (error) => toastError(error, t('clientProfile.statusFailed')),
  });

  const setPartnerActive = useMutation({
    mutationFn: (active: boolean) => api.admin.setIbPartnerActive(profile.id, active),
    onSuccess: async (_data, active) => {
      await invalidate();
      toastSuccess(
        t('clientProfile.partnerStateChanged', {
          state: active ? t('clientProfile.partnerActive') : t('clientProfile.partnerSuspended'),
        }),
      );
    },
    onError: (error) => toastError(error, t('clientProfile.partnerStateFailed')),
  });

  const suspended = profile.status === 'suspended';

  const confirmClientStatus = async () => {
    const next = suspended ? 'active' : 'suspended';
    const ok = await confirm({
      title: suspended
        ? t('clientProfile.confirmReactivateTitle', { name })
        : t('clientProfile.confirmSuspendTitle', { name }),
      description: suspended
        ? t('clientProfile.confirmReactivate')
        : t('clientProfile.confirmSuspend'),
      confirmLabel: suspended
        ? t('clientProfile.actionReactivate')
        : t('clientProfile.actionSuspend'),
      destructive: !suspended,
    });
    if (ok) setStatus.mutate(next);
  };

  const confirmPartnerActive = async () => {
    if (!partner) return;
    const next = !partner.active;
    const ok = await confirm({
      title: next
        ? t('clientProfile.confirmReactivatePartnerTitle', { name })
        : t('clientProfile.confirmSuspendPartnerTitle', { name }),
      description: next
        ? t('clientProfile.confirmReactivatePartner')
        : t('clientProfile.confirmSuspendPartner'),
      confirmLabel: next
        ? t('clientProfile.actionReactivatePartner')
        : t('clientProfile.actionSuspendPartner'),
      destructive: !next,
    });
    if (ok) setPartnerActive.mutate(next);
  };

  const items: RowAction[] = [
    ...(canEditClient
      ? [{ label: t('clientProfile.actionEditProfile'), icon: Pencil, onSelect: onEditProfile }]
      : []),
    /*
     * Marked destructive, and it is the only non-suspend item that is.
     *
     * It reads as a small edit and behaves like handing the account to whoever
     * owns the new inbox: sessions die, verification resets, and the previous
     * address is told. The styling is the first warning; the dialog spells the
     * rest out before anything is sent.
     */
    ...(canChangeEmail
      ? [
          {
            label: t('clientProfile.actionChangeEmail'),
            icon: AtSign,
            destructive: true,
            onSelect: onChangeEmail,
          },
        ]
      : []),
    ...(canSuspendClient
      ? [
          {
            label: suspended
              ? t('clientProfile.actionReactivate')
              : t('clientProfile.actionSuspend'),
            icon: suspended ? CheckCircle2 : Ban,
            destructive: !suspended,
            onSelect: () => void confirmClientStatus(),
          },
        ]
      : []),
    ...(canAssignTags
      ? [{ label: t('clientProfile.actionManageTags'), icon: Tags, onSelect: onManageTags }]
      : []),

    // ── Compliance, as navigation rather than mutation ─────────────────────
    ...(canReviewKyc
      ? [
          {
            label: t('clientProfile.actionOpenKyc'),
            icon: ShieldCheck,
            href: `/kyc/${profile.id}`,
            separatorBefore: canEditClient || canChangeEmail || canSuspendClient || canAssignTags,
          },
        ]
      : []),
    ...(canViewDocs && (profile.documents?.length ?? 0) > 0
      ? [
          {
            label: t('clientProfile.actionViewDocuments'),
            icon: FileText,
            /*
             * Selects the Overview tab and THEN scrolls. It used to be a bare
             * `#documents` hash, which only resolves while Overview is the
             * active tab — from Money, Partner, Positions, History or Network
             * the click added a fragment to the URL and moved nothing.
             */
            onSelect: onShowDocuments,
            separatorBefore: !canReviewKyc && (canSuspendClient || canAssignTags),
          },
        ]
      : []),

    // ── Partner, only when they are one ────────────────────────────────────
    ...(partner && canSuspendPartner
      ? [
          {
            label: partner.active
              ? t('clientProfile.actionSuspendPartner')
              : t('clientProfile.actionReactivatePartner'),
            icon: partner.active ? Ban : CheckCircle2,
            destructive: partner.active,
            separatorBefore: true,
            onSelect: () => void confirmPartnerActive(),
          },
        ]
      : []),
    ...(partner && canEditPartner
      ? [
          /* The TERMS. "Change level" used to sit above this, moving a partner
             on the ladder — a rung that decided nothing, presented beside the
             control that decided everything. 0102 removed it; this is the one
             entry that changes what a partner is paid. */
          {
            label: t('clientProfile.actionChangeLevel'),
            icon: Percent,
            separatorBefore: !canSuspendPartner,
            onSelect: onChangeProgram,
          },
          {
            label: t('clientProfile.actionReassignParent'),
            icon: Network,
            onSelect: onReassignParent,
          },
        ]
      : []),
    /*
     * EVERYTHING THAT HAS HAPPENED TO THIS CLIENT — the audit trail, scoped to
     * them.
     *
     * Every client, not only partners, and above the partner block for that
     * reason. `GET /admin/audit-log` accepted `actorId` from the day the store
     * was written and no route passed it, and nothing anywhere accepted a
     * SUBJECT — so the way to answer "what was done to this person" was to page
     * an append-only table that grows forever and read it. The filter is on the
     * endpoint now; this is the control that reaches it, because a filter you
     * can only use by hand-editing a URL is not a filter.
     *
     * The link is an `href` rather than a handler: it is a place, and an
     * operator should be able to open it in a tab beside the profile they are
     * reading. The API re-checks `audit.view` and the reader's client scope
     * regardless of what this renders.
     */
    ...(canViewAudit
      ? [
          {
            label: t('clientProfile.actionViewAuditTrail'),
            icon: ScrollText,
            separatorBefore: true,
            // By Portal ID: the audit search finds every row about the client —
            // as the subject and inside a money row's details — not only the
            // rows keyed on them.
            href: `/audit-log?q=${profile.portalId}`,
          },
        ]
      : []),
    ...(partner && canViewCommissions
      ? [
          {
            label: t('clientProfile.actionViewCommissions'),
            icon: Coins,
            href: `/commissions?ibUserId=${profile.portalId}`,
          },
        ]
      : []),
    ...(partner && canViewClients
      ? [
          {
            label: t('clientProfile.actionViewReferred'),
            icon: Users,
            /*
             * The NETWORK tab, which lists the clients THIS partner
             * introduced. It used to link to `/clients?type=referral`, and
             * `type` is derived as "referred by ANY partner" — so an item
             * inside a menu titled "Actions for {this partner}" opened a
             * platform-wide list, and an operator answering "how many clients
             * has this partner brought in" read the whole platform's referral
             * count as theirs.
             */
            onSelect: onShowNetwork,
          },
        ]
      : []),
  ];

  return (
    <RowActions
      items={items}
      busy={setStatus.isPending || setPartnerActive.isPending}
      label={t('clientProfile.actionsFor', { name })}
    />
  );
}
