/**
 * Seeds knowledge base from the content structured in docs/page.tsx.
 * Run: node apps/backend/src/scripts/seed-docs-page.mjs
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), 'apps/backend/.env') });

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ENTRIES = [

  // ── Getting started ───────────────────────────────────────────────────────
  { category: 'account', problem: 'How do I get started with Fauward?',
    resolution: 'Sign up at fauward.com/signup. No card is required. Every new workspace starts with a 14-day free trial with full Pro features. The onboarding wizard sets up your subdomain, branding, team, and first shipment in minutes.' },

  { category: 'account', problem: 'What does the free trial include?',
    resolution: 'The 14-day free trial includes full Pro features — shipments, dispatch, finance, fauward Go, API access, and webhooks. No card required to start. Before the trial ends you will be prompted to choose a plan.' },

  { category: 'account', problem: 'What do I get immediately when I sign up?',
    resolution: 'You get a tenant workspace, a branded customer portal, a shipment dashboard, tracking references, team invites, and access to the onboarding wizard immediately after signup.' },

  { category: 'account', problem: 'What is the onboarding wizard?',
    resolution: 'The onboarding wizard walks you through: 1. Set your business name and subdomain (e.g. yourcompany.fauward.com). 2. Upload your logo and set brand colours. 3. Invite your first team member. 4. Create your first shipment. 5. Add the tracking widget to your website when ready.' },

  // ── Dashboard ─────────────────────────────────────────────────────────────
  { category: 'general', problem: 'What does the dashboard show?',
    resolution: 'The dashboard shows: Shipments today (jobs created/collected/in transit/delivered today), Active drivers (drivers with incomplete assigned jobs), Revenue MTD (invoiceable revenue for the current month), and Exceptions (failed deliveries, held shipments, cancellations, returns needing attention). It updates in real time.' },

  { category: 'general', problem: 'What are exceptions in Fauward?',
    resolution: 'Exceptions are shipments that need attention: FAILED_DELIVERY (recipient unavailable, wrong address, refused, or attempt failed), RETURNED (being returned to sender or depot), ON_HOLD (needs review, payment, documents, customs, or manual approval), and CANCELLED (should no longer move through the network).' },

  // ── Shipments ─────────────────────────────────────────────────────────────
  { category: 'tracking', problem: 'What are the shipment statuses?',
    resolution: 'Shipments move through: PENDING (created, not yet collected), COLLECTED (picked up from sender), IN_TRANSIT (moving through the network), OUT_FOR_DELIVERY (assigned for final delivery), DELIVERED (complete, POD available). Exception branches: FAILED_DELIVERY, RETURNED, ON_HOLD, CANCELLED.' },

  { category: 'tracking', problem: 'What information is needed to create a shipment?',
    resolution: 'You need: Sender details (name, company, address, phone, email, pickup notes, preferred window), Recipient details (name, address, phone, email, delivery notes, notification preference), Cargo details (description, quantity, weight, dimensions, declared value, special handling), and Commercial details (service level, price, customer account, invoice reference). A tracking reference is generated automatically.' },

  { category: 'tracking', problem: 'What documents does Fauward generate?',
    resolution: 'Fauward generates: Proof of Delivery (recipient name, OTP, signature, or photo + timestamp), Cargo Manifest (route/depot-level list of shipments), Shipping Labels (tracking reference, barcode/QR, sender, recipient, routing), and CSV exports for finance, reporting, and depot handovers.' },

  { category: 'tracking', problem: 'How does bulk operations work in Fauward?',
    resolution: 'In the shipment list, select multiple shipments to assign a driver, move them to a new status, export to CSV, or prepare a manifest. Use filters first to narrow by depot, customer, route, service type, or status.' },

  // ── Dispatch & Field Ops ──────────────────────────────────────────────────
  { category: 'delivery', problem: 'How does dispatch work in Fauward?',
    resolution: 'The Dispatch page turns shipments into work. You see an unassigned queue, compare driver workloads, plan routes by area/depot/window, and monitor live progress as field updates come in — without calling the field team.' },

  { category: 'delivery', problem: 'What is fauward Go?',
    resolution: 'Fauward Go is a mobile web app for drivers and field staff. No app store required — installed directly to their phone. Drivers see only their assigned work, step through jobs in order, scan QR/barcodes, capture proof of delivery, add delivery notes, and work offline (scans queue locally and sync when back online).' },

  { category: 'delivery', problem: 'What proof of delivery types does Fauward support?',
    resolution: 'Four POD types: Recipient name (low-risk courier/depot handover), OTP (higher-value deliveries requiring confirmation), Signature (B2B, regulated goods, contract-required), Photo (leave-safe locations, door drops, damaged cargo, site proof).' },

  { category: 'delivery', problem: 'Can fauward Go work offline?',
    resolution: 'Yes. Fauward Go works offline — scans and confirmations queue locally on the device and sync automatically when back online. This is designed for poor-connectivity areas and rural delivery routes.' },

  // ── Finance ────────────────────────────────────────────────────────────────
  { category: 'billing', problem: 'How does invoicing work in Fauward?',
    resolution: 'Shipment pricing flows into quotes and invoices automatically. Invoice lifecycle: DRAFT → SENT → PAID (with OVERDUE for unpaid past due date). You can create quotes, convert to invoices in one click, add manual line items (waiting time, storage, customs, insurance), send to customer billing contacts, and export reports to CSV.' },

  { category: 'billing', problem: 'How do I create an invoice?',
    resolution: 'Go to Finance in the portal. Create a quote or invoice from a shipment. Line items auto-populate from shipment pricing and customer account details. Add manual items if needed. Send to the customer and track when it is viewed, paid, or overdue. Accept payment via Stripe (card or bank transfer).' },

  { category: 'billing', problem: 'Can Fauward accept online payments?',
    resolution: 'Yes. Fauward integrates with Stripe to accept card and bank transfer payments. Payments are matched to invoices and you can track partial payments and overdue balances.' },

  // ── Team & Roles ───────────────────────────────────────────────────────────
  { category: 'account', problem: 'What roles are available in Fauward?',
    resolution: 'Tenant Admin: full access including billing, settings, branding, API keys, and all data. Manager: operations and finance without ownership-level settings. Dispatcher: create shipments, assign jobs, manage statuses, monitor routes. Agent/Driver: field operations only via Fauward Go. Customer User: view their own shipments and documents only.' },

  { category: 'account', problem: 'How do team invites work?',
    resolution: 'Invite team members from Settings → Team. They receive an email invite and set their own password. If the invite expires, resend from the team settings page. Confirm staff can log in before their first shift and that their role matches their work.' },

  { category: 'account', problem: 'What security controls does Fauward have for teams?',
    resolution: 'Enforce MFA (authenticator app) for admins, managers, finance users, and API key owners. Use the lowest role that lets each user do their job. Remove inactive users when staff leave. Create separate accounts instead of sharing logins.' },

  // ── Tracking widget ───────────────────────────────────────────────────────
  { category: 'tracking', problem: 'How do I embed a tracking widget on my website?',
    resolution: 'Add one script tag to your site: <script src="https://widget.fauward.com/embed.js" data-tenant="yourslug"></script>. Place it on your public tracking page, customer support page, and post-booking confirmation page. It inherits your brand colours and logo automatically.' },

  { category: 'tracking', problem: 'What does the tracking widget show customers?',
    resolution: 'Customers see: your branded search field with your logo and colours, current shipment status and tracking reference, customer-safe timeline with milestone timestamps (collected, in transit, out for delivery, delivered), and exception states when a shipment is failed, held, returned, or cancelled.' },

  // ── Branding ───────────────────────────────────────────────────────────────
  { category: 'general', problem: 'What can I customise in Fauward branding?',
    resolution: 'You can customise: business name and logo, portal display name and support identity, primary and accent colours (used across portal, tracking, and widget), email sender name, domain (subdomain immediately; custom domain on Pro/Enterprise), RTL layout for right-to-left languages, and document branding (labels, manifests, PODs).' },

  { category: 'general', problem: 'Is Fauward white-label?',
    resolution: 'Yes. Fauward is fully white-label. Your customers see your brand — not Fauward. Branding applies across the tenant portal, tracking widget, customer emails, and documents. Update branding any time from Settings → Branding.' },

  { category: 'general', problem: 'How do I change my logo or brand colours?',
    resolution: 'Go to Settings → Branding in the portal. Upload your logo (use a clear image that works on white backgrounds and small screens). Set your primary colour with enough contrast for buttons. Preview the customer tracking page after making changes.' },

  // ── Notifications ─────────────────────────────────────────────────────────
  { category: 'general', problem: 'What notifications does Fauward send customers?',
    resolution: 'Automatic notifications fire at key milestones: Shipment created (booking confirmation + tracking reference, email), Collected (picked up confirmation, email or SMS), Out for delivery (expect delivery soon, SMS), Delivered (completion + POD details, email or SMS), Failed delivery/held (exception explanation + next steps, email and SMS).' },

  { category: 'general', problem: 'How do I set up SMS notifications?',
    resolution: 'SMS notifications are available on Pro and Enterprise plans. Enable Twilio in Settings → Notifications. Once enabled, SMS fires at collected, out-for-delivery, delivered, and failed delivery milestones. Make sure the recipient phone number is set on each shipment.' },

  // ── API & Webhooks ─────────────────────────────────────────────────────────
  { category: 'general', problem: 'How do I create an API key?',
    resolution: 'Go to Settings → API Keys in the portal (available on Pro and Enterprise plans). Generate a key, give it a descriptive name, and treat it like a password. Use a separate API key for each integration so you can revoke one without disrupting others.' },

  { category: 'general', problem: 'What can I do with the Fauward API?',
    resolution: 'Common uses: create shipments from your website/ecommerce/warehouse system, read tracking status to display in your own customer portal, sync customer accounts between systems, and export invoice and payment data to accounting. All calls use Authorization: Bearer <your-api-key>.' },

  { category: 'general', problem: 'How do I set up webhooks?',
    resolution: 'Go to Settings → Webhooks in the portal. Register your endpoint URL and choose which events to receive. Each event is a POST with a signed JSON payload. Verify the signature before trusting the payload. Common events: shipment.status_updated, shipment.delivered, shipment.failed_delivery, invoice.paid, invoice.overdue.' },

  // ── Account & billing management ──────────────────────────────────────────
  { category: 'billing', problem: 'How do I cancel my Fauward account?',
    resolution: 'Cancel any time from Settings → Plan & Billing. Your data is retained for 30 days after cancellation so you can export records or reactivate if needed. After 30 days the workspace is purged. For any issues with cancellation, call request_human_handoff.' },

  { category: 'billing', problem: 'How does billing proration work?',
    resolution: 'Plan upgrades and downgrades take effect immediately and billing is prorated. You are charged only for the time on each plan within the billing period.' },
];

async function upsertEntries(entries) {
  let ok = 0, skip = 0;
  for (const entry of entries) {
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
      escalate: false,
    });

    if (error) console.log(`FAIL: ${entry.problem} — ${error.message}`);
    else ok++;
  }
  console.log(`✓ ${ok} inserted, ${skip} skipped (already exist)`);
}

console.log('Seeding from docs/page.tsx content...');
await upsertEntries(ENTRIES);

const { count } = await sb
  .from('relay_knowledge_base')
  .select('*', { count: 'exact', head: true })
  .is('tenant_id', null);
console.log(`✓ Total global KB entries: ${count}`);
