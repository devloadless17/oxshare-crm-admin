'use client';

import Link from 'next/link';
import { Loader2, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import type { Role } from '@/lib/api/admin';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { t } from '@/lib/i18n';

/**
 * One role, as a row in the single roles list.
 *
 * Replaces `role-card.tsx`, which rendered each role as a tile in a two-column
 * grid and printed EVERY granted permission as a chip. With a `*` role that is
 * a wall of eighty chips, and the tile heights went ragged as roles differed —
 * so the list stopped being scannable at exactly the size where scanning
 * matters. The count says the same thing in one number, and the detail lives on
 * the edit page, which is now a real page rather than a modal.
 *
 * ── The three-dot menu ────────────────────────────────────────────────────
 *
 * Edit and Delete moved behind one trigger. Two always-visible icon buttons per
 * row put Delete permanently one mis-click from Edit, repeated down the list;
 * a menu makes destroying a role take two deliberate actions before the
 * confirmation even opens.
 *
 * `onDelete` opens an AlertDialog owned by the PAGE, not by this row. A dialog
 * rendered per row would mount one copy per role and, more practically, unmount
 * mid-transition when the list refetches after a successful delete.
 *
 * ── System roles ──────────────────────────────────────────────────────────
 *
 * No menu at all rather than a disabled one. A system role cannot be edited or
 * deleted by anyone — the backend refuses both — so offering a control that
 * only ever explains itself is worse than the absence of one.
 */
export function RoleRow({
  role,
  canManage,
  onDelete,
  deleting,
}: {
  role: Role;
  canManage: boolean;
  onDelete: (role: Role) => void;
  deleting: boolean;
}) {
  const showActions = canManage && !role.isSystem;

  return (
    <div className="flex items-start justify-between gap-4 px-5 py-4">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-bold text-foreground">{role.name}</h3>
          {role.isSystem && (
            <span className="shrink-0 rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-link">
              {t('settings.systemRole')}
            </span>
          )}
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          {role.description || t('roles.noDescription')}
        </p>

        <p className="text-[11px] font-medium text-muted-foreground/80">
          {t('settings.assignedPermissions', { count: role.permissions.length })}
        </p>
      </div>

      {showActions && (
        <div className="shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={deleting}
                aria-label={t('roles.rowActions', { name: role.name })}
              >
                {deleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                )}
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem asChild>
                <Link href={`/roles/${role.id}/edit`}>
                  <Pencil />
                  <span>{t('common.edit')}</span>
                </Link>
              </DropdownMenuItem>

              <DropdownMenuItem
                onSelect={() => onDelete(role)}
                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
              >
                <Trash2 />
                <span>{t('common.delete')}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
