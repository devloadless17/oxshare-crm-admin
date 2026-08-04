#!/usr/bin/env bash
#
# Compares the "twin" files against the sibling app.
#
# Twin files are deliberate copies at identical paths in oxshare-crm-admin and
# oxshare-crm-client. There is no shared package: the real duplication is ~150
# near-static lines, against which a fourth repo, a registry decision, versioning
# discipline and an npm-link dev loop is a bad trade (and react-query already
# drifts between the two, so lockstep upgrades would bite immediately).
#
# What is compared is CODE, not prose: comments legitimately differ (each points
# at the other repo, and each explains that repo's history). A difference in a
# code line means the copies have actually diverged.
#
# Advisory by design — exits 0 with a warning if the sibling is missing, and is
# never wired into CI, because CI must not depend on a sibling checkout existing.
set -uo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
this_repo="$(basename "$repo_root")"
case "$this_repo" in
  oxshare-crm-admin) sibling_name=oxshare-crm-client ;;
  oxshare-crm-client) sibling_name=oxshare-crm-admin ;;
  *) echo "check-twins: no twin defined for $this_repo"; exit 0 ;;
esac
sibling="$repo_root/../$sibling_name"

if [ ! -d "$sibling" ]; then
  echo "check-twins: $sibling_name is not checked out next to this repo — skipping."
  exit 0
fi

# NOT a twin, deliberately: src/components/async-boundary.tsx.
# Same props and same four branches, but the admin app renders its own
# components/ui/loader for the loading state while the portal uses lucide's
# Loader2. Porting that component across would restyle the customer-facing portal,
# which is a product decision, not a consistency cleanup. Keep the PROPS and the
# branch behaviour in step by hand.
#
# NOT a twin, deliberately: src/lib/api/client.ts.
# Its structure is parallel and its config block is delimited the same way, but two
# differences are irreducible rather than configurable — the exported names
# (clearAdminSession/refreshAdminToken vs clearSession/refreshPortalToken, used
# across both apps) and the token casing (the admin API answers accessToken, the
# portal answers access_token — a frozen backend divergence). Listing it here
# would make this check assert something untrue, so it is reviewed by hand.
TWINS=(
  src/lib/api/errors.ts
  src/lib/api/errors.test.ts
  src/hooks/use-resource.ts
  src/components/query-provider.tsx
  src/components/backend-pending.tsx
  src/components/theme-provider.tsx
  src/components/theme-toggle.tsx
  src/lib/utils.ts
  src/lib/money.ts
  src/lib/i18n/index.ts
  src/lib/i18n/locale-storage.ts
  src/components/locale-direction.tsx
  src/lib/money.test.ts
  src/components/ui/button.tsx
  src/components/ui/input.tsx
  src/components/ui/label.tsx
  src/components/ui/select.tsx
)

# Strip line comments, block-comment bodies and blank lines. Crude but adequate:
# these files contain no string literal that looks like a comment.
# Normalise a file for comparison:
#   1. drop the delimited twin:config block — that block is where every legitimate
#      per-app value lives, and comparing it would report intended differences,
#   2. drop comments, which legitimately differ (each copy explains its own app),
#   3. drop blank lines.
# What survives is the code that MUST be identical.
strip() {
  sed -e '/twin:config:start/,/twin:config:end/d' "$1" \
    | sed -e 's://.*::' -e 's:/\*.*\*/::' \
    | sed -e '/^[[:space:]]*\*/d' -e '/^[[:space:]]*\/\*/d' \
    | sed -e '/^[[:space:]]*$/d'
}

drift=0
for rel in "${TWINS[@]}"; do
  mine="$repo_root/$rel"
  theirs="$sibling/$rel"
  [ -f "$mine" ] || continue
  if [ ! -f "$theirs" ]; then
    printf '  %-46s only here (not in %s)\n' "$rel" "$sibling_name"
    continue
  fi
  if ! diff -q <(strip "$mine") <(strip "$theirs") >/dev/null; then
    drift=$((drift + 1))
    printf '  %-46s CODE DIFFERS\n' "$rel"
    diff <(strip "$mine") <(strip "$theirs") | sed 's/^/      /' | head -12
  fi
done

if [ "$drift" -eq 0 ]; then
  echo "check-twins: all ${#TWINS[@]} twin files match $sibling_name on code."
  exit 0
fi

echo
echo "check-twins: $drift twin file(s) have diverged in code."
echo "Either port the change to both, or move the app-specific value into the"
echo "config block at the top of the file."
exit 1
