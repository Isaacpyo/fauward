# Docker on the Oracle VM (fauward)

The laptop runs no containers. `scripts/vm-slot.sh` runs `docker-compose.yml` (plus `docker-compose.remote.yml`) on the Oracle VM through the `oracle` Docker context (`ssh://oracle-vm`) and forwards the ports back to `127.0.0.1`. The compose file has no local-folder mounts, so nothing needs syncing: the `python-services` image is built from the uploaded build context.

## Daily routine
1. `bash scripts/vm-slot.sh setup`: starts postgres, redis, mailhog (running the Mailpit image), python-api, worker, beat and uptime-kuma on the VM and opens the tunnel. Slot 0 keeps the ports the repo already uses, so no env file changes.
2. `bash scripts/vm-slot.sh status 0` and `logs 0 python-api` to check on it.
3. After the laptop sleeps or restarts, only the tunnel drops: `bash scripts/vm-slot.sh tunnel 0`.
4. Stop with `bash scripts/vm-slot.sh down 0`.

## Slots (parallel sessions)
| Slot | Who | API | Postgres | Redis | Mailhog UI / SMTP | Kuma |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | main checkout | 8000 | 5432 | 6379 | 8025 / 1025 | 4002 |
| 1 | session | 57100 | 57132 | 57179 | 57125 / 57126 | 57102 |
| 2 | session | 57200 | 57232 | 57279 | 57225 / 57226 | 57202 |
| 3 | session | 57300 | 57332 | 57379 | 57325 / 57326 | 57302 |

Sessions use `claim`, `up N`, `env N` (rewrites `localhost:<default port>` in `.env*` files copied from the main checkout to the slot's ports), `tunnel N`, `release N`. Each slot is its own compose project (`fauward-sN`), so containers and volumes never collide.

## Limits
- Slot 0 uses port 8000 locally. If another project's tunnel already holds 8000 (vitalos-platform `superadmin`), the tunnel fails with a clear error; stop one of them or use a slot 1-3.
- The VM has 24 GB shared with TipSignal and vitalos-platform; `up` refuses to start below 1.5 GB free.
- The compose file binds ports to `0.0.0.0` by default; the override binds them to `127.0.0.1` on the VM. Never open ports in the Oracle firewall.
- Needs Docker Compose 2.24+ on the laptop for the `!override` and `!reset` tags (`docker compose version`).
- Mail catcher: `mailhog/mailhog` is x86-only and crashes on the ARM VM, so the override uses `axllent/mailpit` (same ports: UI 8025, SMTP 1025). The compose service keeps the name `mailhog`.
