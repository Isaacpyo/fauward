#!/usr/bin/env bash
# Oracle VM Docker stacks for fauward (docker-compose.yml). Docker never runs on the laptop.
# Slot 0 = main checkout, on the ports docker-compose.yml already uses (8000, 5432, 6379, 8025, 1025, 4002).
# Slots 1-3 = parallel agent sessions (claim one, release when done), each on its own port block 57x00.
# Each slot is a separate compose project (fauward-sN), so containers and volumes never collide.
set -euo pipefail
SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
cd "$(git rev-parse --show-toplevel)"

VM=${VM:-oracle-vm}
APP=fauward
MIN_FREE_MB=1500
export DOCKER_CONTEXT=oracle      # always the VM, whatever the global context is

cmd=${1:-help}
n=${2:-}
vm() { ssh "$VM" "$@"; }

# name:default_port:offset_in_slot_block
PORTS="API:8000:0 KUMA:4002:2 MAILUI:8025:25 SMTP:1025:26 PG:5432:32 REDIS:6379:79"

slot_vars() {
  [[ "$n" =~ ^[0-3]$ ]] || { echo "slot must be 0 (main checkout) or 1-3" >&2; exit 2; }
  for spec in $PORTS; do
    IFS=: read -r name def off <<<"$spec"
    if [ "$n" = 0 ]; then port=$def; else port=$((57000 + n * 100 + off)); fi
    printf -v "P_$name" '%s' "$port"
  done
  PROJECT="$APP-s$n"
}

compose() {
  FW_API_PORT=$P_API FW_KUMA_PORT=$P_KUMA FW_MAILUI_PORT=$P_MAILUI FW_SMTP_PORT=$P_SMTP \
  FW_PG_PORT=$P_PG FW_REDIS_PORT=$P_REDIS \
    docker compose -p "$PROJECT" -f docker-compose.yml -f docker-compose.remote.yml "$@"
}

ensure_context() {
  docker context inspect oracle >/dev/null 2>&1 || docker context create oracle --docker "host=ssh://$VM" >/dev/null
}

mem_guard() {
  local avail
  avail=$(vm "awk '/MemAvailable/ {print int(\$2/1024)}' /proc/meminfo") || { echo "VM unreachable" >&2; exit 1; }
  if [ "${avail:-0}" -lt "$MIN_FREE_MB" ]; then
    echo "VM has only ${avail}MB free (need $MIN_FREE_MB). Release idle slots or stop another stack first." >&2
    exit 1
  fi
}

env_files() { (cd "$1" && ls .env .env.local apps/*/.env apps/*/.env.local services/*/.env 2>/dev/null || true); }

case "$cmd" in
  claim)
    owner=$(basename "$PWD")
    vm "mkdir -p ~/$APP-slots"
    for i in 1 2 3; do
      if vm "mkdir ~/$APP-slots/.lock-s$i 2>/dev/null && echo '$owner' > ~/$APP-slots/.lock-s$i/owner"; then
        echo "$i"
        exit 0
      fi
    done
    echo "no free slot" >&2
    exit 1
    ;;
  up)      slot_vars; ensure_context; mem_guard; compose up -d --build
           echo "slot $n up: API :$P_API  Postgres :$P_PG  Redis :$P_REDIS  Mailhog UI :$P_MAILUI SMTP :$P_SMTP  Kuma :$P_KUMA (run 'tunnel $n' to reach them)" ;;
  down)    slot_vars; ensure_context; compose down ;;
  status)  slot_vars; ensure_context; compose ps ;;
  logs)    slot_vars; ensure_context; shift 2; compose logs --tail 80 "$@" ;;
  env)
    slot_vars
    if [ "$n" = 0 ]; then echo "slot 0 uses the default ports; nothing to rewrite"; exit 0; fi
    root=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
    if [ "$PWD" -ef "$root" ]; then echo "the main checkout uses slot 0" >&2; exit 2; fi
    while IFS= read -r f; do
      mkdir -p "$(dirname "$f")"
      [ -f "$f" ] || cp "$root/$f" "$f"
      for spec in $PORTS; do
        IFS=: read -r name def off <<<"$spec"
        var="P_$name"
        sed -i -E "s/(localhost|127\.0\.0\.1):$def\b/\1:${!var}/g" "$f"
      done
      echo "ports in $f now point at slot $n"
    done < <(env_files "$root")
    ;;
  tunnel)
    slot_vars
    args=()
    for spec in $PORTS; do
      IFS=: read -r name def off <<<"$spec"
      var="P_$name"
      args+=(-L "${!var}:localhost:${!var}")
    done
    ssh -fN -o ExitOnForwardFailure=yes "${args[@]}" "$VM"
    echo "tunnel up for slot $n"
    ;;
  setup)   # everything for the main checkout in one go
    n=0
    bash "$SELF" up 0
    bash "$SELF" tunnel 0
    ;;
  release)
    slot_vars
    [ "$n" = 0 ] && { echo "slot 0 is the main checkout; use 'down 0' to stop it" >&2; exit 2; }
    bash "$SELF" down "$n" || true
    vm "rm -rf ~/$APP-slots/.lock-s$n"
    echo "slot $n released"
    ;;
  *)
    echo "usage: vm-slot.sh setup | claim | <up|down|status|logs|env|tunnel|release> <slot 0-3> [service]"
    ;;
esac
