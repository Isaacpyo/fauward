export type AuditAction = string;
export type AuditTarget = {
  type: string;
  id: string;
};

export interface AuditEntry {
  id: string;
  timestamp: Date;
  actor_id: string;
  actor_role: string;
  action: AuditAction;
  target_type: string;
  target_id: string;
  before: unknown | null;
  after: unknown | null;
  reason: string | null;
  ip_address: string;
  session_id: string;
  jit_session_id: string | null;
  hash: string;
  prev_hash: string | null;
}

export type AuditWriteInput = Omit<AuditEntry, 'id' | 'timestamp' | 'hash' | 'prev_hash'> & {
  actor_email?: string | null;
  user_agent?: string | null;
  /** Tenant a non-tenant target belongs to (e.g. a support ticket), so tenant filters and Customer 360 find the row. */
  target_tenant_id?: string | null;
};

export type AuditMetadata = {
  before?: unknown;
  after?: unknown;
  target_type?: string;
  target_id?: string;
  actor_role?: string;
  session_id?: string;
  jit_session_id?: string | null;
  [key: string]: unknown;
};
