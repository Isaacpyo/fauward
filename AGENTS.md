# Fauward Codex Guide

Fauward is a multi-tenant B2B SaaS platform for logistics businesses: couriers, freight forwarders, and 3PLs.
Owner: Temitope Agbola / Treny Limited. Active development.

## Stack

- API: Node 20, Fastify, TypeScript, Prisma ORM
- Database: PostgreSQL 15 on Supabase, plus Redis 7
- Auth: JWT access and refresh tokens, `@fastify/jwt`, `@fastify/cookie`
- Frontend: Next.js 14 App Router for the marketing site
- Tenant Portal: React 18 and Vite
- Agents App: React 18, Vite, PWA
- Super Admin: React 18 and Vite
- Build: Turborepo and npm workspaces
- Queue: BullMQ on Redis
- Email: SendGrid
- Deploy: Railway for backend and Python services, Vercel for frontends

## Repository Map

- `apps/backend/`: Fastify API routes, modules, middleware, Prisma schema, and workers
- `apps/frontend/`: Next.js marketing site
- `apps/tenant-portal/`: tenant operations portal
- `apps/agents/`: field agent PWA
- `apps/fauward-Go/`: field logistics app
- `apps/super-admin/` and `apps/admin/`: internal/admin apps
- `packages/`: shared types, brand tokens, pricing/tracking/domain packages, theme engine, and formatting helpers
- `widget/`: vanilla JavaScript embeddable tracking widget
- `docs/`: product and implementation specifications. Start with `docs/implementation-status.md`.

## Key Commands

Run from the repository root unless noted otherwise.

```bash
npm run dev
npm run dev:backend
npm run dev:frontend
npm run build
npm run test
npm run lint
npm run prisma:migrate --workspace=apps/backend
npm run prisma:generate --workspace=apps/backend
npm run tracking:migrate --workspace=apps/backend
docker-compose up -d
```

## Engineering Rules

- Preserve tenant isolation. Every tenant-scoped DB query must include `tenantId`; no exceptions.
- Do not bypass `authenticate`, `requireRole`, or feature guards on protected routes.
- Never commit secrets, credentials, or `.env` values.
- Do not use `any` in TypeScript unless the surrounding file already requires it and there is no safer local type. Prefer `unknown` or named types.
- Use Fastify logging (`req.log`, `app.log`) instead of `console.log` in production code.
- Use `app.httpErrors.*` in Fastify route handlers instead of `throw new Error()`.
- Avoid raw SQL unless Prisma cannot express the query. Parameterize any raw query.
- Do not run `prisma migrate reset`; it wipes the database.
- Keep changes tightly scoped and avoid unrelated refactors.

## Backend Notes

- Module routes live under `apps/backend/src/modules/<name>/`.
- Each module exports a `register*Routes(app: FastifyInstance)` function and is registered in `apps/backend/src/app.ts`.
- Tenant context is resolved by tenant middleware. Use `getTenantContext()` in service logic when tenant scope is needed.
- Prisma is available on `app.prisma`.
- Access token auth uses `app.authenticate`; role checks use `requireRole([...])`.
- If you change backend routes or services, add or update focused Vitest tests alongside the module.

For deeper backend-specific guidance, read `apps/backend/AGENTS.md` before editing backend code.

## Frontend Notes

- `apps/frontend` uses the Next.js App Router under `src/app/`; do not add a Pages Router.
- Server components are the default. Add `'use client'` only for hooks, browser APIs, or event handlers.
- Use Tailwind CSS and the existing brand/design token packages.
- Use `next/link` for internal navigation and `next/image` for images.

For deeper frontend-specific guidance, read `apps/frontend/AGENTS.md` before editing frontend code.

## Codex Project Assets

- `.codex/agents/`: project-scoped custom subagents.
- `.codex/hooks.json` and `.codex/hooks/`: deterministic lifecycle hooks.
- `.codex/rules/`: command approval rules.
- `.agents/skills/`: repo-scoped reusable workflows.

