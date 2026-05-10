import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

import type { FastifyInstance } from 'fastify';
import { LabelFormat } from '@prisma/client';
import QRCode from 'qrcode';
import { resolveTenantBranding } from '@fauward/theme-engine';

import { publishPythonServiceJob } from '../../queues/python-services.js';
import { createTrackingEvent, buildStatusTitle, statusToEventType } from '../tracking/tracking-event.service.js';
import { TrackingActorType, TrackingSource, TrackingVisibility } from '@fauward/tracking-core';

const LABEL_STORAGE_DIR = join(process.cwd(), '.storage', 'labels');

function toAddressString(address: unknown): string {
  if (!address || typeof address !== 'object') return '';
  return Object.values(address as Record<string, unknown>).filter(Boolean).join(', ');
}

function zplSafe(value: string) {
  return value.replaceAll('^', '').replaceAll('~', '').slice(0, 180);
}

function storeLocalLabel(fileName: string, content: string) {
  mkdirSync(LABEL_STORAGE_DIR, { recursive: true });
  const fullPath = join(LABEL_STORAGE_DIR, fileName);
  writeFileSync(fullPath, content, 'utf-8');
  return `file://${fullPath.replaceAll('\\', '/')}`;
}

function buildZplLabel(args: {
  trackingNumber: string;
  tenantName: string;
  origin: string;
  destination: string;
  weightKg: number;
}) {
  return `^XA
^CI28
^FO40,30^A0N,32,32^FD${zplSafe(args.tenantName)}^FS
^FO40,80^A0N,28,28^FD${zplSafe(args.trackingNumber)}^FS
^FO40,125^BY2
^BCN,90,Y,N,N^FD${zplSafe(args.trackingNumber)}^FS
^FO40,245^BQN,2,5^FDQA,${zplSafe(args.trackingNumber)}^FS
^FO260,245^A0N,24,24^FDOrigin^FS
^FO260,275^A0N,22,22^FD${zplSafe(args.origin)}^FS
^FO260,350^A0N,24,24^FDDestination^FS
^FO260,380^A0N,22,22^FD${zplSafe(args.destination)}^FS
^FO40,520^A0N,24,24^FDWeight: ${args.weightKg.toFixed(2)} kg^FS
^XZ`;
}

function buildHtmlLabel(args: {
  trackingNumber: string;
  tenantName: string;
  tenantLogo?: string | null;
  primaryColor: string;
  origin: string;
  destination: string;
  weightKg: number;
  qrDataUrl: string;
}) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
@page { size: 100mm 150mm; margin: 6mm; }
body { font-family: Arial, sans-serif; color: #111827; margin: 0; }
.brand { color: ${args.primaryColor}; font-weight: 800; font-size: 18px; }
.logo { max-height: 42px; max-width: 160px; object-fit: contain; }
.tracking { font-family: "Courier New", monospace; font-size: 20px; font-weight: 800; margin: 12px 0; }
.barcode { height: 54px; width: 100%; margin: 8px 0 4px; background: repeating-linear-gradient(90deg, #111827 0 2px, #fff 2px 4px, #111827 4px 5px, #fff 5px 8px); border: 1px solid #111827; }
.barcode-text { font-family: "Courier New", monospace; font-size: 11px; letter-spacing: 2px; text-align: center; }
.qr { width: 132px; height: 132px; }
.section { border-top: 1px solid #d1d5db; padding-top: 10px; margin-top: 10px; font-size: 12px; line-height: 1.35; }
.label { color: #6b7280; font-size: 10px; text-transform: uppercase; font-weight: 700; margin-bottom: 4px; }
</style></head><body>
${args.tenantLogo ? `<img class="logo" src="${args.tenantLogo}" alt="${args.tenantName}">` : `<div class="brand">${args.tenantName}</div>`}
<div class="tracking">${args.trackingNumber}</div>
<div class="barcode" aria-label="Code128 barcode for ${args.trackingNumber}"></div>
<div class="barcode-text">${args.trackingNumber}</div>
<img class="qr" src="${args.qrDataUrl}" alt="QR code">
<div class="section"><div class="label">Barcode Data</div>${args.trackingNumber}</div>
<div class="section"><div class="label">Origin</div>${args.origin}</div>
<div class="section"><div class="label">Destination</div>${args.destination}</div>
<div class="section"><div class="label">Weight</div>${args.weightKg.toFixed(2)} kg</div>
</body></html>`;
}

export const labelService = {
  async generate(
    app: FastifyInstance,
    tenantId: string,
    shipmentId: string,
    format: LabelFormat,
    forceRegenerate = false
  ) {
    const shipment = await app.prisma.shipment.findFirst({
      where: { id: shipmentId, tenantId },
      include: { tenant: true }
    });
    if (!shipment) throw new Error('Shipment not found');

    if (!forceRegenerate) {
      const existing = await app.prisma.generatedLabel.findFirst({
        where: { tenantId, shipmentId: shipment.id, format },
        orderBy: { generatedAt: 'desc' }
      });
      if (existing && existing.generatedAt >= shipment.updatedAt) return existing;
    }

    const origin = toAddressString(shipment.originAddress);
    const destination = toAddressString(shipment.destinationAddress);
    const weightKg = Number(shipment.weightKg ?? 0);
    const brandingConfig = resolveTenantBranding(shipment.tenant);
    const tenantName = brandingConfig.brandName;
    const barcodeData = shipment.trackingNumber;
    const qrDataUrl = await QRCode.toDataURL(barcodeData, { width: 160, margin: 0 });

    const content = format === 'ZPL'
      ? buildZplLabel({ trackingNumber: barcodeData, tenantName, origin, destination, weightKg })
      : buildHtmlLabel({
          trackingNumber: barcodeData,
          tenantName,
          tenantLogo: brandingConfig.logoUrl,
          primaryColor: brandingConfig.primaryColor,
          origin,
          destination,
          weightKg,
          qrDataUrl
        });

    const extension = format === 'ZPL' ? 'zpl' : 'html';
    const url = storeLocalLabel(`${shipment.trackingNumber}-${format.toLowerCase()}-${randomUUID()}.${extension}`, content);

    const label = await app.prisma.generatedLabel.create({
      data: {
        tenantId,
        shipmentId: shipment.id,
        format,
        url,
        carrier: shipment.carrierAccountId ?? null,
        barcodeData,
        trackingNumber: shipment.trackingNumber
      }
    });

    await publishPythonServiceJob(app, 'fauward:labels:generate', {
      jobId: label.id,
      tenantId,
      shipmentId: shipment.id,
      format,
      brandingConfig
    });

    await createTrackingEvent(app.prisma, {
      tenantId,
      shipmentId: shipment.id,
      trackingNumber: shipment.trackingNumber,
      eventType: statusToEventType('LABEL_GENERATED'),
      status: 'LABEL_GENERATED',
      title: buildStatusTitle('LABEL_GENERATED'),
      description: 'Shipping label generated',
      source: TrackingSource.TENANT_PORTAL,
      actorType: TrackingActorType.SYSTEM,
      visibility: TrackingVisibility.TENANT_INTERNAL,
      metadata: { labelId: label.id, format },
      idempotencyKey: `label:${label.id}`,
      skipTransitionCheck: true
    });

    return label;
  },

  async get(app: FastifyInstance, tenantId: string, shipmentId: string, labelId: string) {
    return app.prisma.generatedLabel.findFirst({
      where: { id: labelId, tenantId, shipmentId }
    });
  },

  async reprint(app: FastifyInstance, tenantId: string, shipmentId: string, labelId: string) {
    const existing = await this.get(app, tenantId, shipmentId, labelId);
    if (!existing) return null;
    return this.generate(app, tenantId, shipmentId, existing.format, false);
  },

  async packingSlip(app: FastifyInstance, tenantId: string, shipmentId: string) {
    const shipment = await app.prisma.shipment.findFirst({
      where: { id: shipmentId, tenantId },
      include: { items: true, tenant: true }
    });
    if (!shipment) throw new Error('Shipment not found');
    const content = JSON.stringify({
      brandName: shipment.tenant.brandName ?? shipment.tenant.name,
      trackingNumber: shipment.trackingNumber,
      items: shipment.items,
      generatedAt: new Date().toISOString()
    }, null, 2);
    const url = storeLocalLabel(`packing-slip-${shipment.trackingNumber}.json`, content);
    return app.prisma.shipmentDocument.create({
      data: {
        tenantId,
        shipmentId: shipment.id,
        type: 'DELIVERY_NOTE',
        fileUrl: url,
        generatedBy: 'system'
      }
    });
  },

  async manifest(app: FastifyInstance, tenantId: string, type: 'pickup' | 'delivery', shipmentIds: string[]) {
    const shipments = await app.prisma.shipment.findMany({
      where: { tenantId, ...(shipmentIds.length > 0 ? { id: { in: shipmentIds } } : {}) },
      select: { id: true, trackingNumber: true, status: true }
    });
    const content = JSON.stringify({ type, shipments, generatedAt: new Date().toISOString() }, null, 2);
    const url = storeLocalLabel(`${type}-manifest-${Date.now()}.json`, content);
    return { url, shipmentCount: shipments.length };
  }
};
