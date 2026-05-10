# /db — Prisma database commands

Database operations for the Fauward backend.

## Common operations

**Create and apply a new migration (dev):**
```bash
npm run prisma:migrate --workspace=apps/backend
# Prompts for migration name, then runs prisma migrate dev
```

**Regenerate Prisma client after schema change:**
```bash
npm run prisma:generate --workspace=apps/backend
```

**Run the tracking migration script:**
```bash
npm run tracking:migrate --workspace=apps/backend
```

**Push schema changes to dev DB without creating a migration file:**
```bash
npx prisma db push --schema=apps/backend/prisma/schema.prisma
```

**Open Prisma Studio (DB browser):**
```bash
npx prisma studio --schema=apps/backend/prisma/schema.prisma
```

## Schema location
`apps/backend/prisma/schema.prisma`

## NEVER run
```bash
prisma migrate reset   # wipes the database — forbidden
```

When asked to run a database command, confirm with the user if it's a destructive operation.
