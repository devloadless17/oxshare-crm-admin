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
# It FAILS when the contract cannot be found, and that is the whole point.
#
# This used to `exit 0` in that case, "because CI must never depend on a sibling
# checkout existing". CI never checked one out, so the check never once ran: it
# printed "skipping" and passed, on every push, while the comment beside it and
# the rule index both recorded contract drift as guarded. A safety net that is
# believed but absent is worse than a known gap, because nobody looks again.
#
# The cost of that was concrete. `POST /payments/withdrawals` declares
# `Idempotency-Key` required; the portal did not send it, so every client
# withdrawal answered 400. A check that actually compared the caller against the
# contract is exactly what turns that into a red build instead of a support
# ticket.
#
# `OXSHARE_CONTRACT` overrides the path, so CI can point at a checkout anywhere.
# `ALLOW_MISSING_CONTRACT=1` is the deliberate escape hatch for someone working
# on this repo alone — explicit, and impossible to reach by accident.
set -uo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
contract="${OXSHARE_CONTRACT:-$repo_root/../oxshare-crm-backend/openapi.json}"
generated="$repo_root/src/lib/api/types.gen.ts"

if [ ! -f "$contract" ]; then
  if [ "${ALLOW_MISSING_CONTRACT:-0}" = "1" ]; then
    echo "check-api-types: contract absent and ALLOW_MISSING_CONTRACT=1 — skipping, by request."
    exit 0
  fi
  echo "check-api-types: CANNOT VERIFY — no backend contract at $contract"
  echo
  echo "This is a failure, not a skip. Passing here would assert that the API"
  echo "contract matches when nothing compared them."
  echo
  echo "  * locally: check out oxshare-crm-backend beside this repo, or set"
  echo "    OXSHARE_CONTRACT=/path/to/openapi.json"
  echo "  * to run this repo's checks alone: ALLOW_MISSING_CONTRACT=1"
  exit 1
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
