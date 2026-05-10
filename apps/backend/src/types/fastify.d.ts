import "fastify";
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ApiKey, PlatformSession, PlatformUser, PrismaClient, Tenant } from '@prisma/client';
import type Redis from 'ioredis';
import type { JwtPayload } from '../shared/utils/jwt.js';
import type { PlatformJwtClaims } from '../services/platform-session.service.js';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    redis: Redis;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }

  interface FastifyRequest {
    tenant?: Tenant;
    user?: JwtPayload;
    apiKey?: ApiKey;
    platform?: {
      claims: PlatformJwtClaims;
      user: PlatformUser;
      session: PlatformSession;
    };
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}
