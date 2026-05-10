import type { Prisma } from '@prisma/client';

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
};

export type PlatformAuditRow = {
  id: string;
  actorType?: string;
  actorId: string;
  actorEmail?: string | null;
  actorRole?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  targetTenantId?: string | null;
  targetUserId?: string | null;
  impersonationSessionId?: string | null;
  sessionId?: string | null;
  jitSessionId?: string | null;
  before?: Prisma.JsonValue | null;
  after?: Prisma.JsonValue | null;
  reason?: string | null;
  metadata?: Prisma.JsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
  previousHash?: string | null;
  hash: string;
  createdAt: Date;
};

export type PlatformAuditClient = {
  platformAuditLog: {
    findFirst: (args: unknown) => Promise<{ hash: string } | null>;
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
    findMany?: (args: unknown) => Promise<PlatformAuditRow[]>;
  };
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
