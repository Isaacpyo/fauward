import jwt from 'jsonwebtoken';
import { createHmac, randomUUID } from 'crypto';
import { config } from '../../config/index.js';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  tenantId: string;
  tenantSlug: string;
  plan: string;
  mfaVerified: boolean;
  impersonator?: string;
  impersonatorEmail?: string;
  actorType?: 'PLATFORM_USER' | 'TENANT_USER';
  actorId?: string;
  targetTenantId?: string;
  targetUserId?: string | null;
  impersonationSessionId?: string;
  scopes?: string[];
  mode?: 'IMPERSONATION';
}

export function signAccessToken(payload: JwtPayload) {
  return jwt.sign(payload, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpiresIn as jwt.SignOptions['expiresIn']
  });
}

export function signRefreshToken(payload: JwtPayload) {
  return jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn as jwt.SignOptions['expiresIn'],
    jwtid: randomUUID()
  });
}

// Email-link tokens are signed with their own key, derived from the access secret, so an emailed link never works as
// a Bearer access token and an access token never works as an email link (C61).
function emailLinkKey() {
  return createHmac('sha256', config.jwt.accessSecret).update('fauward:email-link').digest('hex');
}

export function signEmailLinkToken(payload: JwtPayload) {
  return jwt.sign({ ...payload, purpose: 'email_link' }, emailLinkKey(), {
    expiresIn: '15m'
  });
}

export function verifyEmailLinkToken(token: string): JwtPayload & { purpose?: string } {
  return jwt.verify(token, emailLinkKey()) as JwtPayload & { purpose?: string };
}

export function verifyAccessToken(token: string): JwtPayload & { purpose?: string } {
  return jwt.verify(token, config.jwt.accessSecret) as JwtPayload & { purpose?: string };
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwt.refreshSecret) as JwtPayload;
}
