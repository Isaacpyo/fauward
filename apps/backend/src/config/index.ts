import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(3001),
  SUPABASE_DB_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  REDIS_QUEUE_URL: z.string().url().optional(),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  MFA_ISSUER: z.string().default('Fauward'),
  PLATFORM_DOMAIN: z.string().default('fauward.com'),
  SENDGRID_API_KEY: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_API_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  VERCEL_API_TOKEN: z.string().min(1),
  VERCEL_PORTAL_PROJECT_ID: z.string().min(1),
  VERCEL_TEAM_ID: z.string().optional(),
  VERCEL_API_BASE: z.string().url().default('https://api.vercel.com'),
  RESERVED_DOMAINS: z.string().default('fauward.com,www.fauward.com,api.fauward.com,app.fauward.com'),
  FIREBASE_PROJECT_ID: z.string().default('fauward'),
  PLATFORM_SESSION_SECRET: z.string().optional(),
  PLATFORM_REFRESH_SECRET: z.string().optional(),
  PLATFORM_COOKIE_DOMAIN: z.string().optional(),
  PLATFORM_ADMIN_BOOTSTRAP_EMAIL: z.string().email().optional(),
  PLATFORM_ADMIN_BOOTSTRAP_PASSWORD: z.string().min(12).optional(),
  ROUTE_OPTIMIZER_URL: z.string().url().default('http://localhost:8001')
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment variables', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment');
}

if (parsed.data.NODE_ENV === 'production') {
  const missing = [
    parsed.data.PLATFORM_SESSION_SECRET ? null : 'PLATFORM_SESSION_SECRET',
    parsed.data.PLATFORM_REFRESH_SECRET ? null : 'PLATFORM_REFRESH_SECRET',
    parsed.data.PLATFORM_COOKIE_DOMAIN ? null : 'PLATFORM_COOKIE_DOMAIN'
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Missing required production platform auth environment variables: ${missing.join(', ')}`);
  }
}

const devOnlyPlatformSessionSecret =
  parsed.data.PLATFORM_SESSION_SECRET ?? 'dev-platform-session-secret-change-before-production';
const devOnlyPlatformRefreshSecret =
  parsed.data.PLATFORM_REFRESH_SECRET ?? 'dev-platform-refresh-secret-change-before-production';

export const config = {
  nodeEnv: parsed.data.NODE_ENV,
  port: parsed.data.PORT,
  dbUrl: parsed.data.SUPABASE_DB_URL,
  redisUrl: parsed.data.REDIS_URL,
  redisQueueUrl: parsed.data.REDIS_QUEUE_URL ?? parsed.data.REDIS_URL,
  jwt: {
    accessSecret: parsed.data.JWT_ACCESS_SECRET,
    refreshSecret: parsed.data.JWT_REFRESH_SECRET,
    accessExpiresIn: parsed.data.JWT_ACCESS_EXPIRES_IN,
    refreshExpiresIn: parsed.data.JWT_REFRESH_EXPIRES_IN
  },
  mfaIssuer: parsed.data.MFA_ISSUER,
  platformDomain: parsed.data.PLATFORM_DOMAIN,
  sendgridApiKey: parsed.data.SENDGRID_API_KEY,
  twilio: {
    accountSid: parsed.data.TWILIO_ACCOUNT_SID,
    authToken: parsed.data.TWILIO_AUTH_TOKEN,
    from: parsed.data.TWILIO_FROM
  },
  stripe: {
    // Accept either env name so deploy config can use the existing Stripe secret key label.
    secretKey: parsed.data.STRIPE_SECRET_KEY ?? parsed.data.STRIPE_API_KEY,
    webhookSecret: parsed.data.STRIPE_WEBHOOK_SECRET
  },
  vercel: {
    apiToken: parsed.data.VERCEL_API_TOKEN,
    portalProjectId: parsed.data.VERCEL_PORTAL_PROJECT_ID,
    teamId: parsed.data.VERCEL_TEAM_ID,
    apiBase: parsed.data.VERCEL_API_BASE
  },
  reservedDomains: parsed.data.RESERVED_DOMAINS.split(',')
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean),
  firebase: {
    projectId: parsed.data.FIREBASE_PROJECT_ID
  },
  platformAuth: {
    sessionSecret: devOnlyPlatformSessionSecret,
    refreshSecret: devOnlyPlatformRefreshSecret,
    cookieDomain: parsed.data.PLATFORM_COOKIE_DOMAIN,
    issuer: 'fauward-platform',
    audience: 'fauward-platform-admin'
  },
  routeOptimizerUrl: parsed.data.ROUTE_OPTIMIZER_URL
};
