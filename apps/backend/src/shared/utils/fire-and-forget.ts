import type { FastifyBaseLogger } from 'fastify';

/**
 * Run a promise as intentional fire-and-forget WITHOUT risking an
 * unhandledRejection. A rejected promise that nobody handles becomes a
 * `process.on('unhandledRejection')` event and, in Node, can crash the whole
 * process — this is exactly what took the API down (see server.ts global
 * handlers, which are the runtime backstop for this same failure mode).
 *
 * The `no-restricted-syntax` lint rule bans a bare `void somePromise()`, so this
 * helper is the sanctioned way to say "I deliberately don't await this, and its
 * failure must be logged, not fatal."
 *
 * @example
 *   fireAndForget(
 *     triggerTrackingWebhooks(app, payload),
 *     app.log,
 *     'triggerTrackingWebhooks failed',
 *     { shipmentId }
 *   );
 */
export function fireAndForget(
  promise: Promise<unknown>,
  log: Pick<FastifyBaseLogger, 'error'>,
  msg: string,
  context?: Record<string, unknown>
): void {
  promise.catch((err: unknown) => {
    log.error({ ...context, err }, msg);
  });
}
