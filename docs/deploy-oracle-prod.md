# Production on the Oracle VM

Railway is gone. The backend, Python services and route optimizer run as one Docker Compose project, `fauward-prod`, on the Oracle VM. A Cloudflare Tunnel publishes `api.fauward.com`. The frontends stay on Vercel and the database stays on Supabase.

```
Vercel (www, app, admin, status) ──HTTPS──▶ api.fauward.com ──Cloudflare Tunnel──▶ cloudflared ─▶ backend:3001
                                                                                        │
                                       Oracle VM, compose project "fauward-prod"         ├─▶ redis (queues)
                                       (no host ports, nothing open in the firewall)    ├─▶ python-api / -worker / -beat
                                                                                        └─▶ route-optimizer
backend, python ─▶ Supabase Postgres (cloud)
```

| Path on the VM | What it holds |
| --- | --- |
| `/data/fauward-prod/env/*.env` | Secrets (chmod 600). Never in git. Keep a copy in your password manager. |
| `/data/fauward-prod/releases/<commit>/` | Source of each deployed commit (the last 3 are kept) |
| `/data/fauward-prod/CURRENT`, `PREVIOUS` | Live release and rollback target |
| `/data/fauward-prod/backups/` | Daily `pg_dump` of the production database (the last 14 are kept) |
| `/data/fauward-prod/bin/prodctl.sh` | Control script on the VM (`scripts/prod-vm.sh` calls it over ssh) |

Docker's data root is `/data/docker` on the second disk (100 GB), so images and builds never fill the root disk.

## First-time setup

1. **Folders and templates.** Run `bash scripts/prod-vm.sh init`. It creates the folders, copies the env templates from `deploy/oracle-prod/env.example/` (it never overwrites a filled file) and installs `prodctl.sh`. It also generates any of these that are still empty:
   - the Redis password
   - `FIELD_ENCRYPTION_KEYS` and `FIELD_ENCRYPTION_ACTIVE_KEY_ID`. Production refuses to boot without them, and losing them makes encrypted values (such as TOTP secrets) unreadable.
   - `MONITORING_API_KEY`, written to both `backend.env` and `python.env`. Copy the same value into the status-dashboard Vercel project.

   Re-running `init` is safe.
2. **Secrets.** Copy the values from Railway: open each service, then Variables, then Raw Editor.
   - `bash scripts/prod-vm.sh edit-env backend.env`: from the Railway backend service.
   - `bash scripts/prod-vm.sh edit-env python.env`: from the Railway python-services service.
   - `bash scripts/prod-vm.sh check-env` lists anything still missing. It never prints values.
3. **Cloudflare Tunnel.**
   1. In the Cloudflare dashboard, go to Zero Trust, then Networks, then Tunnels, and choose **Create a tunnel**. Pick the **Cloudflared** type and name it `fauward-prod`.
   2. On the install step, copy the token (the long string after `--token`). Run `bash scripts/prod-vm.sh edit-env cloudflared.env` and set `TUNNEL_TOKEN=`. You don't need to install anything; the `cloudflared` container runs it.
   3. **Public Hostname**: subdomain `api`, domain `fauward.com`, service type `HTTP`, URL `backend:3001`. Cloudflare creates the DNS record.
   4. Optional, only if the status dashboard's Python observability panel is used: add a second hostname, `py.fauward.com`, pointing to `HTTP python-api:8000`, and set `PYTHON_API_URL=https://py.fauward.com` in the status-dashboard Vercel project.
4. **Database, then deploy.** `master` contains console Phases 0–3: migrations `0037_console_mfa` to `0062_health_score_inputs`, and eight one-off backfills (`apps/backend/src/scripts/backfills/`). No migration drops or renames anything or adds a required column without a default, so the Railway backend keeps working while you migrate. Three backfills (0037, 0055, 0059) rewrite data the old code reads, so they wait for the cutover (step 7).
   1. `bash scripts/prod-vm.sh stage` uploads and builds `origin/master` without starting it. The database commands below now run in this release, which has the new migrations.
   2. `bash scripts/prod-vm.sh migrate-status`. Read it before you migrate. If the Supabase database has no migration history (it was created with `prisma db push`), `migrate deploy` would replay everything from 0001. Baseline it first: for each migration already reflected in the schema, run `bash scripts/prod-vm.sh migrate-resolve --applied <name> --yes`, then check `migrate-status` again.
   3. `bash scripts/prod-vm.sh backup`, then `bash scripts/prod-vm.sh migrate --yes`.
   4. The backfills that only add data. Run each with `--dry-run` first, read the counts, then with `--yes`, for example `bash scripts/prod-vm.sh backfill 0039a --dry-run`:
      - `0039a`: staff users and role assignments from the old platform roles
      - `0042`: suspension records for suspended tenants
      - `0045`: marks console-created billing rows as platform rows
      - `0047`: support message authors and ticket audiences
      - `0051`: subscription history. Revenue analytics shows existing subscriptions only after this.
   5. `bash scripts/prod-vm.sh deploy`. The VM backend now runs; nothing sends it traffic until step 5.
   6. Dry-run the cutover backfills now, so step 7 is only the `--yes` runs: `backfill 0037 --dry-run`, `backfill 0055 --dry-run`, `backfill 0059 --dry-run`.
5. **Point the frontends at the new API** in Vercel. Open each project, then Settings, then Environment Variables, make the change and redeploy:
   - tenant-portal: `VITE_API_BASE_URL=https://api.fauward.com`
   - fauward-Go (if deployed separately): `VITE_API_BASE_URL=https://api.fauward.com`. The emailed sign-in link opens Fauward Go at `FAUWARD_GO_URL` (default `https://fauward.com/go`); set it in `backend.env` if Fauward Go lives elsewhere.
   - status-dashboard: `BACKEND_URL=https://api.fauward.com`
   - super-admin needs no variable change: its `vercel.json` rewrites now go to `https://api.fauward.com`.
6. **Point the inbound webhooks at the new host.** In Stripe, open Developers, then Webhooks, and change the endpoint to `https://api.fauward.com/api/v1/payments/webhook/stripe`. Put its new signing secret in `backend.env` as `STRIPE_WEBHOOK_SECRET`, then run `bash scripts/prod-vm.sh restart backend`. Do the same for any PagerDuty, Persona, ComplyAdvantage or DocuSign webhook you use (`/api/internal/.../webhooks/...`).
7. **Cutover backfills**, straight after steps 5 and 6, in this order (0059 reads the gateways 0055 creates):
   - `bash scripts/prod-vm.sh backfill 0037 --yes` encrypts console TOTP secrets. The new backend also accepts the old plaintext ones and encrypts each at its next sign-in.
   - `bash scripts/prod-vm.sh backfill 0055 --yes` moves tenant gateway keys into encrypted `TenantPaymentGateway` rows and encrypts tenant webhook secrets. The new backend reads gateways only from those rows, so tenants cannot take payments until this has run.
   - `bash scripts/prod-vm.sh backfill 0059 --yes` re-derives onboarding steps from real data.
   - Later, once tenant payments are confirmed working on the new backend, clear the old plaintext keys: `backfill 0055 --dry-run --clear-legacy`, then `backfill 0055 --yes --clear-legacy`.
8. **Backups.** Run `bash scripts/prod-vm.sh backup` once to check it works, then `bash scripts/prod-vm.sh install-cron` to run it daily at 03:30 UTC. If `pg_dump` cannot connect, the direct Supabase host is probably IPv6-only. Set `DIRECT_URL` to the **Session pooler** connection string (Supabase, Connect, Session pooler, port 5432), which works over IPv4.
9. **Shut down Railway.** Once `https://api.fauward.com/health` answers, delete the Railway project so nothing tries to bill or deploy there.

## Deploying

```bash
bash scripts/prod-vm.sh deploy                 # origin/master
bash scripts/prod-vm.sh deploy origin/<branch> # any pushed ref; only refs that contain deploy/oracle-prod/ can be deployed
```

The command does the following:
1. Uploads `git archive <commit>` to `releases/<commit>`. Only committed files are uploaded, so no local `.env` files or other uncommitted changes go to the VM.
2. Builds the images, tagged with the commit.
3. Runs `up -d`.
4. Waits up to 4 minutes for the backend health check.
5. If the backend becomes healthy, it records the release as `CURRENT`. If not, it prints the backend logs and **starts the previous release again**.

Database migrations never run automatically. For a release with new migrations, stage it first so they are applied before its code starts. `migrate-status`, `migrate`, `migrate-resolve` and `backfill` run in the staged release if there is one, else in the live one.

```bash
bash scripts/prod-vm.sh stage                  # upload + build origin/master, not started
bash scripts/prod-vm.sh migrate-status
bash scripts/prod-vm.sh backup && bash scripts/prod-vm.sh migrate --yes   # back up first
bash scripts/prod-vm.sh deploy                 # start it (reuses the staged upload and build)
```

A new backfill ships as `apps/backend/src/scripts/backfills/<id>-<name>.ts`. Run it with `bash scripts/prod-vm.sh backfill <id> --dry-run`, then `--yes`.

## Operating

| Task | Command |
| --- | --- |
| What is live, health, free disk and memory | `bash scripts/prod-vm.sh status` |
| Back to the previous release (no rebuild) | `bash scripts/prod-vm.sh rollback` |
| Restart one service | `bash scripts/prod-vm.sh restart backend` |
| Change a secret | `edit-env backend.env`, then `restart backend` |

### Logs

```bash
bash scripts/prod-vm.sh logs backend            # last 200 lines
LOG_LINES=1000 bash scripts/prod-vm.sh logs python-worker
FOLLOW=1 bash scripts/prod-vm.sh logs backend cloudflared
```

Services: `backend`, `python-api`, `python-worker`, `python-beat`, `route-optimizer`, `redis`, `cloudflared`. Docker keeps 3 × 10 MB of logs per container.

## Things to know

- **The VM is shared.** It also runs the dev slots (`scripts/vm-slot.sh`), TipSignal and vitalos-platform. Each production container has a memory limit, about 5 GB in total. If the VM runs short of memory, stop idle dev slots first.
- **Idle reclamation.** Oracle can reclaim an Always Free instance whose CPU, network and memory all stay under 20% for 7 days. This VM's memory use is far above that, but upgrading the Oracle account to Pay As You Go removes the risk. Usage within the Always Free limits stays free.
- **No host ports.** Nothing in `fauward-prod` binds a port on the VM, and the Oracle firewall stays closed. The tunnel is the only way in. To reach Redis or the backend directly, use `ssh oracle-vm` and `docker exec`.
- **First nightly run after console Phase 3.** Health scores switch to model v2: tenants younger than 14 days read "Not yet scored", and the activity feed shows a burst of `health.score_changed`. That is expected.
- **Secrets backup.** If the VM is lost, the release folders can be rebuilt from git, but the `env/` files cannot. Keep them in your password manager.
