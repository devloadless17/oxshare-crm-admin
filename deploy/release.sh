#!/usr/bin/env bash
#
# Zero-downtime release of ONE frontend on the frontends server (blue-green).
# TWIN FILE: identical in oxshare-crm-admin and oxshare-crm-client (deploy/).
#
#   bash release.sh deploy <admin|portal> <image>   release a new version of one app
#   bash release.sh rollback <admin|portal>          back to that app's previous version
#   bash release.sh status
#
# Each app runs as two services (admin_blue / admin_green, portal_blue / portal_green).
# A release never stops the live version first: the new one starts BESIDE it, must pass
# its health check, Caddy is switched with a graceful reload, and only then is the old
# one stopped. A version that never becomes healthy is stopped and the live one carries
# on, so a broken release can never take a site down. The OTHER app is never touched.
#
# release.env (here) records each app's live colour and each colour's image; this script
# is its only writer. .env holds the domains (written by the deploy job).
set -euo pipefail
cd "$(dirname "$0")"

touch release.env
# shellcheck disable=SC1091
. ./release.env
COMPOSE=(docker compose --env-file .env --env-file release.env)

fail() { echo "::error::$*" >&2; exit 1; }
other() { if [ "$1" = blue ]; then echo green; else echo blue; fi; }
port_of() { if [ "$1" = admin ]; then echo 3002; else echo 3000; fi; }
key() { printf '%s_%s' "$(printf '%s' "$1" | tr '[:lower:]' '[:upper:]')" "$2"; }  # admin ACTIVE -> ADMIN_ACTIVE
get() { local k; k=$(key "$1" "$2"); printf '%s' "${!k:-}"; }
put() { printf -v "$(key "$1" "$2")" '%s' "$3"; }
save() {
  local n
  for n in ADMIN_ACTIVE ADMIN_BLUE ADMIN_GREEN PORTAL_ACTIVE PORTAL_BLUE PORTAL_GREEN; do
    printf '%s=%s\n' "$n" "${!n:-}"
  done > release.env.next
  mv -f release.env.next release.env
}

# Caddy imports active-<app>.caddy in place; a never-released app answers 503. The files
# must exist before Caddy ever starts: Docker would create a DIRECTORY for a missing
# bind-mount source. Written in place (`cat >`) because each is bind-mounted as a file.
for a in admin portal; do
  [ -s "active-$a.caddy" ] || printf '# Written by release.sh. Never edit by hand.\nrespond "Not released yet" 503\n' > "active-$a.caddy"
done

point_caddy_at() { # <app> <colour>
  cat > "active-$1.caddy" <<EOF
# Written by release.sh: the $1 version Caddy sends traffic to. Never edit by hand.
# A REFUSED connection never reached the app, so holding and retrying it is safe.
reverse_proxy $1_$2:$(port_of "$1") {
	lb_try_duration 10s
	lb_try_interval 250ms
}
EOF
  # Caddy's own parser, with the caddy service's mounts and env, BEFORE switching.
  "${COMPOSE[@]}" run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile </dev/null >/dev/null 2>release-caddy.err \
    || { cat release-caddy.err >&2; return 1; }
  rm -f release-caddy.err
  if [ "$(docker inspect -f '{{.State.Running}} {{.State.Restarting}}' oxshare_web_caddy 2>/dev/null)" = "true false" ]; then
    "${COMPOSE[@]}" exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile </dev/null
  else
    "${COMPOSE[@]}" up -d --force-recreate caddy </dev/null
  fi
}

wait_healthy() { # <container>
  local status=starting
  for _ in $(seq 1 40); do
    status=$(docker inspect --format='{{.State.Health.Status}}' "$1" 2>/dev/null || echo starting)
    [ "$status" = healthy ] && return 0
    sleep 3
  done
  echo "$1 did not become healthy (status=$status)" >&2
  return 1
}

PREV_IMAGE=""
forget_failed() { # <app> <colour>: a refused version is never kept as the rollback target
  [ -n "$PREV_IMAGE" ] || return 0
  put "$1" "$(printf '%s' "$2" | tr '[:lower:]' '[:upper:]')" "$PREV_IMAGE"
  save
}

promote() { # <app> <colour>
  local app="$1" next="$2" old colour_key
  old=$(get "$app" ACTIVE); old=${old:-none}
  colour_key=$(printf '%s' "$next" | tr '[:lower:]' '[:upper:]')
  echo "==> Starting ${app}_$next ($(get "$app" "$colour_key")) beside the live one ($old)"
  "${COMPOSE[@]}" up -d --no-deps "${app}_$next" </dev/null
  if ! wait_healthy "oxshare_${app}_$next"; then
    "${COMPOSE[@]}" logs --tail 60 "${app}_$next" </dev/null || true
    "${COMPOSE[@]}" stop "${app}_$next" </dev/null || true
    forget_failed "$app" "$next"
    fail "${app}_$next never became healthy. Nothing was switched: $old is still serving."
  fi
  echo "==> Switching Caddy to ${app}_$next"
  if ! point_caddy_at "$app" "$next"; then
    if [ "$old" != none ]; then point_caddy_at "$app" "$old" || true; fi
    "${COMPOSE[@]}" stop "${app}_$next" </dev/null || true
    forget_failed "$app" "$next"
    fail "Caddy refused the switch to ${app}_$next. Nothing was switched: $old is still serving."
  fi
  put "$app" ACTIVE "$next"
  save
  if [ "$old" != none ] && [ "$old" != "$next" ]; then
    echo "==> Draining ${app}_$old"
    "${COMPOSE[@]}" stop -t 20 "${app}_$old" </dev/null
  fi
  echo "==> ${app}_$next is live."
}

deploy() { # <app> <image>
  local app="$1" image="$2" active next
  active=$(get "$app" ACTIVE)
  if [ -z "$active" ] || [ "$active" = none ]; then next=blue; else next=$(other "$active"); fi
  PREV_IMAGE=$(get "$app" "$(printf '%s' "$next" | tr '[:lower:]' '[:upper:]')")
  put "$app" "$(printf '%s' "$next" | tr '[:lower:]' '[:upper:]')" "$image"
  save
  "${COMPOSE[@]}" pull "${app}_$next" </dev/null
  promote "$app" "$next"
  # SHA tags are never dangling: keep the images release.env names (live + rollback).
  docker images --format '{{.Repository}}:{{.Tag}}' "${image%:*}" \
    | grep -vxF -e "$(get "$app" BLUE)" -e "$(get "$app" GREEN)" \
    | grep -v ':latest$' | xargs -r docker rmi >/dev/null 2>&1 || true
}

rollback() { # <app>
  local app="$1" active prev
  active=$(get "$app" ACTIVE)
  [ -n "$active" ] && [ "$active" != none ] || fail "$app is not live; nothing to roll back from."
  prev=$(other "$active")
  [ -n "$(get "$app" "$(printf '%s' "$prev" | tr '[:lower:]' '[:upper:]')")" ] || fail "${app}_$prev was never released; there is no previous version."
  echo "==> Rolling $app back to ${app}_$prev"
  promote "$app" "$prev"
}

app_ok() { case "${1:-}" in admin | portal) ;; *) fail "app must be admin or portal" ;; esac; }
case "${1:-}" in
  deploy) app_ok "${2:-}"; [ -n "${3:-}" ] || fail "usage: release.sh deploy <admin|portal> <image>"; deploy "$2" "$3" ;;
  rollback) app_ok "${2:-}"; rollback "$2" ;;
  status)
    for a in admin portal; do
      echo "$a: live=$(get "$a" ACTIVE) blue=$(get "$a" BLUE) green=$(get "$a" GREEN)"
    done
    "${COMPOSE[@]}" ps </dev/null
    ;;
  *) fail "usage: release.sh deploy <admin|portal> <image> | rollback <admin|portal> | status" ;;
esac
