/**
 * Widget token helpers.
 * Tokens are short-lived JWTs (HS256) signed with WIDGET_TOKEN_SECRET.
 * They carry { tenantId, tenantSlug, allowedOrigin } and expire in 15 minutes.
 */

import { SignJWT, jwtVerify, type JWTPayload } from "jose";

function getSecret(): Uint8Array {
  const secret = process.env.WIDGET_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("WIDGET_TOKEN_SECRET must be set and at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

export type WidgetTokenPayload = JWTPayload & {
  tenantId: string;
  tenantSlug: string;
  allowedOrigin: string;
};

export async function signWidgetToken(payload: Omit<WidgetTokenPayload, keyof JWTPayload>): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .setIssuer("fauward-widget")
    .sign(getSecret());
}

export async function verifyWidgetToken(token: string): Promise<WidgetTokenPayload> {
  const { payload } = await jwtVerify(token, getSecret(), {
    issuer: "fauward-widget",
  });
  return payload as WidgetTokenPayload;
}
