#!/usr/bin/env bash
# Fauward production control. Runs ON the Oracle VM, installed at /data/fauward-prod/bin/prodctl.sh
# by scripts/prod-vm.sh (init and every deploy). See docs/deploy-oracle-prod.md.
#
#   prodctl.sh up <release>          build + start a release uploaded to releases/<release>, roll back if unhealthy
#   prodctl.sh stage <release>       build a release without starting it, so its migrations can run first
#   prodctl.sh rollback              start the previous release again (images are kept, nothing is rebuilt)
#   prodctl.sh status | check-env
#   prodctl.sh logs [service...]     last 200 lines (LOG_LINES=n to change, FOLLOW=1 to follow)
#   prodctl.sh restart [service...]
#   prodctl.sh migrate-status
#   prodctl.sh migrate --yes         prisma migrate deploy against the production database
#   prodctl.sh migrate-resolve --applied <migration> --yes   baseline: mark a migration applied without running it
#   prodctl.sh backfill <id> --dry-run | --yes [--clear-legacy]   one-off data backfill (apps/backend/src/scripts/backfills)
#   prodctl.sh backup                pg_dump of the production database into backups/ (keeps 14)
#   prodctl.sh install-cron          daily backup at 03:30 UTC
# migrate-status, migrate, migrate-resolve and backfill run in the staged release if there is one, else the live one.
set -euo pipefail

ROOT=${FAUWARD_PROD_ROOT:-/data/fauward-prod}
ENV_DIR=$ROOT/env
PROJECT=${FAUWARD_PROD_PROJECT:-fauward-prod}
KEEP_RELEASES=3
KEEP_BACKUPS=14
export FAUWARD_PROD_ENV_DIR=$ENV_DIR

die() { echo "prodctl: $*" >&2; exit 1; }
current() { cat "$ROOT/CURRENT" 2>/dev/null || true; }
previous() { cat "$ROOT/PREVIOUS" 2>/dev/null || true; }
staged() { cat "$ROOT/STAGED" 2>/dev/null || true; }

dc() { # dc <release> <compose args...>
  local rel=$1; shift
  [ -f "$ROOT/releases/$rel/deploy/oracle-prod/docker-compose.yml" ] || die "release $rel is not on the VM"
  RELEASE=$rel \
  RELEASE_REF=$(cat "$ROOT/releases/$rel/.ref" 2>/dev/null || true) \
  RELEASE_TIME=$(cat "$ROOT/releases/$rel/.time" 2>/dev/null || true) \
    docker compose -p "$PROJECT" --env-file "$ENV_DIR/compose.env" \
      -f "$ROOT/releases/$rel/deploy/oracle-prod/docker-compose.yml" "$@"
}

need_current() { local c; c=$(current); [ -n "$c" ] || die "nothing deployed yet"; echo "$c"; }

# Release whose image runs the database tools: the staged one (its migrations are not live yet), else the live one.
tool_release() {
  local r; r=$(staged); [ -n "$r" ] || r=$(current)
  [ -n "$r" ] || die "nothing staged or deployed yet: run prod-vm.sh stage first"
  echo "$r"
}

# Value of KEY in an env file, with quotes and inline " # comments" removed (as docker compose reads it).
env_value() {
  local line
  [ -f "$1" ] || return 0
  line=$(grep -E "^[[:space:]]*$2=" "$1" | tail -n 1) || return 0
  line=${line#*=}
  case $line in
    \"*) line=${line#\"}; line=${line%%\"*} ;;
    \'*) line=${line#\'}; line=${line%%\'*} ;;
    *) line=${line%% #*}; line="${line%"${line##*[![:space:]]}"}" ;;
  esac
  printf '%s' "$line"
}

cmd_check_env() {
  local missing=() f k v
  for f in backend.env python.env cloudflared.env compose.env; do
    [ -f "$ENV_DIR/$f" ] || missing+=("$f (file missing)")
  done
  check() { f=$1; shift; for k in "$@"; do v=$(env_value "$ENV_DIR/$f" "$k"); [ -n "$v" ] || missing+=("$f: $k"); done; }
  check backend.env DATABASE_URL SUPABASE_DB_URL JWT_ACCESS_SECRET JWT_REFRESH_SECRET \
    PLATFORM_SESSION_SECRET PLATFORM_REFRESH_SECRET PLATFORM_COOKIE_DOMAIN VERCEL_API_TOKEN VERCEL_PORTAL_PROJECT_ID \
    FIELD_ENCRYPTION_KEYS FIELD_ENCRYPTION_ACTIVE_KEY_ID
  check python.env DATABASE_URL
  check cloudflared.env TUNNEL_TOKEN
  check compose.env REDIS_PASSWORD
  for f in "$ENV_DIR"/*.env; do
    [ -f "$f" ] && [ "$(stat -c %a "$f")" != 600 ] && chmod 600 "$f"
  done
  if [ ${#missing[@]} -gt 0 ]; then
    printf 'Missing values in %s:\n' "$ENV_DIR" >&2
    printf '  - %s\n' "${missing[@]}" >&2
    return 1
  fi
  echo "env OK"
}

backend_health() {
  local id
  id=$(dc "$1" ps -q backend 2>/dev/null || true)
  [ -n "$id" ] || { echo missing; return; }
  docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || echo missing
}

wait_healthy() { # up to 4 minutes
  local i s
  for i in $(seq 1 48); do
    s=$(backend_health "$1")
    [ "$s" = healthy ] && return 0
    [ "$s" = unhealthy ] && return 1
    sleep 5
  done
  return 1
}

prune_releases() {
  local keep rel tag
  keep=$( { ls -1t "$ROOT/releases" | grep -vE '\.tmp$' | head -n "$KEEP_RELEASES"; current; previous; staged; } | sort -u)
  for rel in $(ls -1 "$ROOT/releases" | grep -vE '\.tmp$'); do
    echo "$keep" | grep -qx "$rel" && continue
    for tag in backend python-services route-optimizer; do
      docker image rm "fauward-prod/$tag:$rel" >/dev/null 2>&1 || true
    done
    rm -rf "${ROOT:?}/releases/$rel"
    echo "pruned release $rel"
  done
}

build_release() {
  local rel=$1 avail
  cmd_check_env
  avail=$(df -BG --output=avail /data | tail -n 1 | tr -dc 0-9)
  [ "${avail:-0}" -ge 6 ] || die "/data has only ${avail}G free (need 6G to build)"
  echo "building release $rel"
  dc "$rel" build
}

cmd_stage() {
  local rel=${1:-}
  [ -n "$rel" ] || die "usage: stage <release>"
  build_release "$rel"
  echo "$rel" > "$ROOT/STAGED"
  echo "release $rel is built but not started; migrate-status, migrate and backfill now run in it"
}

cmd_up() {
  local rel=${1:-} prev
  [ -n "$rel" ] || die "usage: up <release>"
  prev=$(current)
  build_release "$rel"
  echo "starting release $rel"
  dc "$rel" up -d --remove-orphans
  if wait_healthy "$rel"; then
    if [ -n "$prev" ] && [ "$prev" != "$rel" ]; then echo "$prev" > "$ROOT/PREVIOUS"; fi
    echo "$rel" > "$ROOT/CURRENT"
    rm -f "$ROOT/STAGED"   # the database tools follow the live release again
    prune_releases
    echo "release $rel is live (backend healthy)"
  else
    echo "backend did not become healthy; last log lines:" >&2
    dc "$rel" logs --tail 80 backend >&2 || true
    if [ -n "$prev" ] && [ "$prev" != "$rel" ]; then
      echo "rolling back to $prev" >&2
      dc "$prev" up -d --no-build --remove-orphans
    fi
    exit 1
  fi
}

cmd_rollback() {
  local cur prev
  cur=$(need_current); prev=$(previous)
  [ -n "$prev" ] || die "no previous release recorded"
  echo "rolling back $cur -> $prev"
  dc "$prev" up -d --no-build --remove-orphans
  wait_healthy "$prev" || die "previous release $prev is not healthy either; check: prodctl.sh logs backend"
  echo "$cur" > "$ROOT/PREVIOUS"
  echo "$prev" > "$ROOT/CURRENT"
  echo "release $prev is live"
}

cmd_status() {
  local cur
  cur=$(current)
  echo "current:  ${cur:-none} $( [ -n "$cur" ] && cat "$ROOT/releases/$cur/.ref" 2>/dev/null)"
  echo "previous: $(previous)"
  [ -n "$cur" ] || return 0
  dc "$cur" ps --format 'table {{.Service}}\t{{.Status}}'
  echo "backend: $(backend_health "$cur")"
  echo "/data free: $(df -h --output=avail /data | tail -n 1 | tr -d ' ')   memory available: $(awk '/MemAvailable/ {printf "%d MB", $2/1024}' /proc/meminfo)"
}

cmd_backup() {
  local url out tmp
  url=$(env_value "$ENV_DIR/backend.env" DIRECT_URL)
  [ -n "$url" ] || url=$(env_value "$ENV_DIR/backend.env" SUPABASE_DIRECT_URL)
  [ -n "$url" ] || die "set DIRECT_URL in backend.env"
  url=${url%%\?*}   # drop Prisma-only query parameters (pgbouncer, connection_limit, ...)
  mkdir -p "$ROOT/backups"
  out="$ROOT/backups/fauward-$(date -u +%Y%m%dT%H%M%SZ).dump"
  tmp=$(mktemp); chmod 600 "$tmp"
  printf 'PGURL=%s?sslmode=require\n' "$url" > "$tmp"
  if docker run --rm --env-file "$tmp" postgres:17-alpine \
      sh -c 'pg_dump --no-owner --no-privileges --format=custom "$PGURL"' > "$out.part"; then
    mv "$out.part" "$out"; rm -f "$tmp"
  else
    rm -f "$tmp" "$out.part"; die "pg_dump failed"
  fi
  chmod 600 "$out"
  ls -1t "$ROOT"/backups/fauward-*.dump | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm -f
  echo "backup: $out ($(du -h "$out" | cut -f1))"
}

cmd_backfill() { # backfill <id> --dry-run | --yes [--clear-legacy]
  local id=${1:-} rel script f a dry=0 yes=0 args=()
  [[ $id =~ ^[0-9]{4}[a-z]?$ ]] || die "usage: backfill <id, e.g. 0037> --dry-run | --yes [--clear-legacy]"
  shift
  for a in "$@"; do
    case $a in
      --dry-run) dry=1; args+=("$a") ;;
      --clear-legacy) args+=("$a") ;;
      --yes) yes=1 ;;
      *) die "unknown backfill flag $a" ;;
    esac
  done
  [ "$dry" = 1 ] || [ "$yes" = 1 ] || die "backfill $id writes to the PRODUCTION database: run it with --dry-run first, then --yes"
  rel=$(tool_release)
  script=
  for f in "$ROOT/releases/$rel/apps/backend/src/scripts/backfills/$id"-*.ts; do
    [ -f "$f" ] && script=src/scripts/backfills/${f##*/}
  done
  [ -n "$script" ] || die "release $rel has no backfill $id (see apps/backend/src/scripts/backfills/)"
  echo "running $script${args[*]:+ ${args[*]}} in release $rel"
  # With deps: some backfills load services that connect to Redis, so compose starts it first.
  dc "$rel" run --rm backend npx tsx "$script" ${args[@]+"${args[@]}"}
}

cmd_install_cron() {
  local line="30 3 * * * $ROOT/bin/prodctl.sh backup >> $ROOT/backups/backup.log 2>&1"
  ( crontab -l 2>/dev/null | grep -v 'prodctl.sh backup' || true; echo "$line" ) | crontab -
  echo "cron installed: $line"
}

cmd=${1:-status}; shift || true
case $cmd in
  up) cmd_up "$@" ;;
  stage) cmd_stage "$@" ;;
  rollback) cmd_rollback ;;
  status) cmd_status ;;
  check-env) cmd_check_env ;;
  logs)
    cur=$(need_current)
    if [ "${FOLLOW:-0}" = 1 ]; then dc "$cur" logs --tail "${LOG_LINES:-200}" -f "$@"; else dc "$cur" logs --tail "${LOG_LINES:-200}" "$@"; fi ;;
  restart) cur=$(need_current); dc "$cur" restart "$@" ;;
  migrate-status) rel=$(tool_release); dc "$rel" run --rm --no-deps backend npx prisma migrate status ;;
  migrate)
    [ "${1:-}" = --yes ] || die "this applies pending migrations to the PRODUCTION database; re-run with --yes"
    rel=$(tool_release); echo "migrating with release $rel"; dc "$rel" run --rm --no-deps backend npx prisma migrate deploy ;;
  migrate-resolve)
    [ "${1:-}" = --applied ] && [[ ${2:-} =~ ^[0-9]{4}_[a-z0-9_]+$ ]] && [ "${3:-}" = --yes ] \
      || die "usage: migrate-resolve --applied <migration, e.g. 0036_x> --yes (records it as applied in PRODUCTION without running it)"
    rel=$(tool_release); dc "$rel" run --rm --no-deps backend npx prisma migrate resolve --applied "$2" ;;
  backfill) cmd_backfill "$@" ;;
  backup) cmd_backup ;;
  install-cron) cmd_install_cron ;;
  *) sed -n '2,17p' "$0"; exit 2 ;;
esac
