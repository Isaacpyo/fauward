/**
 * Seeds the relay knowledge base from:
 *  1. Curated entries drawn from the Fauward .md documentation
 *  2. Auto-ingested chunks from key .md files
 *
 * Safe to rerun — uses upsert on (tenant_id, problem).
 *
 * Usage:
 *   node apps/backend/src/scripts/seed-knowledge-base.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: resolve(process.cwd(), 'apps/backend/.env') });

const url  = process.env.SUPABASE_URL;
const key  = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing'); process.exit(1); }

const sb = createClient(url, key);

// ─── 1. Curated entries from docs ─────────────────────────────────────────────

const CURATED = [

  // ── PRODUCT ───────────────────────────────────────────────────────────────
  { category: 'general', problem: 'What is Fauward?',
    resolution: 'Fauward is a multi-tenant B2B SaaS platform that gives logistics businesses — couriers, freight forwarders, and 3PLs — their own branded, fully operational logistics platform. It replaces WhatsApp coordination, Excel tracking, and expensive bespoke TMS systems. Setup takes 10 minutes and costs less than one extra staff member per month.' },

  { category: 'general', problem: 'Who is Fauward for?',
    resolution: 'Fauward is designed for logistics businesses: couriers, freight forwarders, and third-party logistics providers (3PLs). It gives them shipment management, branded customer tracking, invoicing, a driver mobile app, and a notification layer — all under their own brand.' },

  { category: 'general', problem: 'What does Fauward replace?',
    resolution: 'Fauward replaces WhatsApp shipment coordination (no tracking, no scale), Excel tracking (manual, error-prone), bespoke TMS systems (£20k–£100k to build), and expensive per-user SaaS tools like Logistaas (£450+/month for a 10-person team).' },

  { category: 'general', problem: 'What features does Fauward include?',
    resolution: 'Fauward includes: a customer-facing portal for booking and tracking, an operations dashboard for staff, a real-time tracking engine, a payment pipeline, email and SMS notifications, a driver mobile app (Fauward Go), an embeddable tracking widget, and full white-label branding per tenant.' },

  { category: 'general', problem: 'How long does it take to set up Fauward?',
    resolution: 'A new tenant can be fully set up in under 10 minutes via the self-serve onboarding flow at fauward.com. No demo calls or implementation teams required.' },

  // ── PRICING ───────────────────────────────────────────────────────────────
  { category: 'billing', problem: 'What are the pricing plans?',
    resolution: 'Fauward has three plans:\n- **Starter** – £29/month (300 shipments, 3 staff accounts, basic invoicing, email support 48h)\n- **Pro** – £79/month (2,000 shipments, 15 staff, white-label, custom domain, SMS, API, webhooks, email+Slack 12h support)\n- **Enterprise** – from £500/month (unlimited shipments and staff, SSO, multi-branch, carrier integrations, 24/7 dedicated support, SLA guarantee, data residency)\n\nAnnual pricing: Starter £290/year, Pro £790/year, Enterprise custom.' },

  { category: 'billing', problem: 'How much does Fauward cost per month?',
    resolution: 'Starter is £29/month, Pro is £79/month, Enterprise starts from £500/month. Annual plans are available at a discount: Starter £290/year, Pro £790/year. All plans are flat company pricing — not per-user. Call request_human_handoff for Enterprise or custom quotes.' },

  { category: 'billing', problem: 'Is there a free trial?',
    resolution: 'Yes. New tenants start on a free trial (TRIALING plan) when they sign up at fauward.com. The trial lets you explore the platform before committing to a paid plan.' },

  { category: 'billing', problem: 'What is included in the Starter plan?',
    resolution: 'Starter (£29/month): 300 shipments/month, 3 staff accounts, 10 client organisations, basic invoicing, document generation, email support with 48h response. No custom domain, white-label, SMS, API, webhooks, or CRM.' },

  { category: 'billing', problem: 'What is included in the Pro plan?',
    resolution: 'Pro (£79/month): 2,000 shipments/month, 15 staff accounts, unlimited client organisations, full white-label, custom domain, CRM, full finance module, SMS notifications, API access, webhooks, 1 accounting integration, email and Slack support with 12h response.' },

  { category: 'billing', problem: 'What is included in the Enterprise plan?',
    resolution: 'Enterprise (from £500/month): unlimited shipments and staff, multi-branch, SSO, all accounting integrations, carrier integrations, e-invoicing and customs, dedicated infrastructure, data residency, 99.9% SLA guarantee with credits, 24/7 dedicated support. Pricing is custom — call request_human_handoff for a quote.' },

  { category: 'billing', problem: 'What happens when I exceed my shipment limit?',
    resolution: 'On Starter, shipments are hard-stopped at 100% with an upgrade prompt. On Pro, shipments continue at £0.08/shipment overage, billed at month-end via Stripe. On Enterprise, shipments are unlimited.' },

  { category: 'billing', problem: 'What happens if my payment fails?',
    resolution: 'Day 0: payment fails, retry in 3 days. Day 3: retry — if it fails again, account is suspended and a warning email is sent. Day 7: final retry — if it fails, the portal shows "account suspended". Day 30: account is cancelled and data is retained for 30 days before purge.' },

  { category: 'billing', problem: 'How do I upgrade my plan?',
    resolution: 'Plan upgrades can be done in the tenant portal under Settings → Billing. If you need help with an upgrade or want to discuss Enterprise, call request_human_handoff.' },

  { category: 'billing', problem: 'Do you charge per user?',
    resolution: 'No. Fauward uses flat company pricing. A 50-person logistics company on Pro pays £79/month — not per-user fees. This is one of the key advantages over competitors like Logistaas.' },

  // ── ACCOUNT & ACCESS ─────────────────────────────────────────────────────
  { category: 'account', problem: 'How do I sign up for Fauward?',
    resolution: 'Go to fauward.com and start a free trial. The onboarding flow sets up your tenant, branding, and first admin account in under 10 minutes. For enterprise onboarding or guided setup, call request_human_handoff.' },

  { category: 'account', problem: 'How do I log in to the portal?',
    resolution: 'Go to your tenant subdomain (e.g. yourcompany.fauward.com) or your custom domain if you are on Pro/Enterprise. Enter your email and password. If MFA is enabled you will be prompted for a TOTP code.' },

  { category: 'account', problem: 'I cannot log in to the portal',
    resolution: 'Check you are using the correct email address and tenant URL. Try resetting your password via the "Forgot password" link on the login page. If MFA is enabled, ensure your authenticator app time is synced. If you still cannot access your account, call request_human_handoff.' },

  { category: 'account', problem: 'How do I reset my password?',
    resolution: 'Click "Forgot password" on the login page and enter your email. You will receive a reset link valid for 15 minutes. If the email does not arrive, check your spam folder. If you still cannot reset, call request_human_handoff.' },

  { category: 'account', problem: 'How do I add a team member or staff account?',
    resolution: 'Tenant Admins can add staff from Settings → Team in the portal. Roles available: Tenant Admin, Manager, Staff, Driver, Finance. Starter allows 3 staff accounts, Pro allows 15, Enterprise is unlimited.' },

  { category: 'account', problem: 'How do I add a driver?',
    resolution: 'Go to Settings → Team in the portal and invite a user with the Tenant Driver role. Once created, they can log into the Fauward Go mobile app to receive assigned jobs and submit status updates.' },

  { category: 'account', problem: 'What user roles are available?',
    resolution: 'Tenant roles: Admin (full access), Manager (operations, no billing), Staff (own shipments and assigned work), Driver (assigned stops and POD capture only), Finance (financial data only, no operations). Customer roles: Customer Admin and Customer User (scoped to their organisation).' },

  { category: 'account', problem: 'Can I set up two-factor authentication?',
    resolution: 'Yes. MFA using TOTP (e.g. Google Authenticator, Authy) can be enabled per user. Admins can require MFA for their team. Go to Account Settings → Security to set it up.' },

  // ── TRACKING ──────────────────────────────────────────────────────────────
  { category: 'tracking', problem: 'How does Fauward tracking work?',
    resolution: 'Every shipment gets a unique tracking number. As it moves through the network, tracking events are logged with status, location, and timestamps. Customers can track their shipment on a branded tracking page in real time. The tracking page only shows customer-safe information — no internal notes or driver details.' },

  { category: 'tracking', problem: 'What does my tracking number look like?',
    resolution: 'Fauward tracking numbers follow the format: first 2 letters of your company name + year + month + segments (e.g. QS2605-47-B3K9-83721). Every tracking number is unique to your tenant.' },

  { category: 'tracking', problem: 'How do I share tracking with my customer?',
    resolution: 'Each shipment has a public tracking link your customer can use. You can also embed the Fauward tracking widget on your own website. The tracking page shows your logo, brand colours, and only customer-safe status information.' },

  { category: 'tracking', problem: 'My tracking has not updated for a long time',
    resolution: 'Tracking updates when a new status event is created — either by your operations team, a driver via Fauward Go, or an automated integration. If the shipment appears stuck, use lookup_shipment to check the last known status. If it looks stale and you need to investigate, call request_human_handoff.' },

  // ── DELIVERY ──────────────────────────────────────────────────────────────
  { category: 'delivery', problem: 'What is Fauward Go?',
    resolution: 'Fauward Go is the Fauward mobile app for drivers and field workers. It shows assigned jobs, routes, and stops. Drivers use it to update shipment status, capture proof of delivery (signature, photo, OTP), and sync when back online after working in areas with poor connectivity.' },

  { category: 'delivery', problem: 'How does proof of delivery work?',
    resolution: 'Drivers capture POD through Fauward Go using a signature, photo, OTP, or recipient name. The POD is linked to the delivery event and becomes visible to the tenant operations team. POD availability is reflected on the shipment tracking record.' },

  // ── GENERAL ───────────────────────────────────────────────────────────────
  { category: 'general', problem: 'What support is available?',
    resolution: 'Support depends on your plan:\n- Starter: Email, 48-hour response\n- Pro: Email + Slack, 12-hour response\n- Enterprise: 24/7 dedicated support\n\nFor immediate help on any plan, you can reach us through this chat or call request_human_handoff.' },

  { category: 'general', problem: 'Does Fauward support multiple currencies?',
    resolution: 'Yes. Each tenant can set a default currency (GBP by default). Shipment pricing and invoicing use that currency. For multi-currency needs across regions, Enterprise plan with dedicated infrastructure is recommended.' },

  { category: 'general', problem: 'Can I use my own domain with Fauward?',
    resolution: 'Yes. Custom domains are available on Pro and Enterprise plans. You configure a CNAME record pointing to Fauward, and the platform serves your tracking pages and portal under your own domain.' },

  { category: 'general', problem: 'Does Fauward support SMS notifications?',
    resolution: 'Yes, on Pro and Enterprise plans. SMS notifications are sent to customers at key tracking milestones (picked up, out for delivery, delivered, failed delivery). Starter plan supports email notifications only.' },

  { category: 'general', problem: 'What integrations does Fauward support?',
    resolution: 'Pro includes one accounting integration (e.g. Xero, QuickBooks). Enterprise includes all accounting integrations, carrier integrations, and e-invoicing/customs support. The Fauward API is available on Pro and Enterprise for custom integrations.' },

  { category: 'general', problem: 'Is there an API?',
    resolution: 'Yes. The Fauward REST API is available on Pro and Enterprise plans. It allows you to create shipments, update statuses, and query tracking data programmatically. API keys can be created in the portal under Settings → API Keys.' },

  { category: 'general', problem: 'Does Fauward support webhooks?',
    resolution: 'Yes, on Pro and Enterprise plans. Webhooks fire on tracking events like shipment created, status changed, delivered, and failed delivery. Configure them in the portal under Settings → Webhooks.' },

  { category: 'general', problem: 'Is Fauward GDPR compliant?',
    resolution: 'Fauward is built with data privacy in mind. Customer data is tenant-scoped and never shared across tenants. Enterprise plans offer data residency options. For detailed compliance questions, call request_human_handoff.' },
];

// ─── 2. Auto-ingest .md files ─────────────────────────────────────────────────

const MD_FILES_TO_INGEST = [
  'docs/product-overview.md',
  'docs/pricing-billing.md',
  'docs/roles-permissions.md',
  'docs/logistics-core.md',
  'docs/tracking-core.md',
  'docs/auth-flows.md',
  'FAUWARD_PLATFORM_ARCHITECTURE.md',
  'SAAS_MULTITENANCY.md',
  'apps/fauward-Go/README.md',
  'services/python-services/README.md',
];

const ROOT = resolve(process.cwd());

function chunkMarkdown(content, filename) {
  const entries = [];
  const lines = content.split('\n');
  let currentHeading = '';
  let buffer = [];

  const flush = () => {
    const text = buffer.join('\n').trim();
    if (currentHeading && text.length > 80) {
      entries.push({ heading: currentHeading, body: text });
    }
    buffer = [];
  };

  for (const line of lines) {
    const h2 = line.match(/^## (.+)/);
    const h3 = line.match(/^### (.+)/);
    if (h2 || h3) {
      flush();
      currentHeading = (h2 || h3)[1].trim();
    } else {
      buffer.push(line);
    }
  }
  flush();

  return entries.map(({ heading, body }) => {
    // Strip markdown tables and code blocks for cleaner KB text
    const clean = body
      .replace(/```[\s\S]*?```/g, '')
      .replace(/\|.+\|/g, '')
      .replace(/^[-*>]+\s*/gm, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (clean.length < 60) return null;

    const slug = filename.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    return {
      category: inferCategory(heading, filename),
      problem: heading,
      resolution: clean.slice(0, 1200),
    };
  }).filter(Boolean);
}

function inferCategory(heading, filename) {
  const h = heading.toLowerCase();
  const f = filename.toLowerCase();
  if (/track|delivery|shipment|status|pod/.test(h)) return 'tracking';
  if (/delivery|driver|field|go|pwa/.test(h + f)) return 'delivery';
  if (/pric|billing|plan|cost|payment|invoice|subscription/.test(h)) return 'billing';
  if (/account|auth|login|sign|role|user|password|mfa/.test(h)) return 'account';
  return 'general';
}

// ─── 3. Upsert all entries ────────────────────────────────────────────────────

async function upsertEntries(entries, label) {
  let ok = 0, skip = 0, fail = 0;
  for (const entry of entries) {
    if (!entry.problem?.trim() || !entry.resolution?.trim()) { skip++; continue; }

    // Check for existing entry with same problem
    const { data: existing } = await sb
      .from('relay_knowledge_base')
      .select('id')
      .eq('problem', entry.problem.trim())
      .is('tenant_id', null)
      .maybeSingle();

    if (existing) { skip++; continue; }

    const { error } = await sb.from('relay_knowledge_base').insert({
      tenant_id: null,
      category: entry.category,
      problem: entry.problem.trim().slice(0, 200),
      resolution: entry.resolution.trim().slice(0, 2000),
      escalate: entry.escalate ?? false,
    });

    if (error) { fail++; if (!error.message.includes('duplicate')) console.log(`  FAIL [${entry.problem}]: ${error.message}`); }
    else ok++;
  }
  console.log(`${label}: ${ok} inserted, ${skip} skipped (exists), ${fail} failed`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log('Seeding Fauward knowledge base...\n');

// Curated entries
await upsertEntries(CURATED, 'Curated docs KB');

// Auto-ingested .md chunks
let mdEntries = [];
for (const rel of MD_FILES_TO_INGEST) {
  const full = join(ROOT, rel);
  try {
    const content = readFileSync(full, 'utf8');
    const chunks = chunkMarkdown(content, rel);
    mdEntries.push(...chunks);
    console.log(`  parsed ${rel}: ${chunks.length} chunks`);
  } catch {
    console.log(`  skip ${rel}: not found`);
  }
}
await upsertEntries(mdEntries, 'MD file chunks');

// Final count
const { count } = await sb.from('relay_knowledge_base').select('*', { count: 'exact', head: true }).is('tenant_id', null);
console.log(`\n✓ Total global KB entries: ${count}`);
