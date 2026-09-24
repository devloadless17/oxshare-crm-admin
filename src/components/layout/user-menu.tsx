'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronsUpDown, LogOut, UserCircle } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAdmin } from '@/context/AdminAuthContext';
import { avatarSrc, initialsFor } from '@/lib/avatar';
import { t } from '@/lib/i18n';
import { toastError } from '@/lib/toast';

/**
 * The account menu, top-right in the header — the portal's `UserMenu`, on the
 * admin's identity. It began at the foot of the sidebar; the product owner
 * moved both apps' menus to the header's right edge.
 *
 * Replaces a block that showed the admin's name, e-mail, a green "online" dot
 * and a bare log-out icon, all at once and all always visible. The same three
 * problems the portal wrote up applied here verbatim:
 *
 *  1. The dot claimed a fact nothing measured. There is no presence system in
 *     this product — it was `bg-success` unconditionally, so it meant "an admin
 *     is logged in", which the surrounding panel already said.
 *  2. Log-out sat one mis-click away from the navigation, permanently, with no
 *     confirmation. On a console that approves withdrawals, that is the wrong
 *     thing to make effortless.
 *  3. There was nowhere to put anything else. Theme lived in a separate
 *     two-button toggle in the HEADER, which had no room for a third option and
 *     put a personal preference in the same strip as system status.
 *
 * ── Where it differs from the portal's copy, and why ───────────────────────
 *
 * Not a twin file: it reads `useAdmin()` rather than `useUser()`.
 *
 * It used to differ in two more ways, and both were statements about what the
 * console did not have yet rather than decisions. There was no Profile item
 * because there was no `/profile` route, and no `AvatarImage` because `Admin`
 * carried no avatar field. Both now exist — `/profile` and `avatarUrl` on
 * `GET /admin/auth/me` — so both are here.
 *
 * The Profile link carries NO permission check, and that is deliberate rather
 * than an oversight in a sidebar whose every other item is filtered: the route
 * is `requirement: null` and each endpoint behind it is `@AnyAdmin`, because
 * everything on it belongs to the caller. Wrapping it in `PermittedLink` would
 * imply somebody could be denied their own password.
 */
export function UserMenu({
  collapsed,
  variant = 'sidebar',
}: {
  collapsed: boolean;
  /**
   * `header` is the top-right placement, at every breakpoint: the AVATAR ALONE
   * as the trigger, at every width. It was a pill — avatar, name, chevron —
   * from `md` up; the name and chevron are gone, and the header keeps its width
   * beside the hamburger and the search control at every size.
   *
   * The MENU repeats the identity and the role inside, which is what makes an
   * avatar-only trigger safe on a shared back-office machine — and what the
   * `aria-label` on the trigger stands in for, now that no visible text does.
   */
  variant?: 'sidebar' | 'header';
}) {
  const { admin, logout } = useAdmin();
  const [logoutError, setLogoutError] = React.useState<string | null>(null);
  /*
   * Controlled, because a FAILED sign-out must keep the menu open: the error
   * line renders inside it, and Radix's default is to close on item select —
   * which would flash the message for one frame and leave a signed-in console
   * that looks like nothing happened.
   */
  const [open, setOpen] = React.useState(false);

  const name = admin?.name?.trim() ?? '';
  /*
   * `initialsFor` lives in `lib/avatar.ts` now rather than being derived here.
   * The profile screen renders the same face at a different size, and two
   * copies of "split the one `name` field into initials" would be two answers
   * to what an operator with a single-word name looks like.
   */
  const initials = initialsFor(name);
  const photo = avatarSrc(admin?.avatarUrl);

  /*
   * The role's name, or a stated absence — never a fallback to the email.
   *
   * `roleName` is undefined for an administrator on no role, which is a real
   * state: access can also live as a per-admin permission snapshot, and the
   * seeded account was in exactly that position until backend 0045 put it on
   * the Administrator role. Showing the email there would quietly restore the
   * line this replaced; saying "no role" is the honest answer and is also a
   * prompt to fix it.
   */
  const roleLabel = admin?.roleName ?? t('nav.noRole');

  /**
   * Log out, with the failure made visible instead of swallowed.
   *
   * `authApi.logout` retries once and then throws, and it throws for a reason
   * worth showing: only the server can end this session — it revokes the
   * refresh-token family and clears the httpOnly cookies — so a failed call
   * leaves the admin fully signed in. Navigating to /login anyway would show a
   * sign-in screen over a live session on a machine the admin is about to walk
   * away from.
   */
  const handleLogout = async () => {
    setLogoutError(null);
    try {
      await logout();
      setOpen(false);
    } catch (error) {
      /*
       * Surfaced TWICE on purpose: as a line INSIDE the still-open menu (the
       * reader's eyes are already there — the item they just pressed did not
       * work) and as a toast, which survives even if they click away before
       * reading. Never navigate here: only the server can end this session,
       * so a failed call leaves the admin fully signed in, and a sign-in
       * screen over a live session is the one outcome this whole path exists
       * to prevent (see api/auth.ts).
       */
      toastError(error, t('session.logoutFailed'));
      setLogoutError(t('session.logoutFailed'));
    }
  };

  const compact = variant === 'header' || collapsed;

  return (
    <div className={variant === 'header' ? '' : 'border-t border-border p-3'}>
      <DropdownMenu
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          // A failure message from a PREVIOUS attempt must not greet the next
          // open as if it just happened — it describes a moment, not a state.
          if (!next) setLogoutError(null);
        }}
      >
        <DropdownMenuTrigger
          className={`flex items-center text-left transition-colors focus-outline cursor-pointer ${
            variant === 'header'
              ? 'h-9 w-9 shrink-0 items-center justify-center rounded-full p-1 hover:bg-muted data-[state=open]:bg-muted'
              : `w-full gap-3 rounded-lg bg-muted p-2.5 hover:bg-accent ${collapsed ? 'justify-center p-2' : ''}`
          }`}
          aria-label={t('nav.accountMenu')}
        >
          <Avatar className={variant === 'header' ? 'h-7 w-7' : undefined}>
            <AvatarImage src={photo} alt="" />
            <AvatarFallback className={variant === 'header' ? 'text-[11px]' : undefined}>
              {initials}
            </AvatarFallback>
          </Avatar>

          {/*
            THE AVATAR ALONE, at every width.

            The header trigger was a pill — avatar, name, chevron — from `md`
            up, collapsing to the avatar below it. It is now the avatar
            everywhere, on the owner's call.

            Nothing is lost by it: the name and the role are the first thing
            inside the menu, so the identity this was asserting is one click
            away rather than permanently occupying header width beside the
            search box. `aria-label` on the trigger carries the accessible name
            the visible text used to provide, so a screen reader still
            announces an account menu rather than an unlabelled button.
          */}
          {!compact && (
            <>
              <span className="flex-1 overflow-hidden">
                <span className="block truncate text-xs font-semibold text-foreground">
                  {name || t('nav.accountMenu')}
                </span>
                {/*
                  The ROLE, not the email address.
                  
                  Both lines used to be identity — a name and the address it
                  belongs to — which answers "who am I signed in as" twice and
                  "what can I do here" never. In a console where every screen is
                  permission-gated, the second question is the one an operator
                  actually has, and the role is the answer to it: the name above
                  already identifies the account.
                */}
                <span className="block truncate text-[11px] text-muted-foreground">
                  {roleLabel}
                </span>
              </span>
              <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </>
          )}
        </DropdownMenuTrigger>

        {/* In the header the menu drops DOWN from the top-right, anchored to
            the trigger's end edge. The sidebar variant still opens upwards —
            its trigger sat at the very bottom of a full-height rail. */}
        <DropdownMenuContent
          side={variant === 'header' ? 'bottom' : 'top'}
          align={variant === 'header' ? 'end' : 'start'}
          className="w-60"
          sideOffset={8}
        >
          {/* The identity repeats inside the menu deliberately. On a collapsed
              sidebar the trigger is an avatar and nothing else, so this is the
              only place the operator can confirm WHICH account they are about
              to sign out of — which matters on a shared back-office machine. */}
          <div className="flex items-center gap-2.5 px-2 py-2">
            <Avatar className="h-8 w-8">
              <AvatarImage src={photo} alt="" />
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <div className="overflow-hidden">
              <p className="truncate text-xs font-semibold text-foreground">{name}</p>
              <p className="truncate text-[11px] text-muted-foreground">{roleLabel}</p>
            </div>
          </div>

          <DropdownMenuSeparator />

          {/*
            `asChild` so the item IS the anchor rather than wrapping one. A
            `<div>` with an onClick that pushes would lose middle-click, ⌘-click
            and "copy link address" — and this is the one menu entry an operator
            might reasonably want to open in a second tab beside the screen they
            are working on.
          */}
          <DropdownMenuItem asChild>
            <Link href="/profile">
              <UserCircle />
              <span>{t('nav.profile')}</span>
            </Link>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onSelect={(event) => {
              // Keep the menu mounted while the request runs: on success the
              // navigation unmounts everything anyway, and on failure the
              // error line below needs somewhere to appear.
              event.preventDefault();
              void handleLogout();
            }}
            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
          >
            <LogOut />
            <span>{t('nav.logout')}</span>
          </DropdownMenuItem>

          {logoutError && (
            <p
              role="alert"
              className="mx-1 mb-1 mt-1.5 rounded-md bg-destructive/10 px-2.5 py-2 text-[11px] leading-snug text-destructive"
            >
              {logoutError}
            </p>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
