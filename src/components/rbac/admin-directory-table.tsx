'use client';

import { Key } from 'lucide-react';
import type { AdminUser, Role } from '@/lib/api/admin';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { t } from '@/lib/i18n';

export interface DirectoryCapabilities {
  canEdit: boolean;
  canSuspend: boolean;
  /**
   * D-44. Gated on the same grant the API requires, and NOT on `isMasterRow`
   * the way edit and suspend are: masters are peers for reset specifically, so
   * hiding the control on a master row would hide the one case the feature
   * exists for — a locked-out master with no path back except the database.
   */
  canResetPassword: boolean;
}

/**
 * The administrator directory.
 *
 * THE BADGE IS READ, NOT ASSUMED. This table used to render a hardcoded
 * "Active" pill on every row, because `AdminProfileDto` carried no status field
 * — so a suspended administrator displayed as active on the one screen an
 * operator checks before trusting an account. Suspension was enforced the whole
 * time; only the screen was wrong, which is the worse half.
 *
 * Every control here is hidden in exactly the cases the API refuses: the signed-
 * in admin, and any master admin. Offering a button that always 403s teaches
 * operators that errors are normal.
 */
export function AdminDirectoryTable({
  admins,
  roles,
  currentAdminId,
  can,
  assigningId,
  suspendingId,
  onAssignRole,
  onEdit,
  onResetPassword,
  onToggleStatus,
}: {
  admins: AdminUser[];
  roles: Role[];
  currentAdminId: string | undefined;
  can: DirectoryCapabilities;
  assigningId: string | null | undefined;
  suspendingId: string | null | undefined;
  onAssignRole: (user: AdminUser, roleId: string) => void;
  onEdit: (user: AdminUser) => void;
  onResetPassword: (user: AdminUser) => void;
  onToggleStatus: (user: AdminUser) => void;
}) {
  const showActions = can.canEdit || can.canSuspend || can.canResetPassword;

  return (
    <div className="rounded-xl border border-border bg-card shadow-xs overflow-x-auto">
      <table className="w-full text-xs text-left">
        <thead className="border-b border-border bg-muted/40 font-semibold text-muted-foreground uppercase tracking-wider">
          <tr>
            <th className="px-6 py-3">{t('settings.colAdministrator')}</th>
            <th className="px-6 py-3">{t('settings.colEmail')}</th>
            <th className="px-6 py-3">{t('settings.colRole')}</th>
            <th className="px-6 py-3">{t('settings.colStatus')}</th>
            <th className="px-6 py-3">{t('adminUsers.colScope')}</th>
            {showActions && <th className="px-6 py-3">{t('adminUsers.colActions')}</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {admins.map((user) => {
            const isMasterRow = user.role === 'master_admin';
            const isSelf = user.id === currentAdminId;
            // The API refuses self-changes and master changes; don't offer them.
            const reassignable = can.canEdit && !isMasterRow && !isSelf;
            const suspendable = can.canSuspend && !isMasterRow && !isSelf;
            const suspended = user.status === 'suspended';

            return (
              <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-6 py-4 font-semibold text-foreground">
                  {user.name}
                  {isSelf && (
                    <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                      {t('settings.you')}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 font-mono text-muted-foreground">{user.email}</td>
                <td className="px-6 py-4">
                  {reassignable ? (
                    <Select
                      value={user.roleId ?? ''}
                      onValueChange={(val) => onAssignRole(user, val)}
                      disabled={assigningId === user.id}
                    >
                      <SelectTrigger className="h-8 text-[11px] font-semibold w-40">
                        <SelectValue
                          placeholder={user.roleId ? 'Change role…' : 'Custom permissions'}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {roles
                          .filter((r) => !r.isSystem)
                          .map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-[11px] font-semibold text-link border border-primary/20">
                      <Key className="h-3 w-3" />
                      {roles.find((r) => r.id === user.roleId)?.name || user.role}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      suspended
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-success/10 text-success'
                    }`}
                  >
                    {suspended ? t('adminUsers.statusSuspended') : t('clients.statusActive')}
                  </span>
                </td>
                {/*
                 * RBAC-03's state, ON THE ROW.
                 *
                 * The same reasoning as the status pill above, which used to be
                 * hardcoded "Active" and so showed a suspended administrator as
                 * active on the one screen an operator checks before trusting an
                 * account. An override that can only be seen by opening a modal
                 * is invisible drift: if eight of twenty agents have one, the
                 * role tells you nothing and nobody would know.
                 */}
                <td className="px-6 py-4 text-muted-foreground">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px]">
                      {isMasterRow || user.scopedTags.length === 0
                        ? t('adminUsers.scopeAll')
                        : t('adminUsers.scopeCount', { count: user.scopedTags.length })}
                    </span>
                    {user.maskedFields.length > 0 && (
                      <span className="text-[10px]">
                        {t('adminUsers.maskCount', { count: user.maskedFields.length })}
                      </span>
                    )}
                  </div>
                </td>
                {showActions && (
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {can.canEdit && !isMasterRow && !isSelf && (
                        <button
                          type="button"
                          onClick={() => onEdit(user)}
                          className="h-8 px-3 rounded-lg border border-input text-[11px] font-semibold hover:bg-muted cursor-pointer focus-outline"
                        >
                          {t('adminUsers.edit')}
                        </button>
                      )}
                      {can.canResetPassword && !isSelf && (
                        <button
                          type="button"
                          onClick={() => onResetPassword(user)}
                          className="h-8 px-3 rounded-lg border border-input text-[11px] font-semibold hover:bg-muted cursor-pointer focus-outline"
                        >
                          {t('adminUsers.sendResetLink')}
                        </button>
                      )}
                      {suspendable && (
                        <button
                          type="button"
                          onClick={() => onToggleStatus(user)}
                          disabled={suspendingId === user.id}
                          className={`h-8 px-3 rounded-lg border text-[11px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer focus-outline ${
                            suspended
                              ? 'border-success/30 text-success hover:bg-success/10'
                              : 'border-destructive/30 text-destructive hover:bg-destructive/10'
                          }`}
                        >
                          {suspended ? t('adminUsers.reactivate') : t('adminUsers.suspend')}
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
