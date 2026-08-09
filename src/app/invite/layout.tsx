/**
 * `/invite/accept` only — and it renders BARE, with no console chrome.
 *
 * The person following the link has no account yet, so a sidebar of screens
 * they cannot reach and an account menu with nobody in it would be furniture
 * around a form. `/invite/accept` is in `PUBLIC_PATHS` for the same reason.
 *
 * This layout used to branch: `/invite` was an admin page that needed
 * `AdminLayout`, and `/invite/accept` did not. Inviting is a modal on
 * `/admin-users` now, so the branch is gone and only the public half remains.
 */
export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
