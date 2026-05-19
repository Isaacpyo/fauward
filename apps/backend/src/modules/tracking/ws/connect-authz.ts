import type { Socket } from 'socket.io';

export interface AuthzContext {
  tenantId?: string;
  role?: string;
  impersonatingTenantId?: string;
}

export function canJoinRoom(ctx: AuthzContext, room: string): boolean {
  const parsed = parseRoom(room);
  if (!parsed) return false;

  if (parsed.type === 'escalations') {
    return ctx.role === 'SUPER_ADMIN';
  }

  if (parsed.type === 'tenant' || parsed.type === 'shipment') {
    const requiredTenantId = parsed.tenantId;
    if (ctx.role === 'SUPER_ADMIN' && ctx.impersonatingTenantId === requiredTenantId) {
      return true;
    }
    if (ctx.tenantId === requiredTenantId) {
      return true;
    }
    return false;
  }

  return false;
}

function parseRoom(room: string): { type: 'shipment' | 'tenant' | 'escalations'; tenantId?: string } | null {
  if (room === 'escalations:all') {
    return { type: 'escalations' };
  }
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
  if (ctx.role === 'SUPER_ADMIN') {
    rooms.push(escalationsRoom());
    if (ctx.impersonatingTenantId) {
      rooms.push(tenantRoom(ctx.impersonatingTenantId));
    }
  }
  return rooms;
}

function tenantRoom(tenantId: string): string {
  return `tracking:tenant:${tenantId}`;
}

function escalationsRoom(): string {
  return 'escalations:all';
}
