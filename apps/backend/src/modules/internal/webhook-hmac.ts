import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'node:crypto';

// HMAC verification for the vendor webhooks under /api/internal (PagerDuty, Persona, ComplyAdvantage, DocuSign). Each
// is unauthenticated and verified here: 503 when the secret is unset (fail closed), 403 for a missing or wrong
// signature, 400 for a timestamp older than five minutes (replay).

export type WebhookVerification = {
  signature: string;
  timestamp: string;
  verifiedAt: string;
};

export type WebhookHmacOptions = {
  envName: string;
  signatureHeaderNames: string[];
  timestampHeaderNames: string[];
  scheme: 'pagerduty' | 'persona' | 'docusign' | 'complyadvantage';
  webhookIdHeaderNames?: string[];
};

function headerValue(request: FastifyRequest, name: string) {
  const value = request.headers[name.toLowerCase()];
  return typeof value === 'string' ? value : Array.isArray(value) ? value[0] : undefined;
}

function rawBodyString(request: FastifyRequest) {
  if (request.rawBody) return request.rawBody.toString('utf8');
  if (Buffer.isBuffer(request.body)) return request.body.toString('utf8');
  if (typeof request.body === 'string') return request.body;
  return JSON.stringify(request.body ?? {});
}

function timestampFromHeaders(request: FastifyRequest, signatureHeader: string | undefined, timestampHeaderNames: string[]) {
  const explicit = timestampHeaderNames.map((name) => headerValue(request, name)).find(Boolean);
  if (explicit) return explicit;
  const embedded = signatureHeader?.split(',').map((part) => part.trim()).find((part) => part.toLowerCase().startsWith('t='));
  return embedded?.slice(2).trim();
}

function timestampToMs(timestamp: string) {
  if (/^\d+$/.test(timestamp)) {
    const numeric = Number(timestamp);
    return timestamp.length <= 10 ? numeric * 1000 : numeric;
  }
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? null : parsed;
}

function secureStringEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function hmacDigest(secret: string | Buffer, payload: string | Buffer) {
  return createHmac('sha256', secret).update(payload).digest();
}

function signatureList(header: string | undefined, marker?: string) {
  if (!header) return [];
  if (!marker) return header.split(/\s+/).map((part) => part.trim()).filter(Boolean);

  const normalizedMarker = marker.toLowerCase();
  const extractMarked = (part: string) => {
    const lowerPart = part.toLowerCase();
    if (lowerPart.startsWith(`${normalizedMarker}=`)) return part.slice(marker.length + 1);
    if (lowerPart.startsWith(`${normalizedMarker},`)) return part.slice(marker.length + 1);
    return null;
  };

  return header
    .split(/\s+/)
    .map((part) => part.trim())
    .flatMap((part) => {
      if (!part) return [];
      const direct = extractMarked(part);
      if (direct) return [direct];
      const commaPart = part.split(',').map((piece) => piece.trim()).map(extractMarked).find(Boolean);
      if (commaPart) return [commaPart];
      return [];
    })
    .filter(Boolean);
}

function expectedWebhookSignatures(options: WebhookHmacOptions, secret: string, timestamp: string, rawBody: string, webhookId: string | undefined) {
  if (options.scheme === 'pagerduty') {
    return { signatures: [hmacDigest(secret, rawBody).toString('hex')], marker: 'v1' };
  }
  if (options.scheme === 'persona') {
    return { signatures: [hmacDigest(secret, `${timestamp}.${rawBody}`).toString('hex')], marker: 'v1' };
  }
  if (options.scheme === 'docusign') {
    const digest = hmacDigest(secret, rawBody);
    return { signatures: [digest.toString('base64'), digest.toString('hex')], marker: undefined };
  }
  if (!webhookId) return { signatures: [], marker: 'v1' };
  const digest = hmacDigest(Buffer.from(secret, 'base64'), `${webhookId}.${timestamp}.${rawBody}`);
  return { signatures: [digest.toString('base64')], marker: 'v1' };
}

/** Verifies the request; on failure sends the error reply and returns null. */
export function verifyWebhookHmac(request: FastifyRequest, reply: FastifyReply, options: WebhookHmacOptions): WebhookVerification | null {
  const secret = process.env[options.envName];
  if (!secret) {
    reply.status(503).send({ error: `${options.envName}_NOT_CONFIGURED` });
    return null;
  }

  const signatureHeader = options.signatureHeaderNames.map((name) => headerValue(request, name)).find(Boolean);
  if (!signatureHeader) {
    reply.status(403).send({ error: 'Invalid webhook signature' });
    return null;
  }

  const timestamp = timestampFromHeaders(request, signatureHeader, options.timestampHeaderNames);
  const signedAtMs = timestamp ? timestampToMs(timestamp) : null;
  if (!timestamp || signedAtMs === null) {
    reply.status(403).send({ error: 'Invalid webhook signature' });
    return null;
  }

  if (Math.abs(Date.now() - signedAtMs) > 5 * 60 * 1000) {
    reply.status(400).send({ error: 'Webhook timestamp too old' });
    return null;
  }

  const webhookId = options.webhookIdHeaderNames?.map((name) => headerValue(request, name)).find(Boolean);
  if (options.scheme === 'complyadvantage' && !webhookId) {
    reply.status(403).send({ error: 'Invalid webhook signature' });
    return null;
  }

  const { signatures: expectedCandidates, marker } = expectedWebhookSignatures(options, secret, timestamp, rawBodyString(request), webhookId);
  const actualCandidates = signatureList(signatureHeader, marker);
  const valid = actualCandidates.some((actual) => expectedCandidates.some((expected) => secureStringEquals(actual, expected)));
  if (!valid) {
    reply.status(403).send({ error: 'Invalid webhook signature' });
    return null;
  }

  return { signature: actualCandidates[0], timestamp, verifiedAt: new Date().toISOString() };
}

export function webhookPayload(body: Record<string, unknown>, verification: WebhookVerification) {
  return { ...body, _webhookVerification: verification };
}

type ProviderStatusDb = { integrationProviderStatus?: Pick<Prisma.TransactionClient['integrationProviderStatus'], 'upsert'> };

/** Marks the vendor's webhook as verified on its integration status row (skipped when the model is not available). */
export async function recordWebhookVerification(app: Pick<FastifyInstance, 'prisma'>, vendor: string, verification: WebhookVerification) {
  const model = (app.prisma as ProviderStatusDb).integrationProviderStatus;
  if (!model || typeof model.upsert !== 'function') return;
  const payload = { lastWebhookVerification: verification };
  await model.upsert({
    where: { provider: vendor },
    create: { provider: vendor, status: 'WEBHOOK_VERIFIED', lastSuccessfulAt: new Date(), payload },
    update: { status: 'WEBHOOK_VERIFIED', lastSuccessfulAt: new Date(), checkedAt: new Date(), payload }
  });
}
