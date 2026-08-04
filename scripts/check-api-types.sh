#!/usr/bin/env bash
#
# Fails if src/lib/api/types.gen.ts no longer matches the backend's contract.
#
# PLATFORM-CONVENTIONS R-1.3. This app's types are ALIASES of generated schemas,
# which makes a response-shape change a compile error — but only once the types
# are regenerated. Nothing checked that they had been: the build type-checks
# against the committed file, so a backend change with no regeneration left this
# pipeline green while the running system was broken.
#
# The backend now commits openapi.json. This regenerates from that file and
# diffs, so "did anyone remember" becomes a red build.
#
# Advisory when the sibling repo is absent, by the same rule check-twins.sh
# follows: CI must never depend on a sibling checkout existing.
set -uo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
contract="$repo_root/../oxshare-crm-backend/openapi.json"
generated="$repo_root/src/lib/api/types.gen.ts"

if [ ! -f "$contract" ]; then
  echo "check-api-types: oxshare-crm-backend/openapi.json is not checked out next to this repo — skipping."
  exit 0
fi

tmp="$(mktemp -t types.gen.XXXXXX.ts)"
trap 'rm -f "$tmp"' EXIT

npx --yes openapi-typescript "$contract" -o "$tmp" >/dev/null 2>&1 || {
  echo "check-api-types: could not generate types from $contract"
  exit 1
}

if diff -q "$generated" "$tmp" >/dev/null; then
  echo "check-api-types: types.gen.ts matches the backend contract."
  exit 0
fi

echo "check-api-types: types.gen.ts is OUT OF DATE against the backend contract."
echo
diff "$generated" "$tmp" | head -40
echo
echo "Regenerate and commit:"
echo "  npm run gen:api-types:contract"
exit 1
