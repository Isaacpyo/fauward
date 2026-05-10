# Backend Codex Guide

These instructions apply to `apps/backend/**`.

## Module Pattern

Every module lives at `src/modules/<name>/` and exports a register function:

```ts
export async function registerXRoutes(app: FastifyInstance) {
  app.get(
    '/api/resource',
    { preHandler: [app.authenticate, requireRole(['ADMIN'])] },
    async (req, reply) => {
      const ctx = getTenantContext();
      const result = await app.prisma.model.findMany({
        where: { tenantId: ctx.tenantId },
      });
      return reply.send(result);
    },
  );
}
```

Register new route modules in `src/app.ts`.

## Tenant Isolation

- `req.tenant` is set by `tenantResolver` middleware.
- `req.user` is set by `app.authenticate`.
- Use `getTenantContext()` from `src/context/tenant.context.ts` in service logic.
- Every tenant-scoped Prisma query must include `where: { tenantId: ctx.tenantId }`.

## Prisma

```ts
const shipment = await app.prisma.shipment.findFirst({
  where: { id, tenantId: ctx.tenantId },
});
```

Do not query tenant business data by `id` alone.

## Error Handling

Use `@fastify/sensible` errors:

```ts
throw app.httpErrors.notFound('Shipment not found');
throw app.httpErrors.forbidden('Insufficient permissions');
throw app.httpErrors.badRequest('Invalid status transition');
throw app.httpErrors.conflict('Tracking number already exists');
```

Do not throw generic `Error` objects from route handlers.

## Auth Guards

```ts
preHandler: [app.authenticate]
preHandler: [app.authenticate, requireRole(['ADMIN'])]
preHandler: [app.authenticate, requireFeature('FLEET')]
```

## Types And Logging

- Extend Fastify request types in `src/types/fastify.d.ts` when adding decorations.
- Use Fastify logger calls, not `console.log`, in production code.

```ts
req.log.info({ shipmentId }, 'Shipment dispatched');
req.log.error({ err }, 'Failed to send webhook');
```

