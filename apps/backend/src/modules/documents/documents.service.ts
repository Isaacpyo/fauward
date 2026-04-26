import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import type { FastifyInstance } from 'fastify';
import { DocumentType } from '@prisma/client';
import { publishPythonServiceJob } from '../../queues/python-services.js';

const TEMPLATE_DIR = join(process.cwd(), 'src', 'modules', 'documents', 'templates');
const LOCAL_STORAGE_DIR = join(process.cwd(), '.storage', 'documents');

function renderTemplate(fileName: string, data: Record<string, string>) {
  const fullPath = join(TEMPLATE_DIR, fileName);
  let template = readFileSync(fullPath, 'utf-8');
  for (const [key, value] of Object.entries(data)) {
    template = template.replaceAll(`{{${key}}}`, value);
  }
  return template;
}

function storeLocalDocument(fileName: string, content: string) {
  mkdirSync(LOCAL_STORAGE_DIR, { recursive: true });
  const fullPath = join(LOCAL_STORAGE_DIR, fileName);
  writeFileSync(fullPath, content, 'utf-8');
  return `file://${fullPath.replaceAll('\\', '/')}`;
}

function addressToLine(address: unknown) {
  if (!address || typeof address !== 'object') return '';
  return Object.values(address as Record<string, unknown>).filter(Boolean).join(', ');
}

export const documentsService = {
  async generateDeliveryNote(app: FastifyInstance, tenantId: string, shipmentId: string) {
    const shipment = await app.prisma.shipment.findFirst({
      where: { id: shipmentId, tenantId },
      include: { tenant: true, organisation: true }
    });
    if (!shipment) {
      throw new Error('Shipment not found');
    }

    const html = renderTemplate('delivery-note.html', {
      brandName: shipment.tenant.brandName ?? shipment.tenant.name,
      primaryColor: shipment.tenant.primaryColor,
      trackingNumber: shipment.trackingNumber,
      originAddress: addressToLine(shipment.originAddress),
      destinationAddress: addressToLine(shipment.destinationAddress),
      serviceTier: shipment.serviceTier,
      customerName: shipment.organisation?.name ?? 'Customer',
      generatedAt: new Date().toISOString()
    });

    const fileUrl = storeLocalDocument(`delivery-note-${shipment.trackingNumber}.html`, html);
    const document = await app.prisma.shipmentDocument.create({
      data: {
        tenantId,
        shipmentId: shipment.id,
        type: DocumentType.DELIVERY_NOTE,
        fileUrl,
        generatedBy: 'system'
      }
    });

    return {
      documentId: document.id,
      fileUrl
    };
  },

  async generateInvoicePdf(app: FastifyInstance, tenantId: string, invoiceId: string) {
    const invoice = await app.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: { tenant: true, organisation: true, shipment: true }
    });
    if (!invoice) {
      throw new Error('Invoice not found');
    }
    if (!invoice.shipmentId) {
      throw new Error('Invoice is not linked to a shipment');
    }

    const html = renderTemplate('invoice.html', {
      brandName: invoice.tenant.brandName ?? invoice.tenant.name,
      primaryColor: invoice.tenant.primaryColor,
      invoiceNumber: invoice.invoiceNumber,
      customerName: invoice.organisation?.name ?? 'Customer',
      amount: Number(invoice.total).toFixed(2),
      currency: invoice.currency,
      dueDate: invoice.dueDate?.toISOString().slice(0, 10) ?? 'N/A',
      generatedAt: new Date().toISOString(),
      trackingNumber: invoice.shipment?.trackingNumber ?? 'N/A'
    });

    const fileUrl = storeLocalDocument(`invoice-${invoice.invoiceNumber}.html`, html);
    const document = await app.prisma.shipmentDocument.create({
      data: {
        tenantId,
        shipmentId: invoice.shipmentId,
        type: DocumentType.INVOICE,
        fileUrl,
        generatedBy: 'system'
      }
    });
    await publishPythonServiceJob(app, 'fauward:pdf:generate', {
      jobId: document.id,
      tenantId,
      type: 'invoice',
      shipmentId: invoice.shipmentId,
      data: {
        invoiceNumber: invoice.invoiceNumber,
        customerName: invoice.organisation?.name ?? 'Customer',
        subtotal: Number(invoice.subtotal),
        vat: Number(invoice.taxAmount),
        total: Number(invoice.total),
        currency: invoice.currency,
        status: invoice.status,
        dueDate: invoice.dueDate?.toISOString().slice(0, 10) ?? null,
        trackingRef: invoice.shipment?.trackingNumber ?? null,
        lineItems: invoice.lineItems
      }
    });

    return {
      documentId: document.id,
      fileUrl
    };
  },

  async generateManifest(app: FastifyInstance, tenantId: string, routeId: string) {
    const route = await app.prisma.route.findFirst({
      where: { id: routeId, tenantId },
      include: { stops: true }
    });
    if (!route) throw new Error('Route not found');

    const content = `Manifest\nRoute: ${route.id}\nStops: ${route.stops.length}\nGenerated: ${new Date().toISOString()}`;
    const fileUrl = storeLocalDocument(`manifest-${route.id}.txt`, content);

    return { fileUrl };
  },

  async getSignedUrl(app: FastifyInstance, tenantId: string, documentId: string) {
    const doc = await app.prisma.shipmentDocument.findFirst({
      where: { id: documentId, tenantId }
    });
    if (!doc) throw new Error('Document not found');
    return { fileUrl: doc.fileUrl, expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString() };
  }
};
