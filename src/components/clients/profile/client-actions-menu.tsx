'use client';

import { clientLabel } from '@/components/clients/client-identity';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AtSign,
  Ban,
  CheckCircle2,
  Link2,
  Pencil,
  Coins,
  ScrollText,
  ShieldCheck,
  Tags,
  SlidersHorizontal,
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
  onEditProfile,
  onChangeEmail,
  onLinkAccount,
  onEditTerms,
}: {
  profile: ClientProfile;
  /** Null when this client is not a partner — the partner block is then absent. */
  partner: IbPartnerDetail | null;
  onManageTags: () => void;
  onEditProfile: () => void;
  onChangeEmail: () => void;
  /** Opens "Link an existing MT5 account" with this client filled in. */
  onLinkAccount?: () => void;
  /** 0197 — a sub-partner's own commission and rebate. */
  onEditTerms?: () => void;
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
  const canSuspendPartner = hasPermission(admin, 'ib.partners.suspend');
  const canEditPartner = hasPermission(admin, 'ib.partners.edit');
  // Only a sub-partner has terms of their own (0197).
  const isSubPartner =
    partner !== null &&
    partner.level >= 2 &&
    (partner.parent !== null || partner.parentOutsideTerritory);
  const canAssignTags = hasPermission(admin, 'clients.tag');
  // The KYC page opens with either key (its route requirement), so the item does.
  const canViewKyc = hasPermission(admin, 'kyc.view') || hasPermission(admin, 'kyc.review');
  const canViewCommissions =
    hasPermission(admin, 'ib.view') || hasPermission(admin, 'ib.commissions.view');
  const canViewAudit = hasPermission(admin, 'audit.view');

  /*
   * This chain ended in `''`, and the name goes into the SUSPEND and
   * REACTIVATE confirmations. For a client whose name and email a role masks,
   * the operator was asked to confirm a destructive action against nobody —
   * "Suspend ?" — with no way to tell which client they were acting on.
   * clientLabel falls through to the Portal ID, which no role can mask.
   */
  const name = clientLabel(profile);

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

    // ── Trading: attach an MT5 account the server already has (29 Sep 2026) ─
    ...(onLinkAccount && hasPermission(admin, 'trading.create')
      ? [
          {
            label: t('linkAccount.action'),
            icon: Link2,
            onSelect: onLinkAccount,
            separatorBefore: canEditClient || canChangeEmail || canSuspendClient || canAssignTags,
          },
        ]
      : []),

    // ── Compliance, as navigation rather than mutation ─────────────────────
    ...(canViewKyc
      ? [
          {
            label: t('clientProfile.actionOpenKyc'),
            icon: ShieldCheck,
            // By Portal ID, as every console URL — never the uuid.
            href: `/kyc/${profile.portalId}`,
            separatorBefore: canEditClient || canChangeEmail || canSuspendClient || canAssignTags,
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
    // 0197 — the owner asked for a sub-partner's commission here too (6 Oct 2026).
    ...(isSubPartner && canEditPartner && onEditTerms
      ? [
          {
            label: t('clientProfile.editTerms'),
            icon: SlidersHorizontal,
            separatorBefore: !(partner && canSuspendPartner),
            onSelect: onEditTerms,
          },
        ]
      : []),
    /*
     * NO "Change commission level" and NO "Reassign parent" here (owner, 26 Sep
     * 2026). Both re-price or re-place a partner; they are the Partners desk's
     * controls, and a profile opened to answer a question should not carry them.
     * Nor "View documents": the Overview tab lists them.
     */
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
  ];

  return (
    <RowActions
      items={items}
      busy={setStatus.isPending || setPartnerActive.isPending}
      label={t('clientProfile.actionsFor', { name })}
    />
  );
}
