import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import QRCode from 'qrcode';
import { authenticate } from '../../shared/middleware/authenticate.js';

function escapeHtml(input: string) {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function toAddressString(address: unknown): string {
  if (!address || typeof address !== 'object') return '';
  const values = Object.values(address as Record<string, unknown>).filter(Boolean);
  return values.join(', ');
}

function buildLabelHtml(params: {
  tenantName: string;
  tenantLogo?: string | null;
  trackingNumber: string;
  serviceTier: string;
  senderAddress: string;
  recipientAddress: string;
  recipientName: string;
  weightKg: number;
  dimensions: string;
  qrCodeDataUrl: string;
  specialInstructions?: string | null;
}) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Label ${escapeHtml(params.trackingNumber)}</title>
    <style>
      :root { font-family: "JetBrains Mono", "Courier New", monospace; }
      body { margin: 0; padding: 8mm; width: 100mm; height: 150mm; box-sizing: border-box; color: #0f172a; }
      .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6mm; }
      .brand { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; }
      .tracking { font-size: 18px; font-weight: 800; margin: 4px 0; }
      .grid { display: grid; grid-template-columns: 1fr auto; gap: 4mm; }
      .label { font-size: 10px; color: #475569; margin-bottom: 2px; }
      .value { font-size: 11px; line-height: 1.35; }
      .service { display: inline-block; border: 1px solid #cbd5e1; border-radius: 999px; padding: 2px 8px; font-size: 10px; font-weight: 700; }
      .qr { width: 128px; height: 128px; border: 1px solid #e2e8f0; }
      .meta { margin-top: 6mm; display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; }
      .warn { margin-top: 4mm; border: 1px dashed #f97316; border-radius: 6px; padding: 3mm; font-size: 10px; font-weight: 700; color: #c2410c; text-transform: uppercase; text-align: center; }
      @media print {
        html, body { width: 100mm; height: 150mm; margin: 0; }
      }
    </style>
  </head>
  <body>
    <div class="header">
      <div>
        <div class="brand">${escapeHtml(params.tenantName)}</div>
        <div class="tracking">${escapeHtml(params.trackingNumber)}</div>
        <span class="service">${escapeHtml(params.serviceTier)}</span>
      </div>
      ${params.tenantLogo ? `<img src="${params.tenantLogo}" alt="logo" style="height:24px;max-width:72px;object-fit:contain;" />` : ''}
    </div>
    <div class="grid">
      <div>
        <div class="label">Sender</div>
        <div class="value">${escapeHtml(params.senderAddress)}</div>
        <div class="label" style="margin-top:4mm;">Recipient</div>
        <div class="value"><strong>${escapeHtml(params.recipientName)}</strong><br/>${escapeHtml(params.recipientAddress)}</div>
      </div>
      <img class="qr" src="${params.qrCodeDataUrl}" alt="qr" />
    </div>
    <div class="meta">
      <div>
        <div class="label">Weight</div>
        <div class="value">${escapeHtml(String(params.weightKg))} kg</div>
      </div>
      <div>
        <div class="label">Dimensions</div>
        <div class="value">${escapeHtml(params.dimensions)}</div>
      </div>
    </div>
    <div class="warn">${escapeHtml(params.specialInstructions || 'Do not bend')}</div>
  </body>
</html>`;
}

export async function registerLabelRoutes(app: FastifyInstance) {
  app.get('/api/v1/label/:trackingNumber', { preHandler: [authenticate] }, async (request, reply) => {
    const tenantId = request.tenant?.id;
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });

    const { trackingNumber } = request.params as { trackingNumber: string };
    const shipment = await app.prisma.shipment.findFirst({
      where: { tenantId, trackingNumber },
      include: {
        tenant: { select: { name: true, logoUrl: true } },
        organisation: { select: { name: true } },
        items: { take: 1, orderBy: { createdAt: 'asc' } }
      }
    });
    if (!shipment) return reply.status(404).send({ error: 'Shipment not found' });

    const qrCodeDataUrl = await QRCode.toDataURL(shipment.trackingNumber, { width: 128, margin: 0 });
    const firstItem = shipment.items[0];
    const dimensions = firstItem
      ? `${Number(firstItem.lengthCm ?? 0)} x ${Number(firstItem.widthCm ?? 0)} x ${Number(firstItem.heightCm ?? 0)} cm`
      : 'N/A';

    const html = buildLabelHtml({
      tenantName: shipment.tenant.name,
      tenantLogo: shipment.tenant.logoUrl,
      trackingNumber: shipment.trackingNumber,
      serviceTier: shipment.serviceTier,
      senderAddress: toAddressString(shipment.originAddress),
      recipientAddress: toAddressString(shipment.destinationAddress),
      recipientName: shipment.organisation?.name ?? 'Recipient',
      weightKg: Number(shipment.weightKg ?? 0),
      dimensions,
      qrCodeDataUrl,
      specialInstructions: shipment.specialInstructions
    });

    reply.type('text/html').send(html);
  });

  app.post('/api/v1/documents/pod/:shipmentId', { preHandler: [authenticate] }, async (request, reply) => {
    const tenantId = request.tenant?.id;
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });

    const { shipmentId } = request.params as { shipmentId: string };
    const shipment = await app.prisma.shipment.findFirst({
      where: { id: shipmentId, tenantId },
      include: {
        podAssets: true,
        driver: { include: { user: true } }
      }
    });
    if (!shipment) return reply.status(404).send({ error: 'Shipment not found' });

    const podSummary = {
      shipmentId: shipment.id,
      trackingNumber: shipment.trackingNumber,
      deliveredAt: shipment.actualDelivery,
      capturedBy:
        [shipment.driver?.user.firstName, shipment.driver?.user.lastName].filter(Boolean).join(' ') ||
        shipment.driver?.user.email ||
        'Driver',
      podAssets: shipment.podAssets
    };

    const encoded = Buffer.from(JSON.stringify(podSummary, null, 2), 'utf-8').toString('base64');
    const signedUrl = `data:application/json;base64,${encoded}`;
    reply.send({ signedUrl, podSummary });
  });
}

