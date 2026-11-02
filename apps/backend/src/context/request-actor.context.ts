import { AsyncLocalStorage } from 'async_hooks';

/**
 * Per-request actor holder. app.ts opens one empty holder per request; `authenticate` fills `impersonation` when the
 * caller is a Fauward staff member using an impersonation token, so tenant AuditLog writes can be stamped (D8).
 */
export type RequestActor = {
  impersonation?: { sessionId: string; platformUserId: string };
  /** Set once the handler wrote its PlatformAuditLog row, so the global safety net does not write a second (WP-5.1). */
  auditWritten?: boolean;
};

export const requestActorStorage = new AsyncLocalStorage<RequestActor>();

export function currentRequestActor(): RequestActor | undefined {
  return requestActorStorage.getStore();
}
