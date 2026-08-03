#!/usr/bin/env bash
#
# The single definition of "this file is acceptable".
#
# Called by three things, which must never disagree about the answer:
#   - .claude/hooks/post-edit.sh   (Claude Code PostToolUse, blocking)
#   - lint-staged                  (pre-commit)
#   - a human, by hand
#
# Rewrites the file in place (prettier --write, eslint --fix) and exits non-zero
# only for what a machine cannot fix on its own.
#
# TWIN FILE — an identical copy lives at the same path in the sibling repos.
# The only per-repo difference is the file extensions matched below.
set -uo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root" || exit 1

files=()
for f in "$@"; do
  case "$f" in
    *.ts | *.tsx | *.mts | *.cts) ;;
    *) continue ;;
  esac
  # Generated, vendored or build output is never our problem. types.gen.ts in
  # particular is rewritten wholesale by `npm run gen:api-types`, so any fix
  # applied here would be silently erased.
  case "$f" in
    */types.gen.ts | */database/migrations/* | */.next/* | */dist/* | */node_modules/* | */next-env.d.ts)
      continue
      ;;
  esac
  [ -f "$f" ] && files+=("$f")
done

[ "${#files[@]}" -eq 0 ] && exit 0

rc=0
# --no-install: never silently pull a package from the network mid-edit.
npx --no-install prettier --write --log-level warn -- "${files[@]}" || rc=1
# --fix first, so the caller is never handed a failure it could not have avoided.
# The exit status of this second pass is the report. eslint exits non-zero for
# errors only; the project-wide warning ceiling is enforced by `npm run lint`.
npx --no-install eslint --fix -- "${files[@]}" || rc=1

exit $rc
