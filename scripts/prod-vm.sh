#!/usr/bin/env bash
# Fauward production on the Oracle VM: laptop side. Full guide: docs/deploy-oracle-prod.md.
#
#   bash scripts/prod-vm.sh init                 one time: folders, env templates, Redis password, control script
#   bash scripts/prod-vm.sh deploy [ref]         ship a commit (default origin/master): upload, build, start, health-check
#   bash scripts/prod-vm.sh stage [ref]          upload and build without starting, so migrations and backfills run first
#   bash scripts/prod-vm.sh status | check-env | rollback | backup | install-cron | migrate-status
#   bash scripts/prod-vm.sh logs [service...]    LOG_LINES=500 / FOLLOW=1 work too
#   bash scripts/prod-vm.sh restart [service...]
#   bash scripts/prod-vm.sh migrate --yes        prisma migrate deploy against PRODUCTION
#   bash scripts/prod-vm.sh migrate-resolve --applied <migration> --yes   baseline a database without migration history
#   bash scripts/prod-vm.sh backfill <id> --dry-run | --yes [--clear-legacy]
#   bash scripts/prod-vm.sh edit-env <file>      open backend.env / python.env / cloudflared.env on the VM
#
# Production is a separate compose project (fauward-prod) under /data/fauward-prod. It never touches
# the dev slots (scripts/vm-slot.sh) or the other projects on the VM.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

VM=${VM:-oracle-vm}
ROOT=${FAUWARD_PROD_ROOT:-/data/fauward-prod}
PROJECT=${FAUWARD_PROD_PROJECT:-fauward-prod}
die() { echo "prod-vm: $*" >&2; exit 1; }
vm() { ssh "$VM" "$@"; }
ctl() { ssh -t "$VM" "FAUWARD_PROD_ROOT=$ROOT FAUWARD_PROD_PROJECT=$PROJECT LOG_LINES=${LOG_LINES:-200} FOLLOW=${FOLLOW:-0} $ROOT/bin/prodctl.sh $*"; }

# Upload <ref> to releases/<commit> (once) and install its prodctl.sh. Sets rel.
upload_release() {
  local ref=$1 sha
  git fetch -q origin
  sha=$(git rev-parse --verify "$ref^{commit}") || die "unknown ref $ref"
  rel=${sha:0:12}
  git cat-file -e "$sha:deploy/oracle-prod/docker-compose.yml" 2>/dev/null \
    || die "$ref has no deploy/oracle-prod/ yet (merge chore/prod-oracle-vm first, or deploy that branch)"
  echo "$cmd $ref ($rel) to $VM"
  if ! vm "test -d $ROOT/releases/$rel"; then
    git archive --format=tar "$sha" \
      | vm "rm -rf $ROOT/releases/$rel.tmp && mkdir -p $ROOT/releases/$rel.tmp && tar -x -C $ROOT/releases/$rel.tmp && mv $ROOT/releases/$rel.tmp $ROOT/releases/$rel"
  fi
  vm "printf '%s\n' '$ref' > $ROOT/releases/$rel/.ref && date -u +%FT%TZ > $ROOT/releases/$rel/.time && install -m 700 $ROOT/releases/$rel/deploy/oracle-prod/bin/prodctl.sh $ROOT/bin/prodctl.sh"
}

cmd=${1:-help}; shift || true
case $cmd in
  init)
    vm "sudo mkdir -p $ROOT && sudo chown \$(id -u):\$(id -g) $ROOT && mkdir -p $ROOT/env $ROOT/releases $ROOT/backups $ROOT/bin && chmod 700 $ROOT/env $ROOT/backups"
    for f in deploy/oracle-prod/env.example/*.env; do
      name=$(basename "$f")
      if vm "test -e $ROOT/env/$name"; then
        echo "kept existing env/$name"
      else
        vm "umask 077 && cat > $ROOT/env/$name" < "$f"
        echo "created env/$name from template"
      fi
    done
    vm "grep -qE '^REDIS_PASSWORD=.+' $ROOT/env/compose.env || { umask 077; printf 'REDIS_PASSWORD=%s\n' \$(openssl rand -hex 24) > $ROOT/env/compose.env; }"
    # Values production generates for itself (never copied from Railway). Only filled when empty.
    vm "bash -s" <<EOF
set -e
E=$ROOT/env
set_if_empty() { # file key value
  if grep -qE "^\$2=[[:space:]]*[^#[:space:]]" "\$E/\$1"; then return 0; fi   # has a value (not just a comment)
  if grep -qE "^\$2=" "\$E/\$1"; then sed -i "s|^\$2=.*|\$2=\$3|" "\$E/\$1"; else printf '%s=%s\n' "\$2" "\$3" >> "\$E/\$1"; fi
  echo "generated \$1: \$2"
}
kid=k\$(date -u +%Y)a
set_if_empty backend.env FIELD_ENCRYPTION_ACTIVE_KEY_ID "\$kid"
active=\$(grep -E '^FIELD_ENCRYPTION_ACTIVE_KEY_ID=' "\$E/backend.env" | cut -d= -f2)
set_if_empty backend.env FIELD_ENCRYPTION_KEYS "{\"\$active\":\"\$(openssl rand -base64 32)\"}"
set_if_empty backend.env MONITORING_API_KEY "\$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')"
mon=\$(grep -E '^MONITORING_API_KEY=' "\$E/backend.env" | cut -d= -f2)
set_if_empty python.env MONITORING_API_KEY "\$mon"
set_if_empty backend.env CONSOLE_URL https://admin.fauward.com
EOF
    vm "umask 077 && cat > $ROOT/bin/prodctl.sh && chmod 700 $ROOT/bin/prodctl.sh" < deploy/oracle-prod/bin/prodctl.sh
    echo "init done. Fill in the env files: bash scripts/prod-vm.sh edit-env backend.env (and python.env, cloudflared.env)"
    ctl check-env || true
    ;;

  edit-env)
    file=${1:-}
    case $file in backend.env|python.env|cloudflared.env) ;; *) die "usage: edit-env backend.env|python.env|cloudflared.env" ;; esac
    ssh -t "$VM" "\${EDITOR:-nano} $ROOT/env/$file && chmod 600 $ROOT/env/$file"
    ;;

  deploy)
    upload_release "${1:-origin/master}"
    ctl up "$rel"
    ;;

  stage)
    upload_release "${1:-origin/master}"
    ctl stage "$rel"
    ;;

  status|check-env|rollback|backup|install-cron|migrate-status|logs|restart|migrate|migrate-resolve|backfill)
    ctl "$cmd" "$@"
    ;;

  *) sed -n '2,13p' "$0"; exit 2 ;;
esac
