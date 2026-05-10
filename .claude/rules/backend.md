# Backend Rules

Applies to: `apps/backend/**`

## Module Pattern

Every module lives at `src/modules/<name>/` and exports a register function:

```ts
export async function registerXRoutes(app: FastifyInstance) {
  app.get('/api/resource', {
    preHandler: [app.authenticate, requireRole(['ADMIN'])]
  }, async (req, reply) => {
    const ctx = getTenantContext();
    const result = await app.prisma.model.findMany({
      where: { tenantId: ctx.tenantId }
    });
    return reply.send(result);
  });
}
```

Register it in `src/app.ts`.

## Tenant Isolation

- `req.tenant` is set by `tenantResolver` middleware (runs on every request)
- `req.user` is set by `app.authenticate` (JWT verification)
- Get tenant context in service logic via `getTenantContext()` from `src/context/tenant.context.ts`
- Every DB query MUST include `where: { tenantId: ctx.tenantId }` — no exceptions

## Prisma

```ts
// Good
const shipment = await app.prisma.shipment.findFirst({
  where: { id, tenantId: ctx.tenantId }
});

// Never — missing tenant scope
const shipment = await app.prisma.shipment.findFirst({ where: { id } });
```

## Error Handling

```ts
// Use @fastify/sensible — never throw generic Error
throw app.httpErrors.notFound('Shipment not found');
throw app.httpErrors.forbidden('Insufficient permissions');
throw app.httpErrors.badRequest('Invalid status transition');
throw app.httpErrors.conflict('Tracking number already exists');
```

## Auth Guards

```ts
// Pattern for protected routes
preHandler: [app.authenticate]                          // any authenticated user
preHandler: [app.authenticate, requireRole(['ADMIN'])]  // role-scoped
preHandler: [app.authenticate, requireFeature('FLEET')] // plan-feature-gated
```

## Types

- `req.user` → `{ id, email, role, tenantId }` (see `src/types/fastify.d.ts`)
- `req.tenant` → `{ id, slug, planTier, status, ... }`
- Extend FastifyRequest in `src/types/fastify.d.ts` when adding new decorations

## Logging

```ts
// Use Fastify logger — never console.log
req.log.info({ shipmentId }, 'Shipment dispatched');
req.log.error({ err }, 'Failed to send webhook');
```
