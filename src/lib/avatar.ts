import { initialsOf } from '@/components/ui/avatar';

/**
 * The browser URL for a stored avatar path — the avatar counterpart of
 * `kyc-doc-url.ts`, and it exists for the same reason.
 *
 * The API returns `/uploads/admin-avatars/<uuid>.png`: a path on the API's own
 * origin, which the console reaches through the `/api` rewrite. Rendering the
 * value verbatim asks the Next server for a file it does not have and gets a
 * 404 — which `AvatarImage` handles gracefully, so the symptom is not a broken
 * image but a photo that silently never appears. That is much harder to notice
 * than a failure, which is why this is a function rather than a template
 * literal at the call site.
 *
 * Returns `undefined` rather than `''` for "no photo": `AvatarImage` treats a
 * falsy `src` as "render the fallback", and an empty-string `src` on a bare
 * `<img>` re-requests the current page in some browsers.
 */
export function avatarSrc(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  // Already absolute (a future signed object-storage URL) — leave it alone.
  if (/^https?:\/\//i.test(path)) return path;
  const rel = path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
  return `/api/${rel}`;
}

/**
 * Initials for an admin, whose name is ONE field.
 *
 * `initialsOf` takes first and last separately, because the portal's `User` has
 * them separately. Splitting on whitespace here gives "Ada Lovelace" → AL and a
 * single-word name → its first letter, and keeps the "what does an empty name
 * show" answer in one place rather than re-derived at each avatar.
 */
export function initialsFor(name: string | null | undefined): string {
  const [first, ...rest] = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return initialsOf(first, rest.at(-1));
}
