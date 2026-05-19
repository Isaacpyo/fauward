/**
 * Central service registry — the single source of truth for what to monitor.
 * Prod DB hosts are parsed from DATABASE_URL / REDIS_URL env vars (set in .env.local).
 */

function parseTcpFromUrl(urlStr) {
  if (!urlStr) return null;
  try {
    const u    = new URL(urlStr);
    const port = u.port ? Number(u.port) : (u.protocol === 'rediss:' ? 6380 : 5432);
    return { host: u.hostname, port, enabled: true };
  } catch { return null; }
}

function envBool(name, defaultValue = false) {
  const value = process.env[name];
  if (value == null || value === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function supabaseRestUrl(baseUrl) {
  if (!baseUrl) return null;
  const clean = baseUrl.replace(/\/+$/, '');
  return clean.endsWith('/rest/v1') ? `${clean}/` : `${clean}/rest/v1/`;
}

function httpEnv(url) {
  return url ? { url, enabled: true } : null;
}

function envList(name, fallback) {
  const value = process.env[name];
  if (!value) return fallback;
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => ENVIRONMENTS.includes(item));
}

const RAILWAY_LOGS = 'https://railway.app/dashboard'; // TODO: replace with direct project/service log URL
const VERCEL_LOGS  = 'https://vercel.com/dashboard';
const SUPABASE_LOGS= `https://supabase.com/dashboard/project/${(process.env.SUPABASE_URL ?? '').split('//')[1]?.split('.')[0]}/logs/postgres`;
const SUPABASE_LOCAL_REST_URL = supabaseRestUrl(process.env.SUPABASE_LOCAL_URL ?? 'http://localhost:54321');
const SUPABASE_LOCAL_ENABLED = envBool('SUPABASE_LOCAL_ENABLED', Boolean(process.env.SUPABASE_LOCAL_URL));
const STATUS_DASHBOARD_PROD_URL = process.env.STATUS_DASHBOARD_PROD_URL ?? '';
const FAUWARD_GO_PROD_URL = process.env.FAUWARD_GO_PROD_URL ?? '';
const IS_VERCEL = Boolean(process.env.VERCEL);

export const SERVICES = [
  // ── Internal tooling ───────────────────────────────────────────────────
  {
    id: 'status-dashboard',
    name: 'Status Dashboard',
    type: 'http',
    category: 'core',
    criticality: 'low',
    description: 'This dashboard — internal ops monitoring for Fauward services',
    dependencies: [],
    affectedWorkflows: ['ops-monitoring'],
    healthPaths: {},
    logUrl:     RAILWAY_LOGS,
    runbookUrl: null,
    environments: {
      local:   { url: 'http://localhost:4000', enabled: true },
      prod:    httpEnv(STATUS_DASHBOARD_PROD_URL),
      staging: null,
    },
    fix: 'npm run dev --workspace=apps/status-dashboard',
  },

  // ── Core HTTP ──────────────────────────────────────────────────────────
  {
    id: 'main-api',
    name: 'Main API',
    type: 'http',
    category: 'core',
    criticality: 'critical',
    description: 'Fastify REST API — all tenant and platform endpoints',
    dependencies: ['postgres', 'redis', 'redis-queue'],
    affectedWorkflows: ['shipment-creation', 'tracking', 'billing', 'auth', 'notifications'],
    healthPaths: { live: '/live', ready: '/ready', health: '/health', version: '/version' },
    logUrl:     RAILWAY_LOGS,
    runbookUrl: 'https://fauward.com/docs/runbooks/api-down',
    environments: {
      local:   { url: 'http://localhost:3001', enabled: true },
      prod:    { url: 'https://fauwardbackend-production.up.railway.app', enabled: true },
      staging: null,
    },
    fix: 'npm run dev:backend',
  },
  {
    id: 'frontend',
    name: 'Frontend',
    type: 'http',
    category: 'frontend',
    criticality: 'high',
    description: 'Next.js 14 marketing site — fauward.com',
    dependencies: ['main-api'],
    affectedWorkflows: ['signup', 'marketing', 'onboarding'],
    healthPaths: {},
    logUrl:     VERCEL_LOGS,
    runbookUrl: null,
    environments: {
      local:   { url: 'http://localhost:5000', enabled: true },
      prod:    { url: 'https://fauward.com', enabled: true },
      staging: null,
    },
    fix: 'npm run dev:frontend',
  },
  {
    id: 'tenant-portal',
    name: 'Tenant Portal',
    type: 'http',
    category: 'frontend',
    criticality: 'high',
    description: 'React/Vite SPA — operational hub for tenant businesses',
    dependencies: ['main-api'],
    affectedWorkflows: ['shipment-management', 'customer-portal', 'tracking-widget'],
    healthPaths: {},
    logUrl:     VERCEL_LOGS,
    runbookUrl: null,
    environments: {
      local:   { url: 'http://localhost:3000', enabled: true },
      prod:    { url: 'https://app.fauward.com', enabled: true },
      staging: null,
    },
    fix: 'npm run dev:frontend',
  },
  {
    id: 'fauward-go',
    name: 'Fauward Go',
    type: 'http',
    category: 'frontend',
    criticality: 'high',
    description: 'Field ops PWA — execution, sync, and proof-of-delivery for drivers.',
    dependencies: ['main-api'],
    affectedWorkflows: ['proof-of-delivery', 'field-sync', 'driver-assignment', 'route-execution'],
    logUrl:     VERCEL_LOGS,
    runbookUrl: null,
    environments: {
      local:   { url: 'http://localhost:5176', enabled: true },
      prod:    httpEnv(FAUWARD_GO_PROD_URL),
      staging: null,
    },
    fix: 'npm run dev --filter=fauward-go',
  },
  {
    id: 'fauward-relay',
    name: 'Fauward Relay',
    type: 'derived',
    category: 'core',
    criticality: 'high',
    description: 'AI-powered conversation relay — routes, queues, and escalates support threads. Status derived from API + Redis + AI models.',
    dependencies: ['main-api', 'redis', 'redis-queue', 'supabase', 'deepseek', 'moonshot'],
    affectedWorkflows: ['customer-support', 'ai-routing', 'escalation', 'auto-reply', 'message-delivery'],
    logUrl:     RAILWAY_LOGS,
    runbookUrl: null,
    environments: {},
  },
  {
    id: 'super-admin',
    name: 'Super Admin',
    type: 'http',
    category: 'frontend',
    criticality: 'medium',
    description: 'React/Vite SPA — Fauward internal control plane',
    dependencies: ['main-api'],
    affectedWorkflows: ['tenant-management', 'platform-ops', 'billing-ops'],
    healthPaths: {},
    logUrl:     VERCEL_LOGS,
    runbookUrl: null,
    environments: {
      local:   { url: 'http://localhost:5173', enabled: true },
      prod:    { url: 'https://admin.fauward.com', enabled: true },
      staging: null,
    },
    fix: 'npm run dev',
  },

  // ── Database / Cache ───────────────────────────────────────────────────
  {
    id: 'postgres',
    name: 'Postgres',
    type: 'tcp',
    category: 'database',
    criticality: 'critical',
    description: 'PostgreSQL 15 — primary data store (Supabase managed)',
    dependencies: [],
    affectedWorkflows: ['all'],
    healthPaths: {},
    logUrl:     SUPABASE_LOGS,
    runbookUrl: 'https://supabase.com/dashboard',
    environments: {
      local:   { host: 'localhost', port: 5432, enabled: true },
      prod:    parseTcpFromUrl(process.env.DATABASE_URL),
      staging: null,
    },
    fix: 'docker-compose up -d postgres',
    restartable: true,
  },
  {
    id: 'redis',
    name: 'Redis (Upstash)',
    type: 'tcp',
    category: 'database',
    criticality: 'critical',
    description: 'Upstash Redis — cache, rate limiting, tracking streams (track:stream:*), SMS quotas. BullMQ queues moved to Railway Redis.',
    dependencies: [],
    affectedWorkflows: ['real-time-tracking', 'rate-limiting', 'caching', 'sms-quota'],
    healthPaths: {},
    logUrl:     'https://console.upstash.com',
    runbookUrl: 'https://console.upstash.com',
    environments: {
      local:   { host: 'localhost', port: 6379, enabled: true },
      prod:    parseTcpFromUrl(process.env.REDIS_URL),
      staging: null,
    },
    fix: 'docker-compose up -d redis',
    restartable: true,
  },
  {
    id: 'redis-queue',
    name: 'Redis (Railway — Queues)',
    type: 'tcp',
    category: 'database',
    criticality: 'critical',
    description: 'Railway Redis — BullMQ queue broker for all background workers (notification, webhook, outbox, analytics, scheduled-jobs, route-optimization). No per-command billing.',
    dependencies: [],
    affectedWorkflows: ['queue-processing', 'notifications', 'webhook-delivery', 'scheduled-jobs'],
    healthPaths: {},
    logUrl:     RAILWAY_LOGS,
    runbookUrl: RAILWAY_LOGS,
    environments: {
      local:   { host: 'localhost', port: 6379, enabled: true },
      prod:    parseTcpFromUrl(process.env.REDIS_QUEUE_URL),
      staging: null,
    },
    fix: 'docker-compose up -d redis',
    restartable: true,
  },

  // ── Dev tools (local only) — devOnly: true means DOWN is expected in prod ──
  {
    id: 'mailhog-smtp',
    name: 'MailHog SMTP',
    type: 'tcp',
    category: 'integration',
    criticality: 'low',
    devOnly: true,
    description: 'Local SMTP trap — dev only, not running in production',
    dependencies: [],
    affectedWorkflows: ['email-delivery'],
    healthPaths: {},
    logUrl:     null,
    runbookUrl: null,
    environments: {
      local:   { host: 'localhost', port: 1025, enabled: true },
      prod:    null,
      staging: null,
    },
    fix: 'docker-compose up -d mailhog',
    restartable: true,
  },
  {
    id: 'mailhog-web',
    name: 'MailHog Web',
    type: 'http',
    category: 'integration',
    criticality: 'low',
    devOnly: true,
    description: 'MailHog web UI — dev only, not running in production',
    dependencies: [],
    affectedWorkflows: ['email-delivery'],
    healthPaths: {},
    logUrl:     null,
    runbookUrl: null,
    environments: {
      local:   { url: 'http://localhost:8025', enabled: true },
      prod:    null,
      staging: null,
    },
    fix: 'docker-compose up -d mailhog',
    restartable: true,
  },

  // ── External integrations ──────────────────────────────────────────────
  {
    id: 'stripe',
    name: 'Stripe',
    type: 'http',
    category: 'integration',
    criticality: 'high',
    description: 'Payment processing — subscriptions, invoices, refunds',
    dependencies: [],
    affectedWorkflows: ['billing', 'subscription-management', 'refunds'],
    healthPaths: {},
    logUrl:     'https://dashboard.stripe.com/logs',
    runbookUrl: 'https://status.stripe.com',
    environments: {
      local:   null,
      prod:    { url: 'https://api.stripe.com/v1/charges?limit=1', enabled: true, expectedStatus: 401 },
      staging: null,
    },
  },
  {
    id: 'sendgrid',
    name: 'SendGrid',
    type: 'http',
    category: 'integration',
    criticality: 'high',
    description: 'Transactional email delivery',
    dependencies: [],
    affectedWorkflows: ['email-delivery', 'notifications', 'alerts'],
    healthPaths: {},
    logUrl:     'https://app.sendgrid.com/statistics',
    runbookUrl: 'https://status.sendgrid.com',
    environments: {
      local:   null,
      prod:    { url: 'https://api.sendgrid.com/v3/', enabled: true, expectedStatus: 401 },
      staging: null,
    },
  },
  {
    id: 'supabase',
    name: 'Supabase',
    type: 'http',
    category: 'integration',
    criticality: 'critical',
    description: 'Managed Postgres + Auth + Storage',
    dependencies: [],
    affectedWorkflows: ['all'],
    healthPaths: {},
    logUrl:     SUPABASE_LOGS,
    runbookUrl: 'https://status.supabase.com',
    environments: {
      local:   SUPABASE_LOCAL_ENABLED && SUPABASE_LOCAL_REST_URL
        ? { url: SUPABASE_LOCAL_REST_URL, enabled: true, expectedStatus: 401 }
        : null,
      prod:    process.env.SUPABASE_URL
        ? { url: `${process.env.SUPABASE_URL}/rest/v1/`, enabled: true, expectedStatus: 401 }
        : null,
      staging: null,
    },
  },

  // ── AI model services ──────────────────────────────────────────────────────
  {
    id: 'deepseek',
    name: 'DeepSeek AI',
    type: 'http',
    category: 'integration',
    criticality: 'high',
    description: 'DeepSeek AI — primary model for Fauward Relay AI assistant. If down, relay AI stops auto-responding.',
    dependencies: [],
    affectedWorkflows: ['ai-routing', 'auto-reply', 'escalation'],
    healthPaths: {},
    logUrl:     'https://platform.deepseek.com',
    runbookUrl: 'https://status.deepseek.com',
    environments: {
      local:   null,
      prod:    { url: 'https://api.deepseek.com/v1/models', enabled: true, expectedStatus: 401 },
      staging: null,
    },
  },
  {
    id: 'moonshot',
    name: 'Moonshot AI',
    type: 'http',
    category: 'integration',
    criticality: 'high',
    description: 'Moonshot Kimi — secondary AI model for Fauward Relay. If down alongside DeepSeek, relay AI is fully offline.',
    dependencies: [],
    affectedWorkflows: ['ai-routing', 'auto-reply'],
    healthPaths: {},
    logUrl:     'https://platform.moonshot.cn',
    runbookUrl: null,
    environments: {
      local:   null,
      prod:    { url: 'https://api.moonshot.ai/v1/models', enabled: true, expectedStatus: 401 },
      staging: null,
    },
  },
];

// ── Queue definitions ──────────────────────────────────────────────────────
export const QUEUES = [
  { id: 'notification',       name: 'Notification Queue',  criticality: 'high',     dlq: false },
  { id: 'webhook',            name: 'Webhook Queue',       criticality: 'high',     dlq: false },
  { id: 'outbox',             name: 'Outbox Queue',        criticality: 'critical', dlq: false },
  { id: 'pdf',                name: 'PDF Queue',           criticality: 'medium',   dlq: false },
  { id: 'analytics',          name: 'Analytics Queue',     criticality: 'low',      dlq: false },
  { id: 'scheduled-jobs',     name: 'Scheduled Jobs',      criticality: 'medium',   dlq: false },
  { id: 'route-optimization', name: 'Route Optimization',  criticality: 'medium',   dlq: false },
];

export const ENVIRONMENTS = ['local', 'prod', 'staging'];
export const ACTIVE_ENVS  = envList('STATUS_DASHBOARD_ACTIVE_ENVS', IS_VERCEL ? ['prod'] : ['local', 'prod']);

export const THRESHOLDS = {
  timeoutMs:             5000,
  degradedLatencyMs:     2000,
  downAfterFailedChecks: 2,
  queueDepthWarning:     50,
  queueDepthCritical:    500,
  queueFailedWarning:    5,
  queueFailedCritical:   50,
  oldestJobWarningSecs:  900,
};
