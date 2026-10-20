import type { Prisma, PrismaClient } from '@prisma/client';

// Personal data registry (trust.compliance, WP-2.5). One entry per model that holds a tenant's data subject: how rows
// are matched to the subject, which fields are exported, and what erasure does. `trust.dsar-gather` exports exactly
// these rows; `trust.dsar-erase` applies each entry's strategy. Every query is scoped to the request's tenant.
//
// Strategies: ANONYMISE (identifying fields replaced, row kept so references stay valid), REDACT (free text and
// contact fields cleared), DELETE (rows removed), RETAIN (legally required financial records kept as they are; the
// subject's identity on them lives in the anonymised User row).

export type DataSubject = { tenantId: string; userId: string | null; email: string };
export type ErasureStrategy = 'ANONYMISE' | 'REDACT' | 'DELETE' | 'RETAIN';
export type RegistryDb = Pick<
  PrismaClient,
  'user' | 'lead' | 'shipment' | 'supportTicket' | 'ticketMessage' | 'invoice' | 'returnRequest' | 'notificationLog' | 'inAppNotification' | 'refreshToken' | 'feedbackItem'
>;

export type RegistryEntry = {
  model: string;
  matchFields: string[];
  exportFields: string[];
  strategy: ErasureStrategy;
  find(db: RegistryDb, subject: DataSubject): Promise<unknown[]>;
  /** Applies the strategy; returns the number of rows changed. RETAIN entries return 0. */
  erase(db: RegistryDb, subject: DataSubject): Promise<number>;
};

export const ERASED_TEXT = '[erased at the data subject’s request]';
const ADDRESS_PII_KEYS = ['name', 'fullName', 'contactName', 'firstName', 'lastName', 'company', 'email', 'phone', 'line1', 'line2', 'street', 'address', 'address1', 'address2'];

export function erasedEmail(userId: string) {
  return `erased-${userId}@erased.invalid`;
}

/** Keeps the routing parts of an address (city, postcode, country) and removes the parts that identify a person. */
export function redactAddress(value: Prisma.JsonValue): Prisma.InputJsonValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const kept: Record<string, Prisma.InputJsonValue> = {};
  for (const [key, field] of Object.entries(value)) {
    if (ADDRESS_PII_KEYS.includes(key) || field === null) continue;
    kept[key] = field as Prisma.InputJsonValue;
  }
  return kept;
}

const pick = <T extends Record<string, boolean>>(fields: T) => fields;
const userSelect = pick({ id: true, email: true, firstName: true, lastName: true, phone: true, role: true, isActive: true, lastLogin: true, createdAt: true });
const leadSelect = pick({ id: true, company: true, contactName: true, email: true, phone: true, stage: true, notes: true, createdAt: true });
const shipmentSelect = pick({ id: true, trackingNumber: true, status: true, originAddress: true, destinationAddress: true, notes: true, specialInstructions: true, createdAt: true });
const ticketSelect = pick({ id: true, ticketNumber: true, subject: true, status: true, category: true, createdAt: true });
const messageSelect = pick({ id: true, ticketId: true, body: true, createdAt: true });
const invoiceSelect = pick({ id: true, invoiceNumber: true, status: true, total: true, currency: true, dueDate: true, createdAt: true });
const returnSelect = pick({ id: true, shipmentId: true, status: true, reason: true, notes: true, createdAt: true });
const notificationLogSelect = pick({ id: true, channel: true, event: true, template: true, status: true, recipient: true, createdAt: true });
const inAppSelect = pick({ id: true, type: true, title: true, body: true, createdAt: true });
const feedbackSelect = pick({ id: true, type: true, score: true, title: true, body: true, status: true, createdAt: true });

const fieldsOf = (select: Record<string, boolean>) => Object.keys(select);

export const PERSONAL_DATA_REGISTRY: RegistryEntry[] = [
  {
    model: 'User',
    matchFields: ['tenantId', 'id = subject user (email match)'],
    exportFields: fieldsOf(userSelect),
    strategy: 'ANONYMISE',
    find: (db, s) => (s.userId ? db.user.findMany({ where: { tenantId: s.tenantId, id: s.userId }, select: userSelect }) : Promise.resolve([])),
    async erase(db, s) {
      if (!s.userId) return 0;
      await db.refreshToken.deleteMany({ where: { userId: s.userId, user: { tenantId: s.tenantId } } });
      const result = await db.user.updateMany({
        where: { tenantId: s.tenantId, id: s.userId },
        data: { email: erasedEmail(s.userId), firstName: null, lastName: null, phone: null, avatarUrl: null, passwordHash: null, mfaSecret: null, mfaEnabled: false, ssoSubject: null, isActive: false }
      });
      return result.count;
    }
  },
  {
    model: 'Lead',
    matchFields: ['tenantId', 'email'],
    exportFields: fieldsOf(leadSelect),
    strategy: 'REDACT',
    find: (db, s) => db.lead.findMany({ where: { tenantId: s.tenantId, email: s.email }, select: leadSelect }),
    async erase(db, s) {
      const result = await db.lead.updateMany({ where: { tenantId: s.tenantId, email: s.email }, data: { contactName: null, email: null, phone: null, notes: null } });
      return result.count;
    }
  },
  {
    model: 'Shipment',
    matchFields: ['tenantId', 'customerId'],
    exportFields: fieldsOf(shipmentSelect),
    strategy: 'REDACT',
    find: (db, s) => (s.userId ? db.shipment.findMany({ where: { tenantId: s.tenantId, customerId: s.userId }, select: shipmentSelect }) : Promise.resolve([])),
    async erase(db, s) {
      if (!s.userId) return 0;
      const rows = await db.shipment.findMany({ where: { tenantId: s.tenantId, customerId: s.userId }, select: { id: true, originAddress: true, destinationAddress: true } });
      for (const row of rows) {
        await db.shipment.updateMany({
          where: { tenantId: s.tenantId, id: row.id },
          data: { originAddress: redactAddress(row.originAddress), destinationAddress: redactAddress(row.destinationAddress), notes: null, specialInstructions: null }
        });
      }
      return rows.length;
    }
  },
  {
    model: 'SupportTicket',
    matchFields: ['tenantId', 'customerId'],
    exportFields: fieldsOf(ticketSelect),
    strategy: 'REDACT',
    find: (db, s) => (s.userId ? db.supportTicket.findMany({ where: { tenantId: s.tenantId, customerId: s.userId }, select: ticketSelect }) : Promise.resolve([])),
    async erase(db, s) {
      if (!s.userId) return 0;
      const result = await db.supportTicket.updateMany({ where: { tenantId: s.tenantId, customerId: s.userId }, data: { subject: ERASED_TEXT } });
      return result.count;
    }
  },
  {
    model: 'TicketMessage',
    matchFields: ['tenantId', 'authorId', 'visibility PUBLIC'],
    exportFields: fieldsOf(messageSelect),
    strategy: 'REDACT',
    find: (db, s) => (s.userId ? db.ticketMessage.findMany({ where: { tenantId: s.tenantId, authorId: s.userId, visibility: 'PUBLIC' }, select: messageSelect }) : Promise.resolve([])),
    async erase(db, s) {
      if (!s.userId) return 0;
      const result = await db.ticketMessage.updateMany({ where: { tenantId: s.tenantId, authorId: s.userId }, data: { body: ERASED_TEXT } });
      return result.count;
    }
  },
  {
    model: 'Invoice',
    matchFields: ['tenantId', 'kind TENANT_CUSTOMER', 'customerId'],
    exportFields: fieldsOf(invoiceSelect),
    strategy: 'RETAIN',
    find: (db, s) => (s.userId ? db.invoice.findMany({ where: { kind: 'TENANT_CUSTOMER', tenantId: s.tenantId, customerId: s.userId }, select: invoiceSelect }) : Promise.resolve([])),
    erase: async () => 0
  },
  {
    model: 'ReturnRequest',
    matchFields: ['tenantId', 'customerId'],
    exportFields: fieldsOf(returnSelect),
    strategy: 'REDACT',
    find: (db, s) => (s.userId ? db.returnRequest.findMany({ where: { tenantId: s.tenantId, customerId: s.userId }, select: returnSelect }) : Promise.resolve([])),
    async erase(db, s) {
      if (!s.userId) return 0;
      const result = await db.returnRequest.updateMany({ where: { tenantId: s.tenantId, customerId: s.userId }, data: { reason: null, notes: null, photos: [] } });
      return result.count;
    }
  },
  {
    model: 'NotificationLog',
    matchFields: ['tenantId', 'userId', 'recipient = email'],
    exportFields: fieldsOf(notificationLogSelect),
    strategy: 'REDACT',
    find: (db, s) => db.notificationLog.findMany({ where: { tenantId: s.tenantId, OR: [{ recipient: s.email }, ...(s.userId ? [{ userId: s.userId }] : [])] }, select: notificationLogSelect }),
    async erase(db, s) {
      const result = await db.notificationLog.updateMany({ where: { tenantId: s.tenantId, OR: [{ recipient: s.email }, ...(s.userId ? [{ userId: s.userId }] : [])] }, data: { recipient: null } });
      return result.count;
    }
  },
  {
    model: 'FeedbackItem',
    matchFields: ['tenantId', 'userId'],
    exportFields: fieldsOf(feedbackSelect),
    strategy: 'REDACT',
    find: (db, s) => (s.userId ? db.feedbackItem.findMany({ where: { tenantId: s.tenantId, userId: s.userId }, select: feedbackSelect }) : Promise.resolve([])),
    async erase(db, s) {
      if (!s.userId) return 0;
      const result = await db.feedbackItem.updateMany({ where: { tenantId: s.tenantId, userId: s.userId }, data: { body: null, title: ERASED_TEXT } });
      return result.count;
    }
  },
  {
    model: 'InAppNotification',
    matchFields: ['tenantId', 'userId'],
    exportFields: fieldsOf(inAppSelect),
    strategy: 'DELETE',
    find: (db, s) => (s.userId ? db.inAppNotification.findMany({ where: { tenantId: s.tenantId, userId: s.userId }, select: inAppSelect }) : Promise.resolve([])),
    async erase(db, s) {
      if (!s.userId) return 0;
      const result = await db.inAppNotification.deleteMany({ where: { tenantId: s.tenantId, userId: s.userId } });
      return result.count;
    }
  }
];
