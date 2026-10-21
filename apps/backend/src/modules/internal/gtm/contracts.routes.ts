import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodError } from 'zod';
import { authenticatePlatformSession } from '../../../middleware/authenticate-platform-session.js';
import { dangerous } from '../../../middleware/dangerous.js';
import { requireConsolePermission } from '../../../middleware/require-console-permission.js';
import { requirePlatformCsrf } from '../../../middleware/require-platform-csrf.js';
import { staffMutationActor } from '../../../services/console-mutation.js';
import {
  ContractError,
  acceptBody,
  acceptWithUpload,
  approvalsQuery,
  createQuote,
  createQuoteBody,
  decideApproval,
  decisionBody,
  discountsView,
  getQuote,
  handleDocusignCompleted,
  listApprovals,
  listMsas,
  listQuotes,
  listQuotesQuery,
  msaDocument,
  quotePdf,
  sendQuote,
  submitQuote,
  updateQuote,
  updateQuoteBody
} from '../../../services/contracts.service.js';
import { notifyStaff } from '../../../services/platform-notifier.service.js';
import { recordWebhookVerification, verifyWebhookHmac } from '../webhook-hmac.js';

// gtm.contracts (WP-4.19): quotes (create, edit in DRAFT, submit → approval routing, send, accept), large-discount
// approvals, MSAs with the signed PDF, the discounts view by real status, and the DocuSign Connect webhook (HMAC).

const read = [authenticatePlatformSession, requireConsolePermission('gtm.contracts.read')];
const write = [authenticatePlatformSession, requirePlatformCsrf, requireConsolePermission('gtm.contracts.write')];

function invalid(reply: FastifyReply, error: ZodError, code = 'INVALID_BODY') {
  return reply.status(400).send({ error: code, message: error.issues[0]?.message });
}

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof ContractError) return reply.status(error.statusCode).send({ error: error.code, message: error.message, ...error.extra });
  throw error;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** envelopeId, completion and the signed PDF from a DocuSign Connect payload (JSON v2.1 or the flat legacy shape). */
function docusignEvent(body: unknown) {
  const root = record(body);
  const data = record(root.data);
  const summary = record(data.envelopeSummary);
  const envelopeId = text(root.envelopeId) ?? text(data.envelopeId) ?? text(summary.envelopeId);
  const status = (text(root.status) ?? text(summary.status) ?? '').toLowerCase();
  const completed = status === 'completed' || text(root.event) === 'envelope-completed';
  const documents = Array.isArray(summary.envelopeDocuments) ? summary.envelopeDocuments.map(record) : [];
  const pdfBase64 = documents.map((doc) => text(doc.PDFBytes)).find(Boolean) ?? null;
  return { envelopeId, completed, pdfBase64 };
}

export async function registerConsoleContractsRoutes(app: FastifyInstance) {
  app.get('/api/internal/contracts/quotes', { preHandler: read }, async (request, reply) => {
    const parsed = listQuotesQuery.safeParse(request.query ?? {});
    if (!parsed.success) return invalid(reply, parsed.error, 'INVALID_QUERY');
    return reply.send(await listQuotes(app, parsed.data));
  });

  app.post('/api/internal/contracts/quotes', { preHandler: write }, async (request, reply) => {
    const parsed = createQuoteBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.status(201).send(await createQuote(app, staffMutationActor(request), request.platform!.user.id, parsed.data));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get('/api/internal/contracts/quotes/:id', { preHandler: read }, async (request, reply) => {
    try {
      return reply.send(await getQuote(app, (request.params as { id: string }).id));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.patch('/api/internal/contracts/quotes/:id', { preHandler: write }, async (request, reply) => {
    const parsed = updateQuoteBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.send(await updateQuote(app, staffMutationActor(request), (request.params as { id: string }).id, parsed.data));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post('/api/internal/contracts/quotes/:id/submit', { preHandler: write }, async (request, reply) => {
    try {
      return reply.send(await submitQuote(app, staffMutationActor(request), request.platform!.user.id, (request.params as { id: string }).id));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post('/api/internal/contracts/quotes/:id/send', { preHandler: write }, async (request, reply) => {
    try {
      return reply.send(await sendQuote(app, staffMutationActor(request), (request.params as { id: string }).id));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get('/api/internal/contracts/quotes/:id/pdf', { preHandler: read }, async (request, reply) => {
    try {
      const pdf = await quotePdf(app, (request.params as { id: string }).id);
      return reply.header('content-type', 'application/pdf').header('content-disposition', `attachment; filename="${pdf.fileName}"`).send(pdf.bytes);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post('/api/internal/contracts/quotes/:id/accept', { preHandler: dangerous('gtm.contracts.write') }, async (request, reply) => {
    const parsed = acceptBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.send(await acceptWithUpload(app, request, (request.params as { id: string }).id, parsed.data));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get('/api/internal/contracts/approvals', { preHandler: read }, async (request, reply) => {
    const parsed = approvalsQuery.safeParse(request.query ?? {});
    if (!parsed.success) return invalid(reply, parsed.error, 'INVALID_QUERY');
    return reply.send(await listApprovals(app, parsed.data));
  });

  app.post('/api/internal/contracts/approvals/:id/decision', { preHandler: dangerous('gtm.contracts.discount.large') }, async (request, reply) => {
    const parsed = decisionBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.send(await decideApproval(app, request, (request.params as { id: string }).id, parsed.data));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get('/api/internal/contracts/msas', { preHandler: read }, async (_request, reply) => reply.send(await listMsas(app)));

  app.get('/api/internal/contracts/msas/:id/document', { preHandler: read }, async (request, reply) => {
    const document = await msaDocument(app, (request.params as { id: string }).id);
    if (!document) return reply.status(404).send({ error: 'DOCUMENT_NOT_FOUND', message: 'No signed document is stored for this agreement.' });
    return reply.header('content-type', 'application/pdf').header('content-disposition', `attachment; filename="${document.fileName}"`).send(document.bytes);
  });

  app.get('/api/internal/contracts/discounts', { preHandler: read }, async (_request, reply) => reply.send(await discountsView(app)));

  // DocuSign Connect (HMAC, no session). "completed" runs the same accept flow as the manual upload.
  app.post('/api/internal/contracts/webhooks/docusign', async (request, reply) => {
    const verification = verifyWebhookHmac(request, reply, {
      envName: 'DOCUSIGN_WEBHOOK_SECRET',
      signatureHeaderNames: ['x-docusign-signature-1'],
      timestampHeaderNames: ['x-docusign-timestamp', 'x-docusign-delivery-timestamp'],
      scheme: 'docusign'
    });
    if (!verification) return;
    await recordWebhookVerification(app, 'docusign', verification);
    const event = docusignEvent(request.body);
    if (!event.envelopeId) return reply.status(202).send({ received: true, ignored: true, reason: 'missing envelope id' });
    if (!event.completed) return reply.status(202).send({ received: true, ignored: true, reason: 'not completed' });
    try {
      const result = await handleDocusignCompleted(app, event.envelopeId, event.pdfBase64);
      return reply.status(result.ignored ? 202 : 200).send({ received: true, ...result });
    } catch (error) {
      if (error instanceof ContractError) {
        request.log.warn({ envelopeId: event.envelopeId, code: error.code }, 'DocuSign completion could not be applied');
        await notifyStaff(app, { permission: 'gtm.contracts.write', event: 'contracts.docusign_not_applied', title: `A DocuSign envelope was signed but could not be accepted (${error.code}): accept the quote by hand`, body: error.message, link: '/gtm/contracts/quotes', severity: 'ATTENTION' });
        return reply.status(202).send({ received: true, ignored: true, reason: error.code });
      }
      throw error;
    }
  });
}
