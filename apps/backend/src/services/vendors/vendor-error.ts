import type { FastifyReply, FastifyRequest } from 'fastify';

// D9 / S16 (WP-4.0a): every vendor call goes through an adapter in this folder. A vendor failure is a VendorError,
// which any console route turns into 502 { error: 'VENDOR_ERROR', vendor, degraded: true } — never a crash, never a
// raw upstream body.

export type VendorName =
  | 'launchdarkly'
  | 'github'
  | 'pagerduty'
  | 'stripe'
  | 'stripe-tax'
  | 'anrok'
  | 'persona'
  | 'complyadvantage'
  | 'doppler'
  | 'hubspot'
  | 'docusign';

export class VendorError extends Error {
  readonly vendor: VendorName;
  readonly upstreamStatus: number | null;

  constructor(vendor: VendorName, message: string, upstreamStatus: number | null = null) {
    super(message);
    this.name = 'VendorError';
    this.vendor = vendor;
    this.upstreamStatus = upstreamStatus;
  }
}

export class VendorNotConfiguredError extends VendorError {
  readonly missing: string[];

  constructor(vendor: VendorName, missing: string[]) {
    super(vendor, `${vendor} is not configured (missing ${missing.join(', ')})`);
    this.name = 'VendorNotConfiguredError';
    this.missing = missing;
  }
}

export function isVendorError(error: unknown): error is VendorError {
  return error instanceof VendorError;
}

export function vendorErrorBody(error: VendorError) {
  return {
    error: 'VENDOR_ERROR' as const,
    vendor: error.vendor,
    degraded: true as const,
    message: error instanceof VendorNotConfiguredError ? error.message : `${error.vendor} request failed`,
    ...(error instanceof VendorNotConfiguredError ? { missing: error.missing } : {})
  };
}

/** Root error handler piece (app.ts) and test helper: VendorError → 502; anything else goes to the default handler. */
export function vendorErrorHandler(error: Error, request: FastifyRequest, reply: FastifyReply) {
  if (isVendorError(error)) {
    request.log.warn({ vendor: error.vendor, upstreamStatus: error.upstreamStatus, err: error.message }, 'Vendor call failed');
    return reply.status(502).send(vendorErrorBody(error));
  }
  throw error;
}

/** Runs a vendor call and converts any thrown error (network, SDK) into a VendorError for that vendor. */
export async function vendorCall<T>(vendor: VendorName, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isVendorError(error)) throw error;
    const status = typeof (error as { statusCode?: unknown })?.statusCode === 'number' ? (error as { statusCode: number }).statusCode : null;
    throw new VendorError(vendor, error instanceof Error ? error.message : String(error), status);
  }
}
