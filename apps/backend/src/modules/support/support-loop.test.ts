import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// L1 support loop (D5, WP-2.3) over an in-memory store: tenant "Contact Fauward" routes, the tenant's own desk and
// the console Support Desk share the visibility rules and the message write.

type Row = Record<string, unknown> & { id: string };
const queueAdd = vi.hoisted(() => vi.fn(async (_name: string, _data: Record<string, unknown>) => ({ id: `job_${Math.random().toString(36).slice(2)}` })));

vi.mock('../../queues/queues.js', () => ({ notificationQueue: { add: queueAdd }, bullmqConnection: {} }));
vi.mock('../../queues/python-services.js', () => ({ publishPythonServiceJob: vi.fn(async () => undefined) }));
vi.mock('../internal/internal-audit.js', () => ({ writeInternalAudit: vi.fn(async () => undefined) }));
vi.mock('bullmq', () => ({
  Queue: class {
    add = vi.fn();
    close = vi.fn(async () => undefined);
  },
  Worker: class {
    on = vi.fn();
    close = vi.fn(async () => undefined);
  }
}));

const USERS: Record<string, { sub: string; role: string; email: string }> = {
  admin: { sub: 'u_admin', role: 'TENANT_ADMIN', email: 'admin@northwind.test' },
  staff: { sub: 'u_staff', role: 'TENANT_STAFF', email: 'ops@northwind.test' },
  customer: { sub: 'u_cust', role: 'CUSTOMER_USER', email: 'buyer@acme.test' }
};
vi.mock('../../shared/middleware/authenticate.js', () => ({
  authenticate: async (request: { headers: Record<string, unknown>; user?: unknown; tenant?: unknown }) => {
    request.user = { ...USERS[String(request.headers['x-test-user'] ?? 'admin')], tenantId: 'tenant_a' };
    request.tenant = { id: 'tenant_a', slug: 'northwind', name: 'Northwind' };
  }
}));
vi.mock('../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = { user: { id: 'pu_support', email: 'sam@fauward.com', name: 'Sam Support', status: 'ACTIVE', mfaEnabled: true }, session: { id: 'ps_1', mfaVerifiedAt: new Date() } };
  }
}));
vi.mock('../../middleware/require-platform-csrf.js', () => ({ requirePlatformCsrf: async () => undefined }));
vi.mock('../../services/staff-iam.service.js', () => ({
  consolePermissionContext: vi.fn(async () => ({ staff: null, roles: [], rolePermissions: new Set(['customer.support.read', 'customer.support.write']), jit: new Map(), permissions: [] }))
}));

function matches(row: Row, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'OR') return (condition as Array<Record<string, unknown>>).some((branch) => matches(row, branch));
    const value = row[key];
    if (condition === null) return value === null || value === undefined;
    if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
      const ops = condition as { in?: unknown[]; not?: unknown; contains?: string; startsWith?: string };
      if (ops.in) return ops.in.includes(value);
      if ('not' in ops) return ops.not === null ? value !== null && value !== undefined : value !== ops.not;
      if (ops.contains !== undefined) return String(value ?? '').toLowerCase().includes(ops.contains.toLowerCase());
      if (ops.startsWith !== undefined) return String(value ?? '').startsWith(ops.startsWith);
      return true;
    }
    return value === condition;
  });
}

function createStore() {
  const tickets: Row[] = [];
  const messages: Row[] = [];
  const inApp: Row[] = [];
  const staffNotifications: Row[] = [];
  const activity: Row[] = [];
  let seq = 0;
  const id = (prefix: string) => `${prefix}_${(seq += 1)}`;
  const tenant = { id: 'tenant_a', name: 'Northwind', slug: 'northwind' };
  const users = [
    { id: 'u_admin', tenantId: 'tenant_a', email: 'admin@northwind.test', firstName: 'Ada', lastName: 'Admin', role: 'TENANT_ADMIN', isActive: true },
    { id: 'u_staff', tenantId: 'tenant_a', email: 'ops@northwind.test', firstName: 'Olu', lastName: 'Ops', role: 'TENANT_STAFF', isActive: true },
    { id: 'u_cust', tenantId: 'tenant_a', email: 'buyer@acme.test', firstName: 'Bea', lastName: 'Buyer', role: 'CUSTOMER_USER', isActive: true }
  ];
  const author = (row: Row) => {
    const user = users.find((item) => item.id === row.authorId);
    return user ? { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role } : null;
  };
  const withIncludes = (ticket: Row | undefined, include?: Record<string, unknown>) => {
    if (!ticket) return null;
    const out: Row = { ...ticket };
    if (include?.tenant) out.tenant = tenant;
    if (include?.messages) {
      const spec = include.messages as { where?: Record<string, unknown>; take?: number; orderBy?: { createdAt: 'asc' | 'desc' } };
      let list = messages.filter((message) => message.ticketId === ticket.id && matches(message, spec.where ?? {}));
      list.sort((a, b) => (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime());
      if (spec.orderBy?.createdAt === 'desc') list = list.reverse();
      if (spec.take) list = list.slice(0, spec.take);
      out.messages = list.map((message) => ({ ...message, author: author(message) }));
    }
    if (include?.linkedTicket) {
      const linked = tickets.find((item) => item.id === ticket.linkedTicketId);
      out.linkedTicket = linked ? { id: linked.id, ticketNumber: linked.ticketNumber, status: linked.status, audience: linked.audience, subject: linked.subject } : null;
    }
    for (const key of ['customer', 'assignee', 'shipment']) if (include?.[key]) out[key] = null;
    return out;
  };
  const createTicket = ({ data }: { data: Record<string, unknown> }) => {
    const { messages: nested, ...fields } = data as { messages?: { create: Record<string, unknown> } } & Record<string, unknown>;
    const now = new Date();
    const ticket: Row = { id: id('tkt'), status: 'OPEN', priority: 'NORMAL', assignedTo: null, assignedPlatformUserId: null, linkedTicketId: null, firstResponseAt: null, slaBreachedAt: null, resolvedAt: null, closedAt: null, lastMessageAt: null, lastMessageAuthorType: null, customerId: null, shipmentId: null, createdAt: now, updatedAt: now, ...fields };
    tickets.push(ticket);
    if (nested) messages.push({ id: id('msg'), ticketId: ticket.id, authorId: null, platformAuthorId: null, visibility: 'PUBLIC', createdAt: now, ...nested.create });
    return { ...ticket };
  };
  const prisma: Record<string, unknown> = {
    tenant: { findUnique: vi.fn(async () => tenant), findMany: vi.fn(async () => [tenant]) },
    supportTicket: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => createTicket(args)),
      findFirst: vi.fn(async ({ where, include }: { where: Record<string, unknown>; include?: Record<string, unknown> }) => withIncludes(tickets.find((ticket) => matches(ticket, where)), include)),
      findMany: vi.fn(async ({ where, include, take }: { where?: Record<string, unknown>; include?: Record<string, unknown>; take?: number }) =>
        tickets
          .filter((ticket) => matches(ticket, where ?? {}))
          .sort((a, b) => ((b.lastMessageAt as Date | null)?.getTime() ?? 0) - ((a.lastMessageAt as Date | null)?.getTime() ?? 0))
          .slice(0, take ?? 1000)
          .map((ticket) => withIncludes(ticket, include))
      ),
      count: vi.fn(async ({ where }: { where?: Record<string, unknown> }) => tickets.filter((ticket) => matches(ticket, where ?? {})).length),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const ticket = tickets.find((item) => item.id === where.id)!;
        Object.assign(ticket, data, data.updatedAt ? {} : { updatedAt: new Date() });
        return { ...ticket };
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const hits = tickets.filter((ticket) => matches(ticket, where));
        for (const ticket of hits) Object.assign(ticket, data);
        return { count: hits.length };
      }),
      groupBy: vi.fn(async () => [])
    },
    ticketMessage: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const message: Row = { id: id('msg'), createdAt: new Date(), ...data };
        messages.push(message);
        return { ...message };
      }),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => messages.filter((message) => matches(message, where)).map((message) => ({ ...message, author: author(message) })))
    },
    user: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => users.find((user) => matches(user, where)) ?? null),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => users.filter((user) => matches(user, where)).map((user) => ({ id: user.id, email: user.email })))
    },
    inAppNotification: { createMany: vi.fn(async ({ data }: { data: Row[] }) => inApp.push(...data)) },
    staffUser: { findMany: vi.fn(async () => [{ platformUserId: 'pu_support' }, { platformUserId: 'pu_lead' }]) },
    staffNotification: { createMany: vi.fn(async ({ data }: { data: Row[] }) => staffNotifications.push(...data)) },
    platformUser: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.map((pid) => ({ id: pid, email: `${pid}@fauward.com`, name: pid === 'pu_support' ? 'Sam Support' : null }))),
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id }))
    },
    shipment: { findFirst: vi.fn(async () => null) },
    platformActivity: {
      upsert: vi.fn(async ({ where, create }: { where: { dedupeKey: string }; create: Row }) => {
        const existing = activity.find((row) => row.dedupeKey === where.dedupeKey);
        if (existing) return existing;
        const row = { ...create, id: id('act') };
        activity.push(row);
        return row;
      })
    }
  };
  prisma.$transaction = vi.fn(async (callback: (tx: unknown) => unknown) => callback(prisma));
  return { prisma, tickets, messages, inApp, staffNotifications, activity };
}

let store: ReturnType<typeof createStore>;
let app: FastifyInstance;

async function buildApp() {
  const instance = Fastify();
  instance.decorate('prisma', store.prisma as never);
  instance.decorate('redis', { publish: vi.fn(async () => 1) } as never);
  const { registerSupportRoutes } = await import('./support.routes.js');
  const { registerFauwardTicketRoutes } = await import('./fauward-tickets.routes.js');
  const { registerConsoleSupportRoutes } = await import('../internal/customer/support.routes.js');
  await registerSupportRoutes(instance);
  await registerFauwardTicketRoutes(instance);
  await registerConsoleSupportRoutes(instance);
  await instance.ready();
  return instance;
}

function tenant(user: keyof typeof USERS, method: 'GET' | 'POST' | 'PATCH', url: string, payload?: Record<string, unknown>) {
  return app.inject({ method, url, headers: { 'x-test-user': user }, ...(payload ? { payload } : {}) });
}
function console_(method: 'GET' | 'POST' | 'PATCH', url: string, payload?: Record<string, unknown>) {
  return app.inject({ method, url, ...(payload ? { payload } : {}) });
}

async function openPlatformTicket(priority = 'NORMAL') {
  const response = await tenant('admin', 'POST', '/api/v1/tenants/me/fauward-tickets', { subject: 'Labels print blank', category: 'OTHER', priority, body: 'Every label we print since this morning comes out blank.' });
  expect(response.statusCode).toBe(201);
  return response.json().ticket as { id: string; ticketNumber: string };
}

beforeEach(async () => {
  queueAdd.mockClear();
  store = createStore();
  app = await buildApp();
});

afterEach(async () => {
  await app.close();
});

describe('L1 support loop (WP-2.3)', () => {
  it('ACC-SUP-1 a tenant PLATFORM ticket lands in the console queue, notifies support staff and records activity', async () => {
    const ticket = await openPlatformTicket();
    expect(ticket.ticketNumber).toMatch(/^NORTHWIND-FWD-\d{6}-0001$/);
    const queue = (await console_('GET', '/api/internal/support/tickets')).json();
    expect(queue.data.map((row: { id: string }) => row.id)).toEqual([ticket.id]);
    expect(queue.data[0]).toMatchObject({ tenant: { id: 'tenant_a', name: 'Northwind', slug: 'northwind' }, lastMessageAuthorType: 'TENANT_USER' });
    expect(store.staffNotifications.map((row) => row.platformUserId)).toEqual(['pu_support', 'pu_lead']);
    expect(store.activity).toEqual([expect.objectContaining({ service: 'customer.support', type: 'ticket.created', tenantId: 'tenant_a', dedupeKey: `ticket.created:${ticket.id}` })]);
  });

  it('ACC-SUP-6 the console queue never lists END_CUSTOMER tickets', async () => {
    await tenant('customer', 'POST', '/api/v1/support/tickets', { subject: 'Where is my parcel?', message: 'It was due yesterday.' });
    const platform = await openPlatformTicket();
    const queue = (await console_('GET', '/api/internal/support/tickets')).json();
    expect(queue.data.map((row: { id: string }) => row.id)).toEqual([platform.id]);
    expect((await console_('GET', `/api/internal/support/tickets/${store.tickets[0].id}`)).statusCode).toBe(404);
  });

  it('ACC-SUP-2 ACC-L1-1 a PUBLIC staff reply reaches the tenant as "Fauward Support", sets firstResponseAt and queues the email', async () => {
    const ticket = await openPlatformTicket();
    queueAdd.mockClear();
    const reply = await console_('POST', `/api/internal/support/tickets/${ticket.id}/messages`, { body: 'We have reproduced it and are deploying a fix.', visibility: 'PUBLIC' });
    expect(reply.statusCode).toBe(201);
    expect(reply.json().ticket.firstResponseAt).not.toBeNull();
    const thread = (await tenant('staff', 'GET', `/api/v1/tenants/me/fauward-tickets/${ticket.id}`)).json();
    expect(thread.messages.map((message: { authorLabel: string }) => message.authorLabel)).toEqual(['Ada Admin', 'Fauward Support']);
    expect(thread.ticket.awaitingYou).toBe(true);
    const emails = queueAdd.mock.calls.map(([, data]) => data);
    expect(emails).toEqual([expect.objectContaining({ tenantId: 'tenant_a', to: 'admin@northwind.test', template: 'support_reply_from_fauward' })]);
    expect(store.inApp.filter((row) => row.type === 'support.reply_from_fauward').map((row) => row.userId)).toEqual(['u_admin', 'u_admin']);
    expect(store.activity.map((row) => row.type)).toContain('ticket.replied.staff');
  });

  it('ACC-SUP-3 ACC-L1-2 STAFF_INTERNAL never reaches tenant routes; TENANT_INTERNAL never reaches end customers', async () => {
    const ticket = await openPlatformTicket();
    await console_('POST', `/api/internal/support/tickets/${ticket.id}/messages`, { body: 'Internal: tenant is on the legacy label printer driver.', visibility: 'STAFF_INTERNAL' });
    const tenantView = await tenant('admin', 'GET', `/api/v1/tenants/me/fauward-tickets/${ticket.id}`);
    expect(tenantView.body).not.toContain('legacy label printer');
    expect((await tenant('admin', 'GET', `/api/v1/support/tickets/${ticket.id}`)).statusCode).toBe(404);
    const consoleView = (await console_('GET', `/api/internal/support/tickets/${ticket.id}`)).json();
    expect(consoleView.messages.map((message: { visibility: string }) => message.visibility)).toEqual(['PUBLIC', 'STAFF_INTERNAL']);

    const created = (await tenant('customer', 'POST', '/api/v1/support/tickets', { subject: 'Damaged box', message: 'The box arrived crushed.' })).json();
    await tenant('staff', 'POST', `/api/v1/support/tickets/${created.id}/messages`, { body: 'Internal: courier says it left the depot intact.', isInternal: true });
    await tenant('staff', 'POST', `/api/v1/support/tickets/${created.id}/messages`, { body: 'Sorry about that, a replacement is on its way.' });
    const customerView = (await tenant('customer', 'GET', `/api/v1/support/tickets/${created.id}`)).json();
    expect(customerView.messages.map((message: { body: string }) => message.body)).toEqual(['The box arrived crushed.', 'Sorry about that, a replacement is on its way.']);
    const staffView = (await tenant('staff', 'GET', `/api/v1/support/tickets/${created.id}`)).json();
    expect(staffView.messages).toHaveLength(3);
  });

  it('ACC-SUP-4 every message bumps updatedAt and lastMessageAt', async () => {
    const ticket = await openPlatformTicket();
    const row = () => store.tickets.find((item) => item.id === ticket.id)!;
    const before = { updated: row().updatedAt as Date, last: row().lastMessageAt as Date };
    await new Promise((resolve) => setTimeout(resolve, 5));
    await console_('POST', `/api/internal/support/tickets/${ticket.id}/messages`, { body: 'Looking now.' });
    const afterStaff = { updated: row().updatedAt as Date, last: row().lastMessageAt as Date };
    expect(afterStaff.updated.getTime()).toBeGreaterThan(before.updated.getTime());
    expect(afterStaff.last.getTime()).toBeGreaterThan(before.last.getTime());
    expect(row().lastMessageAuthorType).toBe('STAFF');
    await new Promise((resolve) => setTimeout(resolve, 5));
    await tenant('admin', 'POST', `/api/v1/tenants/me/fauward-tickets/${ticket.id}/messages`, { body: 'Thanks — still blank on our side.' });
    expect((row().lastMessageAt as Date).getTime()).toBeGreaterThan(afterStaff.last.getTime());
    expect(row().lastMessageAuthorType).toBe('TENANT_USER');
  });

  it('ACC-SUP-5 escalating a customer ticket creates a linked PLATFORM ticket visible on both sides', async () => {
    const source = (await tenant('customer', 'POST', '/api/v1/support/tickets', { subject: 'Charged twice', message: 'My card was charged twice for one shipment.' })).json();
    await tenant('staff', 'POST', `/api/v1/support/tickets/${source.id}/messages`, { body: 'Internal: payment gateway shows two captures.', isInternal: true });
    const escalated = await tenant('admin', 'POST', `/api/v1/support/tickets/${source.id}/escalate-to-fauward`, { reason: 'The payment gateway captured the payment twice; we need Fauward to check the integration.' });
    expect(escalated.statusCode).toBe(201);
    const platformId = escalated.json().ticket.id as string;
    expect(store.tickets.find((row) => row.id === source.id)!.linkedTicketId).toBe(platformId);

    const consoleView = (await console_('GET', `/api/internal/support/tickets/${platformId}`)).json();
    expect(consoleView.linkedTicket).toMatchObject({ id: source.id, audience: 'END_CUSTOMER' });
    expect(consoleView.linkedTicket.messages.map((message: { visibility: string }) => message.visibility)).toEqual(['PUBLIC', 'TENANT_INTERNAL']);
    expect(consoleView.messages[0].body).not.toContain('payment gateway shows two captures');

    expect((await tenant('staff', 'GET', `/api/v1/support/tickets/${source.id}`)).json().linkedTicket).toMatchObject({ id: platformId, audience: 'PLATFORM' });
    expect((await tenant('customer', 'GET', `/api/v1/support/tickets/${source.id}`)).json().linkedTicket).toBeNull();
    expect((await tenant('admin', 'GET', `/api/v1/tenants/me/fauward-tickets/${platformId}`)).json().ticket.linkedTicket).toMatchObject({ id: source.id });
    expect(store.activity.map((row) => row.type)).toContain('ticket.escalated');
    expect((await tenant('admin', 'POST', `/api/v1/support/tickets/${source.id}/escalate-to-fauward`, { reason: 'Second attempt at escalating this ticket.' })).statusCode).toBe(409);
  });

  it('ACC-SUP-7 an SLA breach is reported once, to the assignee or support writers', async () => {
    const ticket = await openPlatformTicket('URGENT');
    store.tickets[0].createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    store.staffNotifications.length = 0;
    const { sweepSupportSla } = await import('../../jobs/support-sla-sweep.js');
    const first = await sweepSupportSla(app as never);
    expect(first).toEqual({ checked: 1, breached: 1 });
    expect(store.staffNotifications.map((row) => row.event)).toEqual(['ticket.sla_breached', 'ticket.sla_breached']);
    expect(store.activity.filter((row) => row.type === 'ticket.sla_breached')).toEqual([expect.objectContaining({ subjectId: ticket.id, severity: 'ATTENTION' })]);
    const second = await sweepSupportSla(app as never);
    expect(second).toEqual({ checked: 0, breached: 0 });
    expect(store.staffNotifications).toHaveLength(2);
    expect((await console_('GET', '/api/internal/support/tickets?breached=true')).json().data).toHaveLength(1);
  });

  it('resolving from the console notifies the requester; a tenant reply reopens the ticket', async () => {
    const ticket = await openPlatformTicket();
    queueAdd.mockClear();
    const resolved = await console_('PATCH', `/api/internal/support/tickets/${ticket.id}`, { status: 'RESOLVED' });
    expect(resolved.json().ticket.status).toBe('RESOLVED');
    expect(queueAdd.mock.calls.map(([, data]) => data)).toEqual([expect.objectContaining({ template: 'ticket_resolved', to: 'admin@northwind.test' })]);
    await tenant('admin', 'POST', `/api/v1/tenants/me/fauward-tickets/${ticket.id}/messages`, { body: 'Not fixed for us yet.' });
    expect(store.tickets[0].status).toBe('OPEN');
    expect(store.activity.map((row) => row.type)).toEqual(expect.arrayContaining(['ticket.status_changed', 'ticket.replied.tenant']));
  });

  it('customers cannot open tickets to Fauward; macros and SLA targets are served', async () => {
    expect((await tenant('customer', 'POST', '/api/v1/tenants/me/fauward-tickets', { subject: 'Hello there', body: 'Trying to reach Fauward directly.' })).statusCode).toBe(403);
    expect((await console_('GET', '/api/internal/support/macros')).json().data.length).toBeGreaterThan(0);
    const sla = (await console_('GET', '/api/internal/support/sla')).json();
    expect(sla.targets.find((target: { priority: string }) => target.priority === 'URGENT')).toEqual({ priority: 'URGENT', firstResponseMinutes: 60, resolutionMinutes: 480 });
  });
});

// ACC-L1-1 end to end on the VM slot: the reply email the console queued is delivered by the real worker over SMTP and
// lands in Mailpit. Runs when MAILPIT_SMTP_URL and MAILPIT_API_URL are set; CI skips it.
describe.runIf(process.env.MAILPIT_SMTP_URL && process.env.MAILPIT_API_URL)('L1 reply email reaches Mailpit', () => {
  it('ACC-L1-1 the staff reply email arrives in Mailpit', async () => {
    const ticket = await openPlatformTicket();
    queueAdd.mockClear();
    await console_('POST', `/api/internal/support/tickets/${ticket.id}/messages`, { body: 'Fixed: the label template was re-published.', visibility: 'PUBLIC' });
    const [, job] = queueAdd.mock.calls[0] as [string, Record<string, unknown>];
    const to = `acc-l1-1-${Date.now()}@fauward.test`;
    vi.resetModules();
    vi.stubEnv('SMTP_URL', process.env.MAILPIT_SMTP_URL ?? '');
    vi.stubEnv('SENDGRID_API_KEY', '');
    const { processNotificationJob } = await import('../notifications/notifications.worker.js');
    const log = await processNotificationJob(
      { prisma: { notificationLog: { create: vi.fn(async ({ data }: { data: Row }) => ({ ...data, id: 'log_1', status: 'QUEUED' })), update: vi.fn(async ({ data }: { data: Row }) => data), updateMany: vi.fn(async () => ({ count: 1 })), findUnique: vi.fn(async () => ({ status: 'SENT' })) }, usageRecord: { upsert: vi.fn(async () => ({})) }, tenantSettings: { findUnique: vi.fn(async () => null) } }, redis: {}, log: { warn: vi.fn(), error: vi.fn() } } as never,
      { id: null, name: 'email', data: { ...job, to } }
    );
    vi.unstubAllEnvs();
    expect(log).toMatchObject({ status: 'SENT' });
    const response = await fetch(`${process.env.MAILPIT_API_URL}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
    const body = (await response.json()) as { messages: Array<{ Subject: string }> };
    expect(body.messages.map((message) => message.Subject)).toEqual([`Fauward Support replied (${ticket.ticketNumber})`]);
  });
});
