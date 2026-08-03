'use client';

import { Pencil, ShieldCheck, Trash2 } from 'lucide-react';
import type { Role } from '@/lib/api/admin';

/**
 * One role with its granted actions. Edit/delete appear only for non-system
 * roles when the viewer holds roles.manage; the backend enforces the same
 * rules (plus a 409 when the role is still assigned).
 */
export function RoleCard({
  role,
  canManage,
  onEdit,
  onDelete,
  deleting,
}: {
  role: Role;
  canManage: boolean;
  onEdit: (role: Role) => void;
  onDelete: (role: Role) => void;
  deleting: boolean;
}) {
  const showActions = canManage && !role.isSystem;

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-foreground">{role.name}</h3>
            {role.isSystem && (
              <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-link border border-primary/20">
                System Role
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {role.description || 'No description provided'}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {showActions && (
            <>
              <button
                type="button"
                onClick={() => onEdit(role)}
                aria-label={`Edit role ${role.name}`}
                className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-outline"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onDelete(role)}
                disabled={deleting}
                aria-label={`Delete role ${role.name}`}
                className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50 disabled:cursor-not-allowed focus-outline"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
          <ShieldCheck className="h-5 w-5 text-link ml-1" />
        </div>
      </div>

      <div className="space-y-2 border-t border-border/60 pt-3">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          Assigned Permissions ({role.permissions.length})
        </span>
        <div className="flex flex-wrap gap-1.5">
          {role.permissions.map((p) => (
            <span
              key={p}
              className="rounded-md bg-muted px-2 py-1 text-[11px] font-mono text-foreground border border-border/80"
            >
              {p}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
