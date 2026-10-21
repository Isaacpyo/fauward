import "fastify";
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ApiKey, PlatformSession, PlatformUser, PrismaClient, Tenant } from '@prisma/client';
import type Redis from 'ioredis';
import type { JwtPayload } from '../shared/utils/jwt.js';
import type { PlatformJwtClaims } from '../services/platform-session.service.js';
import type { AuditWriteInput } from '@fauward/internal-audit';
import type { ConsoleRequestContext } from '../middleware/require-console-permission.js';
import type { TenantEntitlements } from '../services/tenant-entitlements.service.js';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    redis: Redis;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }

  interface FastifyRequest {
    tenant?: Tenant;
    /** Effective plan + feature overrides for `tenant`, loaded once per request (WP-1.4). */
    entitlements?: TenantEntitlements;
    user?: JwtPayload;
    apiKey?: ApiKey;
    rawBody?: Buffer;
    platform?: {
      claims: PlatformJwtClaims;
      user: PlatformUser;
      session: PlatformSession;
    };
    /** Effective console permissions, computed once per request by requireConsolePermission (D2). */
    console?: ConsoleRequestContext;
    jitSessionId?: string;
    /** Set by writeInternalAudit; the global audit safety net then writes nothing (WP-5.1). */
    auditWritten?: boolean;
    internalAudit?: Partial<Pick<AuditWriteInput, 'action' | 'target_type' | 'target_id' | 'before' | 'after' | 'reason' | 'jit_session_id'>>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}
