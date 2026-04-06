import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';

type ReportFormat = 'csv' | 'json' | 'pdf';

const FUNNEL_STATUSES = [
  'PENDING',
  'PROCESSING',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'FAILED_DELIVERY',
  'RETURNED'
] as const;

function getTenantId(req: FastifyRequest, reply: FastifyReply): string | null {
  const tenantId = req.tenant?.id;
  if (!tenantId) {
    reply.status(400).send({ error: 'Tenant context required' });
    return null;
  }
  return tenantId;
}

function asAddressString(address: unknown): string {
  if (!address || typeof address !== 'object') return '';
  return Object.values(address as Record<string, unknown>)
    .filter(Boolean)
    .join(', ');
}

function parseDateRange(query: { dateFrom?: string; dateTo?: string }) {
  const now = new Date();
  const dateTo = query.dateTo ? new Date(query.dateTo) : now;
  const dateFrom = query.dateFrom
    ? new Date(query.dateFrom)
    : new Date(dateTo.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { dateFrom, dateTo };
}

function getPreviousRange(dateFrom: Date, dateTo: Date) {
  const duration = dateTo.getTime() - dateFrom.getTime();
  return {
    dateFrom: new Date(dateFrom.getTime() - duration),
    dateTo: new Date(dateTo.getTime() - 1)
  };
}

function changePct(value: number, previousValue: number) {
  if (previousValue === 0) return value === 0 ? 0 : 100;
  return ((value - previousValue) / previousValue) * 100;
}

function toCsv(rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const value = row[header];
          const text = value === null || value === undefined ? '' : String(value).replaceAll('"', '""');
          return `"${text}"`;
        })
        .join(',')
    )
  ];
  return lines.join('\n');
}

async function computeShipmentKpis(
  app: FastifyInstance,
  tenantId: string,
  dateFrom: Date,
  dateTo: Date
) {
  const settings = await app.prisma.tenantSettings.findUnique({ where: { tenantId } });
  const slaHours = settings?.slaDeliveryHours ?? 72;

  const delivered = await app.prisma.shipment.findMany({
    where: {
      tenantId,
      actualDelivery: { gte: dateFrom, lte: dateTo }
    },
    select: { id: true }
  });
  const deliveredIds = delivered.map((item) => item.id);
  if (deliveredIds.length === 0) {
    return {
      onTimeRate: 0,
      avgDeliveryDays: 0,
      sla: {
        onTime: 0,
        late: 0,
        compliancePct: 0,
        avgDeliveryHours: 0
      }
    };
  }

  const events = await app.prisma.shipmentEvent.findMany({
    where: {
      tenantId,
      shipmentId: { in: deliveredIds },
      status: { in: ['PROCESSING', 'DELIVERED', 'FAILED_DELIVERY', 'EXCEPTION'] }
    },
    orderBy: { timestamp: 'asc' }
  });

  const byShipment = new Map<string, { processing?: Date; delivered?: Date; failed?: boolean; exception?: boolean }>();
  for (const event of events) {
    if (!byShipment.has(event.shipmentId)) byShipment.set(event.shipmentId, {});
    const state = byShipment.get(event.shipmentId)!;
    if (event.status === 'PROCESSING' && !state.processing) state.processing = event.timestamp;
    if (event.status === 'DELIVERED' && !state.delivered) state.delivered = event.timestamp;
    if (event.status === 'FAILED_DELIVERY') state.failed = true;
    if (event.status === 'EXCEPTION') state.exception = true;
  }

  let onTime = 0;
  let late = 0;
  let totalHours = 0;
  let totalDays = 0;
  let measured = 0;
  let failedReason = 0;
  let exceptionReason = 0;

  for (const state of byShipment.values()) {
    if (!state.processing || !state.delivered) continue;
    const hours = (state.delivered.getTime() - state.processing.getTime()) / (1000 * 60 * 60);
    totalHours += hours;
    totalDays += hours / 24;
    measured += 1;
    if (hours <= slaHours) onTime += 1;
    else late += 1;
    if (state.failed) failedReason += 1;
    if (state.exception) exceptionReason += 1;
  }

  const compliancePct = measured > 0 ? (onTime / measured) * 100 : 0;

  return {
    onTimeRate: compliancePct,
    avgDeliveryDays: measured > 0 ? totalDays / measured : 0,
    sla: {
      onTime,
      late,
      compliancePct,
      avgDeliveryHours: measured > 0 ? totalHours / measured : 0,
      breachesByReason: [
        { reason: 'FAILED_DELIVERY', count: failedReason },
        { reason: 'EXCEPTION', count: exceptionReason }
      ]
    }
  };
}

async function getBaseMetrics(app: FastifyInstance, tenantId: string, dateFrom: Date, dateTo: Date) {
  const [shipmentsCount, revenueAggregate, shipmentKpis] = await Promise.all([
    app.prisma.shipment.count({ where: { tenantId, createdAt: { gte: dateFrom, lte: dateTo } } }),
    app.prisma.invoice.aggregate({
      where: { tenantId, createdAt: { gte: dateFrom, lte: dateTo } },
      _sum: { total: true }
    }),
    computeShipmentKpis(app, tenantId, dateFrom, dateTo)
  ]);

  return {
    shipments: shipmentsCount,
    revenue: Number(revenueAggregate._sum.total ?? 0),
    onTimeRate: shipmentKpis.onTimeRate,
    avgDeliveryDays: shipmentKpis.avgDeliveryDays,
    sla: shipmentKpis.sla
  };
}

async function getReportData(
  app: FastifyInstance,
  type: string,
  tenantId: string,
  range: { dateFrom: Date; dateTo: Date },
  query: Record<string, unknown>
) {
  if (type === 'shipments') {
    const statusParam = query.status;
    const statuses = Array.isArray(statusParam)
      ? (statusParam as string[])
      : typeof statusParam === 'string'
        ? statusParam.split(',').filter(Boolean)
        : [];
    return app.prisma.shipment.findMany({
      where: {
        tenantId,
        createdAt: { gte: range.dateFrom, lte: range.dateTo },
        status: statuses.length > 0 ? { in: statuses as any } : undefined,
        assignedDriverId: typeof query.driverId === 'string' ? query.driverId : undefined,
        customerId: typeof query.customerId === 'string' ? query.customerId : undefined
      },
      include: { organisation: true, driver: { include: { user: true } } },
      orderBy: { createdAt: 'desc' }
    });
  }
  if (type === 'revenue') {
    return app.prisma.invoice.findMany({
      where: { tenantId, createdAt: { gte: range.dateFrom, lte: range.dateTo } },
      include: { payments: true, organisation: true },
      orderBy: { createdAt: 'desc' }
    });
  }
  if (type === 'returns') {
    return app.prisma.returnRequest.findMany({
      where: { tenantId, createdAt: { gte: range.dateFrom, lte: range.dateTo } },
      include: { shipment: true, customer: true },
      orderBy: { createdAt: 'desc' }
    });
  }
  if (type === 'tickets') {
    return app.prisma.supportTicket.findMany({
      where: { tenantId, createdAt: { gte: range.dateFrom, lte: range.dateTo } },
      include: { customer: true, assignee: true, messages: true },
      orderBy: { createdAt: 'desc' }
    });
  }
  if (type === 'staff') {
    const drivers = await app.prisma.driver.findMany({
      where: { tenantId },
      include: { user: true, shipments: true, routeStops: true }
    });
    return drivers.map((driver) => ({
      driverId: driver.id,
      staffName: [driver.user.firstName, driver.user.lastName].filter(Boolean).join(' ') || driver.user.email,
      shipmentsHandled: driver.shipments.length,
      stopsAssigned: driver.routeStops.length,
      deliveriesCompleted: driver.routeStops.filter((stop) => Boolean(stop.completedAt)).length
    }));
  }
  if (type === 'customers') {
    const organisations = await app.prisma.organisation.findMany({
      where: { tenantId },
      include: { invoices: true, shipments: true }
    });
    return organisations.map((organisation) => ({
      organisationId: organisation.id,
      organisationName: organisation.name,
      totalRevenue: organisation.invoices.reduce((sum, invoice) => sum + Number(invoice.total), 0),
      totalShipments: organisation.shipments.length
    }));
  }
  return [];
}

async function sendReport(
  reply: FastifyReply,
  type: string,
  format: ReportFormat,
  dateFrom: string,
  dateTo: string,
  rows: Array<Record<string, unknown>>
) {
  if (format === 'json') {
    return reply.send(rows);
  }

  if (format === 'csv') {
    const csv = toCsv(rows);
    reply
      .header('Content-Type', 'text/csv')
      .header('Content-Disposition', `attachment; filename="fauward-report-${type}-${dateFrom}-${dateTo}.csv"`)
      .send(csv);
    return;
  }

  const html = `<!doctype html><html><body><h1>Fauward ${type} report</h1><pre>${JSON.stringify(rows, null, 2)}</pre></body></html>`;
  reply
    .header('Content-Type', 'application/pdf')
    .header('Content-Disposition', `attachment; filename="fauward-report-${type}-${dateFrom}-${dateTo}.pdf"`)
    .send(Buffer.from(html, 'utf-8'));
}

function getTimeframeStart(timeframe?: string) {
  const now = new Date();
  const mapping: Record<string, number> = {
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000
  };
  const windowMs = mapping[timeframe ?? '24h'] ?? mapping['24h'];
  return new Date(now.getTime() - windowMs);
}

export async function registerAnalyticsRoutes(app: FastifyInstance) {
  app.get('/api/v1/analytics/full', { preHandler: [authenticate] }, async (req, reply) => {
    const tenantId = getTenantId(req, reply);
    if (!tenantId) return;
    const range = parseDateRange(req.query as { dateFrom?: string; dateTo?: string });
    const previousRange = getPreviousRange(range.dateFrom, range.dateTo);

    const [current, previous] = await Promise.all([
      getBaseMetrics(app, tenantId, range.dateFrom, range.dateTo),
      getBaseMetrics(app, tenantId, previousRange.dateFrom, previousRange.dateTo)
    ]);

    const totals = {
      shipments: {
        value: current.shipments,
        previousValue: previous.shipments,
        changePct: changePct(current.shipments, previous.shipments)
      },
      revenue: {
        value: current.revenue,
        previousValue: previous.revenue,
        changePct: changePct(current.revenue, previous.revenue)
      },
      onTimeRate: {
        value: current.onTimeRate,
        previousValue: previous.onTimeRate,
        changePct: changePct(current.onTimeRate, previous.onTimeRate)
      },
      avgDeliveryDays: {
        value: current.avgDeliveryDays,
        previousValue: previous.avgDeliveryDays,
        changePct: changePct(current.avgDeliveryDays, previous.avgDeliveryDays)
      }
    };

    const [volumeByDay, revenueByDay] = await Promise.all([
      app.prisma.$queryRaw<{ date: string; count: number }[]>`
        SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') as date,
               COUNT(*)::int as count
        FROM shipments
        WHERE "tenantId" = ${tenantId}
          AND "createdAt" BETWEEN ${range.dateFrom} AND ${range.dateTo}
        GROUP BY 1
        ORDER BY 1 ASC;
      `,
      app.prisma.$queryRaw<{ date: string; amount: number }[]>`
        SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') as date,
               COALESCE(SUM(total), 0)::float as amount
        FROM invoices
        WHERE "tenantId" = ${tenantId}
          AND "createdAt" BETWEEN ${range.dateFrom} AND ${range.dateTo}
        GROUP BY 1
        ORDER BY 1 ASC;
      `
    ]);

    reply.send({ totals, volumeByDay, revenueByDay });
  });

  app.get('/api/v1/analytics/shipments', { preHandler: [authenticate] }, async (req, reply) => {
    const tenantId = getTenantId(req, reply);
    if (!tenantId) return;
    const range = parseDateRange(req.query as { dateFrom?: string; dateTo?: string });

    const events = await app.prisma.shipmentEvent.findMany({
      where: {
        tenantId,
        timestamp: { gte: range.dateFrom, lte: range.dateTo },
        status: { in: [...FUNNEL_STATUSES] as unknown as string[] }
      },
      select: { shipmentId: true, status: true }
    });

    const reached = new Map<string, Set<string>>();
    for (const event of events) {
      if (!reached.has(event.shipmentId)) reached.set(event.shipmentId, new Set());
      reached.get(event.shipmentId)!.add(event.status);
    }
    const base = reached.size || 1;

    const lifecycleFunnel = FUNNEL_STATUSES.map((status) => {
      const count = [...reached.values()].filter((set) => set.has(status)).length;
      return {
        status,
        count,
        pct: Number(((count / base) * 100).toFixed(1))
      };
    });

    const kpis = await getBaseMetrics(app, tenantId, range.dateFrom, range.dateTo);

    const activeExceptions = await app.prisma.shipment.count({
      where: { tenantId, status: 'EXCEPTION' }
    });
    const stalePendingOver24h = await app.prisma.shipment.count({
      where: {
        tenantId,
        status: 'PENDING',
        createdAt: { lte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }
    });
    const outForDeliveryCount = await app.prisma.shipmentEvent.count({
      where: {
        tenantId,
        status: 'OUT_FOR_DELIVERY',
        timestamp: { gte: range.dateFrom, lte: range.dateTo }
      }
    });
    const failedDeliveryCount = await app.prisma.shipmentEvent.count({
      where: {
        tenantId,
        status: 'FAILED_DELIVERY',
        timestamp: { gte: range.dateFrom, lte: range.dateTo }
      }
    });
    const failedDeliveryRate =
      outForDeliveryCount > 0 ? (failedDeliveryCount / outForDeliveryCount) * 100 : 0;

    const exceptionShipments = await app.prisma.shipment.findMany({
      where: { tenantId, status: 'EXCEPTION' },
      select: { originAddress: true, destinationAddress: true },
      take: 500
    });
    const routeCounts = new Map<string, number>();
    for (const shipment of exceptionShipments) {
      const route = `${asAddressString(shipment.originAddress)} -> ${asAddressString(shipment.destinationAddress)}`;
      routeCounts.set(route, (routeCounts.get(route) ?? 0) + 1);
    }
    const topExceptionRoutes = [...routeCounts.entries()]
      .map(([route, count]) => ({ route, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    reply.send({
      lifecycleFunnel,
      slaCompliance: {
        onTime: kpis.sla.onTime,
        late: kpis.sla.late,
        compliancePct: Number(kpis.sla.compliancePct.toFixed(1)),
        avgDeliveryHours: Number(kpis.sla.avgDeliveryHours.toFixed(1)),
        breachesByReason: kpis.sla.breachesByReason
      },
      exceptions: {
        activeExceptions,
        stalePendingOver24h,
        failedDeliveryRate: Number(failedDeliveryRate.toFixed(1)),
        topExceptionRoutes
      }
    });
  });

  app.get('/api/v1/analytics/revenue', { preHandler: [authenticate] }, async (req, reply) => {
    const tenantId = getTenantId(req, reply);
    if (!tenantId) return;
    const range = parseDateRange(req.query as { dateFrom?: string; dateTo?: string });

    const [invoices, shipments] = await Promise.all([
      app.prisma.invoice.findMany({
        where: {
          tenantId,
          createdAt: { gte: range.dateFrom, lte: range.dateTo }
        },
        include: { organisation: true }
      }),
      app.prisma.shipment.findMany({
        where: {
          tenantId,
          createdAt: { gte: range.dateFrom, lte: range.dateTo }
        },
        select: { id: true, serviceTier: true, price: true }
      })
    ]);

    const serviceTierRevenue = new Map<string, number>();
    for (const shipment of shipments) {
      const tier = shipment.serviceTier || 'STANDARD';
      serviceTierRevenue.set(tier, (serviceTierRevenue.get(tier) ?? 0) + Number(shipment.price ?? 0));
    }

    const customerRevenue = new Map<string, { customerId: string; customerName: string; revenue: number }>();
    for (const invoice of invoices) {
      const customerId = invoice.organisationId ?? invoice.customerId ?? 'unknown';
      const customerName = invoice.organisation?.name ?? 'Unknown customer';
      const current = customerRevenue.get(customerId) ?? { customerId, customerName, revenue: 0 };
      current.revenue += Number(invoice.total ?? 0);
      customerRevenue.set(customerId, current);
    }

    const totalInvoiced = invoices.reduce((sum, invoice) => sum + Number(invoice.total ?? 0), 0);
    const paidInvoices = invoices.filter((invoice) => invoice.status === 'PAID');
    const paidTotal = paidInvoices.reduce((sum, invoice) => sum + Number(invoice.total ?? 0), 0);

    reply.send({
      byServiceTier: [...serviceTierRevenue.entries()].map(([serviceTier, revenue]) => ({
        serviceTier,
        revenue: Number(revenue.toFixed(2))
      })),
      topCustomers: [...customerRevenue.values()]
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10)
        .map((entry) => ({ ...entry, revenue: Number(entry.revenue.toFixed(2)) })),
      collectionRate: totalInvoiced > 0 ? Number(((paidTotal / totalInvoiced) * 100).toFixed(2)) : 0
    });
  });

  app.get('/api/v1/analytics/staff', { preHandler: [authenticate] }, async (req, reply) => {
    const tenantId = getTenantId(req, reply);
    if (!tenantId) return;
    const range = parseDateRange(req.query as { dateFrom?: string; dateTo?: string });

    const drivers = await app.prisma.driver.findMany({
      where: { tenantId },
      include: {
        user: true,
        shipments: {
          where: { createdAt: { gte: range.dateFrom, lte: range.dateTo } }
        },
        routeStops: {
          where: {
            completedAt: { gte: range.dateFrom, lte: range.dateTo }
          }
        }
      }
    });

    const rows = drivers.map((driver) => {
      const completedStops = driver.routeStops.filter((stop) => Boolean(stop.completedAt));
      const avgHandleMinutes =
        completedStops.length > 0
          ? completedStops.reduce((sum, stop) => {
              if (!stop.arrivedAt || !stop.completedAt) return sum;
              return sum + (stop.completedAt.getTime() - stop.arrivedAt.getTime()) / (1000 * 60);
            }, 0) / completedStops.length
          : 0;

      return {
        staffId: driver.userId,
        staffName: [driver.user.firstName, driver.user.lastName].filter(Boolean).join(' ') || driver.user.email,
        role: driver.user.role,
        shipmentsProcessed: driver.shipments.length,
        completedStops: completedStops.length,
        avgHandleMinutes: Number(avgHandleMinutes.toFixed(1))
      };
    });

    reply.send({ data: rows });
  });

  app.get('/api/v1/analytics/export/csv', { preHandler: [authenticate] }, async (req, reply) => {
    const tenantId = getTenantId(req, reply);
    if (!tenantId) return;
    const role = req.user?.role;
    if (!role || !['TENANT_ADMIN', 'TENANT_MANAGER', 'TENANT_FINANCE'].includes(role)) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const range = parseDateRange(req.query as { dateFrom?: string; dateTo?: string });
    const shipments = await app.prisma.shipment.findMany({
      where: { tenantId, createdAt: { gte: range.dateFrom, lte: range.dateTo } },
      include: { organisation: true, driver: { include: { user: true } } },
      orderBy: { createdAt: 'desc' }
    });

    const rows = shipments.map((shipment) => ({
      trackingNumber: shipment.trackingNumber,
      status: shipment.status,
      serviceTier: shipment.serviceTier,
      customer: shipment.organisation?.name ?? '',
      driver:
        [shipment.driver?.user.firstName, shipment.driver?.user.lastName].filter(Boolean).join(' ') ||
        shipment.driver?.user.email ||
        '',
      price: Number(shipment.price ?? 0),
      currency: shipment.currency,
      createdAt: shipment.createdAt.toISOString(),
      estimatedDelivery: shipment.estimatedDelivery?.toISOString() ?? '',
      actualDelivery: shipment.actualDelivery?.toISOString() ?? ''
    }));

    reply
      .header('Content-Type', 'text/csv')
      .header(
        'Content-Disposition',
        `attachment; filename=\"fauward-shipments-${range.dateFrom.toISOString().slice(0, 10)}-${range.dateTo
          .toISOString()
          .slice(0, 10)}.csv\"`
      )
      .send(toCsv(rows));
  });

  app.get('/api/v1/activity', { preHandler: [authenticate] }, async (req, reply) => {
    const tenantId = getTenantId(req, reply);
    if (!tenantId) return;
    const { timeframe = '24h', type } = req.query as {
      timeframe?: '1h' | '24h' | '7d' | '30d';
      type?: 'shipment' | 'return' | 'ticket' | 'invoice' | 'audit';
    };
    const from = getTimeframeStart(timeframe);

    const [shipmentEvents, auditEvents, returnEvents, ticketEvents, invoiceEvents] = await Promise.all([
      app.prisma.shipmentEvent.findMany({
        where: { tenantId, timestamp: { gte: from } },
        include: { shipment: { select: { id: true, trackingNumber: true } } },
        orderBy: { timestamp: 'desc' },
        take: 100
      }),
      app.prisma.auditLog.findMany({
        where: { tenantId, timestamp: { gte: from } },
        orderBy: { timestamp: 'desc' },
        take: 100
      }),
      app.prisma.returnRequest.findMany({
        where: { tenantId, updatedAt: { gte: from } },
        include: { shipment: { select: { id: true, trackingNumber: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 100
      }),
      app.prisma.ticketMessage.findMany({
        where: { tenantId, createdAt: { gte: from } },
        include: { ticket: { select: { id: true, ticketNumber: true, subject: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100
      }),
      app.prisma.invoice.findMany({
        where: {
          tenantId,
          OR: [{ sentAt: { gte: from } }, { paidAt: { gte: from } }]
        },
        orderBy: { updatedAt: 'desc' },
        take: 100
      })
    ]);

    const entries = [
      ...shipmentEvents.map((event) => ({
        id: event.id,
        type: 'shipment',
        title: `Shipment ${event.shipment?.trackingNumber ?? event.shipmentId} ${event.status.toLowerCase()}`,
        subtitle: event.notes ?? 'Status update',
        link: `/shipments/${event.shipmentId}`,
        timestamp: event.timestamp,
        icon: 'truck',
        colour: 'blue'
      })),
      ...auditEvents.map((event) => ({
        id: event.id,
        type: 'audit',
        title: event.action,
        subtitle: event.resourceType ?? 'Audit event',
        link: '/audit',
        timestamp: event.timestamp,
        icon: 'shield',
        colour: 'slate'
      })),
      ...returnEvents.map((event) => ({
        id: event.id,
        type: 'return',
        title: `Return ${event.status.toLowerCase()}`,
        subtitle: event.shipment?.trackingNumber ?? event.id,
        link: `/returns/${event.id}`,
        timestamp: event.updatedAt,
        icon: 'rotate-ccw',
        colour: 'amber'
      })),
      ...ticketEvents.map((event) => ({
        id: event.id,
        type: 'ticket',
        title: `Ticket ${event.ticket.ticketNumber} message`,
        subtitle: event.ticket.subject,
        link: `/support/${event.ticket.id}`,
        timestamp: event.createdAt,
        icon: 'message-square',
        colour: 'emerald'
      })),
      ...invoiceEvents.map((invoice) => ({
        id: invoice.id,
        type: 'invoice',
        title: `Invoice ${invoice.invoiceNumber} ${invoice.status.toLowerCase()}`,
        subtitle: `${Number(invoice.total).toFixed(2)} ${invoice.currency}`,
        link: `/finance/${invoice.id}`,
        timestamp: invoice.paidAt ?? invoice.sentAt ?? invoice.updatedAt,
        icon: 'file-text',
        colour: 'violet'
      }))
    ]
      .filter((entry) => !type || entry.type === type)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 100)
      .map((entry) => ({ ...entry, timestamp: entry.timestamp.toISOString() }));

    reply.send({ entries });
  });

  const reportTypes = ['shipments', 'revenue', 'returns', 'tickets', 'staff', 'customers'] as const;
  for (const type of reportTypes) {
    app.get(`/api/v1/reports/${type}`, { preHandler: [authenticate] }, async (req, reply) => {
      const tenantId = getTenantId(req, reply);
      if (!tenantId) return;
      const { format = 'csv' } = req.query as { format?: ReportFormat };
      const { dateFrom, dateTo } = parseDateRange(req.query as { dateFrom?: string; dateTo?: string });
      const rows = (await getReportData(app, type, tenantId, { dateFrom, dateTo }, req.query as Record<string, unknown>)) as Array<
        Record<string, unknown>
      >;
      await sendReport(
        reply,
        type,
        format,
        dateFrom.toISOString().slice(0, 10),
        dateTo.toISOString().slice(0, 10),
        rows
      );
    });
  }
}
