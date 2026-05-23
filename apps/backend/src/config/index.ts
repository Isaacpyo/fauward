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
  SENDGRID_FROM_EMAIL: z.string().email().default('support@fauward.com'),
  SENDGRID_FROM_NAME: z.string().default('Fauward'),
  SENDGRID_TEMPLATE_STAFF_INVITE: z.string().optional(),
  SENDGRID_TEMPLATE_PASSWORD_RESET: z.string().optional(),
  SENDGRID_TEMPLATE_BOOKING_CONFIRMED: z.string().optional(),
  SENDGRID_TEMPLATE_SHIPMENT_PICKED_UP: z.string().optional(),
  SENDGRID_TEMPLATE_OUT_FOR_DELIVERY: z.string().optional(),
  SENDGRID_TEMPLATE_DELIVERED: z.string().optional(),
  SENDGRID_TEMPLATE_FAILED_DELIVERY: z.string().optional(),
  SENDGRID_TEMPLATE_SHIPMENT_EXCEPTION: z.string().optional(),
  SENDGRID_TEMPLATE_INVOICE_SENT: z.string().optional(),
  SENDGRID_TEMPLATE_INVOICE_OVERDUE: z.string().optional(),
  SENDGRID_TEMPLATE_PAYMENT_RECEIVED: z.string().optional(),
  SENDGRID_TEMPLATE_RETURN_APPROVED: z.string().optional(),
  SENDGRID_TEMPLATE_RETURN_RECEIVED: z.string().optional(),
  SENDGRID_TEMPLATE_RETURN_REFUNDED: z.string().optional(),
  SENDGRID_TEMPLATE_TICKET_CREATED: z.string().optional(),
  SENDGRID_TEMPLATE_TICKET_REPLY_FROM_STAFF: z.string().optional(),
  SENDGRID_TEMPLATE_TICKET_REPLY_FROM_CUSTOMER: z.string().optional(),
  SENDGRID_TEMPLATE_TICKET_RESOLVED: z.string().optional(),
  SENDGRID_TEMPLATE_TRIAL_EXPIRING: z.string().optional(),
  SENDGRID_TEMPLATE_TRIAL_EXPIRY: z.string().optional(),
  SENDGRID_TEMPLATE_USAGE_WARNING_80: z.string().optional(),
  SENDGRID_TEMPLATE_USAGE_LIMIT_REACHED: z.string().optional(),
  SENDGRID_TEMPLATE_OPS_NEW_SHIPMENT: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_API_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  VERCEL_API_TOKEN: z.string().min(1).optional(),
  VERCEL_PORTAL_PROJECT_ID: z.string().min(1).optional(),
  VERCEL_TEAM_ID: z.string().optional(),
  VERCEL_API_BASE: z.string().url().default('https://api.vercel.com'),
  VERCEL_EXPECTED_PORTAL_DOMAIN: z.string().default('app.fauward.com'),
  RESERVED_DOMAINS: z.string().default('fauward.com,www.fauward.com,api.fauward.com,app.fauward.com'),
  FIREBASE_PROJECT_ID: z.string().default('fauward'),
  PLATFORM_SESSION_SECRET: z.string().optional(),
  PLATFORM_REFRESH_SECRET: z.string().optional(),
  PLATFORM_COOKIE_DOMAIN: z.string().optional(),
  PLATFORM_ADMIN_BOOTSTRAP_EMAIL: z.string().email().optional(),
  PLATFORM_ADMIN_BOOTSTRAP_PASSWORD: z.string().min(12).optional(),
  ADMIN_HOSTNAME: z.string().min(1).default('admin.fauward.com'),
  ADMIN_HARDENING_PHASE_1: z.string().default('false'),
  ADMIN_HARDENING_PHASE_2: z.string().default('false'),
  ADMIN_HARDENING_PHASE_3: z.string().default('false'),
  ADMIN_HARDENING_PHASE_4: z.string().default('false'),
  ADMIN_HARDENING_PHASE_5: z.string().default('false'),
  ADMIN_HARDENING_PHASE_6: z.string().default('false'),
  ROUTE_OPTIMIZER_URL: z.string().url().default('http://localhost:8001'),
  TENANT_PORTAL_URL: z.string().url().default('https://app.fauward.com'),
  FAUWARD_GO_URL: z.string().url().default('https://fauward.com/go')
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

function parseFeatureFlag(value: string) {
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

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
  sendgrid: {
    apiKey: parsed.data.SENDGRID_API_KEY,
    fromEmail: parsed.data.SENDGRID_FROM_EMAIL,
    fromName: parsed.data.SENDGRID_FROM_NAME,
    templateIds: {
      staff_invite: parsed.data.SENDGRID_TEMPLATE_STAFF_INVITE,
      password_reset: parsed.data.SENDGRID_TEMPLATE_PASSWORD_RESET,
      booking_confirmed: parsed.data.SENDGRID_TEMPLATE_BOOKING_CONFIRMED,
      shipment_picked_up: parsed.data.SENDGRID_TEMPLATE_SHIPMENT_PICKED_UP,
      out_for_delivery: parsed.data.SENDGRID_TEMPLATE_OUT_FOR_DELIVERY,
      delivered: parsed.data.SENDGRID_TEMPLATE_DELIVERED,
      failed_delivery: parsed.data.SENDGRID_TEMPLATE_FAILED_DELIVERY,
      shipment_exception: parsed.data.SENDGRID_TEMPLATE_SHIPMENT_EXCEPTION,
      invoice_sent: parsed.data.SENDGRID_TEMPLATE_INVOICE_SENT,
      invoice_overdue: parsed.data.SENDGRID_TEMPLATE_INVOICE_OVERDUE,
      payment_received: parsed.data.SENDGRID_TEMPLATE_PAYMENT_RECEIVED,
      return_approved: parsed.data.SENDGRID_TEMPLATE_RETURN_APPROVED,
      return_received: parsed.data.SENDGRID_TEMPLATE_RETURN_RECEIVED,
      return_refunded: parsed.data.SENDGRID_TEMPLATE_RETURN_REFUNDED,
      ticket_created: parsed.data.SENDGRID_TEMPLATE_TICKET_CREATED,
      ticket_reply_from_staff: parsed.data.SENDGRID_TEMPLATE_TICKET_REPLY_FROM_STAFF,
      ticket_reply_from_customer: parsed.data.SENDGRID_TEMPLATE_TICKET_REPLY_FROM_CUSTOMER,
      ticket_resolved: parsed.data.SENDGRID_TEMPLATE_TICKET_RESOLVED,
      trial_expiring: parsed.data.SENDGRID_TEMPLATE_TRIAL_EXPIRING,
      trial_expiry: parsed.data.SENDGRID_TEMPLATE_TRIAL_EXPIRY,
      usage_warning_80: parsed.data.SENDGRID_TEMPLATE_USAGE_WARNING_80,
      usage_limit_reached: parsed.data.SENDGRID_TEMPLATE_USAGE_LIMIT_REACHED,
      ops_new_shipment: parsed.data.SENDGRID_TEMPLATE_OPS_NEW_SHIPMENT
    } as Record<string, string | undefined>
  },
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
    apiBase: parsed.data.VERCEL_API_BASE,
    expectedPortalDomain: parsed.data.VERCEL_EXPECTED_PORTAL_DOMAIN
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
  admin: {
    hostname: parsed.data.ADMIN_HOSTNAME.trim().toLowerCase()
  },
  adminHardening: {
    phase1: parseFeatureFlag(parsed.data.ADMIN_HARDENING_PHASE_1),
    phase2: parseFeatureFlag(parsed.data.ADMIN_HARDENING_PHASE_2),
    phase3: parseFeatureFlag(parsed.data.ADMIN_HARDENING_PHASE_3),
    phase4: parseFeatureFlag(parsed.data.ADMIN_HARDENING_PHASE_4),
    phase5: parseFeatureFlag(parsed.data.ADMIN_HARDENING_PHASE_5),
    phase6: parseFeatureFlag(parsed.data.ADMIN_HARDENING_PHASE_6)
  },
  routeOptimizerUrl: parsed.data.ROUTE_OPTIMIZER_URL,
  tenantPortalUrl: parsed.data.TENANT_PORTAL_URL,
  fauwardGoUrl: parsed.data.FAUWARD_GO_URL
};
