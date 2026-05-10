---
name: fauward-database
description: Use Fauward Prisma and database commands safely. Use when the user asks for migrations, Prisma client generation, tracking migrations, schema push, or Prisma Studio.
---

Use these commands from the repository root unless the user specifies otherwise.

Common operations:

```bash
npm run prisma:migrate --workspace=apps/backend
npm run prisma:generate --workspace=apps/backend
npm run tracking:migrate --workspace=apps/backend
npx prisma db push --schema=apps/backend/prisma/schema.prisma
npx prisma studio --schema=apps/backend/prisma/schema.prisma
```

Rules:

- Never run `prisma migrate reset`.
- Ask before destructive database operations.
- Prefer migrations over `db push` for durable schema changes.
- After schema changes, run Prisma generation and the relevant backend tests.

