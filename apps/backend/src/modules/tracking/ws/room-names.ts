export function shipmentRoom(tenantId: string, trackingNumber: string): string {
  return `tracking:${tenantId}:${trackingNumber}`;
}

export function tenantRoom(tenantId: string): string {
  return `tracking:tenant:${tenantId}`;
}

export function escalationsRoom(): string {
  return 'escalations:all';
}

export function parseRoomName(room: string): { type: 'shipment' | 'tenant' | 'escalations'; tenantId?: string; trackingNumber?: string } | null {
  if (room === 'escalations:all') {
    return { type: 'escalations' };
  }
  if (room.startsWith('tracking:tenant:')) {
    const tenantId = room.slice('tracking:tenant:'.length);
    return { type: 'tenant', tenantId };
  }
  if (room.startsWith('tracking:')) {
    const rest = room.slice('tracking:'.length);
    const colonIndex = rest.indexOf(':');
    if (colonIndex === -1) return null;
    const tenantId = rest.slice(0, colonIndex);
    const trackingNumber = rest.slice(colonIndex + 1);
    return { type: 'shipment', tenantId, trackingNumber };
  }
  return null;
}

export function isValidRoomFormat(room: string): boolean {
  return parseRoomName(room) !== null;
}
