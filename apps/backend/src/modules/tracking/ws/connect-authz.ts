export interface AuthzContext {
  tenantId?: string;
  role?: string;
  impersonatingTenantId?: string;
}

// Tenant JWTs only join their own tenant's rooms (or, for an impersonation token, the impersonated tenant's). There is
// no cross-tenant room any more: console staff follow escalations on the activity SSE stream (WP-2.11, ACC-L15-2).
export function canJoinRoom(ctx: AuthzContext, room: string): boolean {
  const parsed = parseRoom(room);
  if (!parsed) return false;
  const requiredTenantId = parsed.tenantId;
  if (ctx.role === 'SUPER_ADMIN' && ctx.impersonatingTenantId === requiredTenantId) {
    return true;
  }
  return ctx.tenantId === requiredTenantId;
}

function parseRoom(room: string): { type: 'shipment' | 'tenant'; tenantId?: string } | null {
  if (room.startsWith('tracking:tenant:')) {
    return { type: 'tenant', tenantId: room.slice('tracking:tenant:'.length) };
  }
  if (room.startsWith('tracking:')) {
    const rest = room.slice('tracking:'.length);
    const colonIndex = rest.indexOf(':');
    if (colonIndex === -1) return null;
    return { type: 'shipment', tenantId: rest.slice(0, colonIndex) };
  }
  return null;
}

export function getAuthorizedRooms(ctx: AuthzContext): string[] {
  const rooms: string[] = [];
  if (ctx.tenantId) {
    rooms.push(tenantRoom(ctx.tenantId));
  }
  if (ctx.role === 'SUPER_ADMIN' && ctx.impersonatingTenantId) {
    rooms.push(tenantRoom(ctx.impersonatingTenantId));
  }
  return rooms;
}

function tenantRoom(tenantId: string): string {
  return `tracking:tenant:${tenantId}`;
}
