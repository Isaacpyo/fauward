import crypto from 'node:crypto';

const idempotencyCache = new Map<string, unknown>();
const sentNotifications = new Set<string>();

export interface HandlerContext {
  runId: string;
  tenantId: string;
  logger: {
    info: (payload: unknown, message?: string) => void;
    error: (payload: unknown, message?: string) => void;
  };
}

export type ToolHandler = (input: unknown, ctx: HandlerContext) => Promise<unknown>;
export type BoundToolHandler = (input: unknown) => Promise<unknown>;

export function makeIdempotencyKey(toolName: string, args: unknown, runId: string): string {
  const payload = JSON.stringify({ toolName, args, runId });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export function withIdempotency<T>(
  toolName: string,
  handler: (input: T, ctx: HandlerContext) => Promise<unknown>,
  ctx: HandlerContext
): BoundToolHandler {
  return async (rawInput: unknown) => {
    const key = makeIdempotencyKey(toolName, rawInput, ctx.runId);
    if (idempotencyCache.has(key)) {
      ctx.logger.info({ toolName, key }, 'idempotency hit - skipping');
      return idempotencyCache.get(key);
    }

    const result = await handler(rawInput as T, ctx);
    idempotencyCache.set(key, result);
    return result;
  };
}

export function dedupNotification(
  shipmentId: string,
  templateKey: string,
  channel: string,
  runId = 'global'
): boolean {
  const key = `${runId}:${shipmentId}:${templateKey}:${channel}`;
  if (sentNotifications.has(key)) return false;
  sentNotifications.add(key);
  return true;
}
