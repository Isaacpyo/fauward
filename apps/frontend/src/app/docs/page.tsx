import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import DocsLayout, { type DocsSection } from "@/components/marketing/DocsLayout";

const docsTitle = "Documentation | Fauward";
const docsDescription =
  "Everything you need to get your logistics business running on Fauward.";

export const metadata: Metadata = {
  title: {
    absolute: docsTitle,
  },
  description: docsDescription,
};

const sections: DocsSection[] = [
  { id: "getting-started", title: "Getting Started" },
  { id: "your-dashboard", title: "Your Dashboard" },
  { id: "shipments", title: "Shipments" },
  { id: "dispatch-field-ops", title: "Dispatch & Field Ops" },
  { id: "finance-invoicing", title: "Finance & Invoicing" },
  { id: "your-team", title: "Your Team" },
  { id: "customer-tracking-widget", title: "Customer Tracking Widget" },
  { id: "branding-white-label", title: "Branding & White-Label" },
  { id: "notifications", title: "Notifications" },
  { id: "api-webhooks", title: "API & Webhooks" },
  { id: "account-billing", title: "Account & Billing" },
];

const dashboardMetrics = [
  {
    label: "Shipments today",
    meaning: "Jobs created, collected, in transit, out for delivery, or delivered today.",
    action: "Open the shipment list filtered to today.",
  },
  {
    label: "Active drivers",
    meaning: "Drivers or agents with assigned jobs that have not been completed.",
    action: "Review dispatch capacity before assigning more work.",
  },
  {
    label: "Revenue MTD",
    meaning: "Invoiceable shipment revenue for the current month to date.",
    action: "Open Finance to review draft, sent, paid, and overdue invoices.",
  },
  {
    label: "Exceptions",
    meaning: "Failed deliveries, held shipments, cancelled jobs, or returns that need attention.",
    action: "Prioritise exception resolution before new dispatch planning.",
  },
];

const shipmentStatuses = [
  {
    status: "PENDING",
    meaning: "The shipment has been created but has not yet been collected.",
    owner: "Dispatcher or operations team",
  },
  {
    status: "COLLECTED",
    meaning: "The parcel, pallet, or cargo has been collected from the sender.",
    owner: "Driver, agent, or dispatcher",
  },
  {
    status: "IN_TRANSIT",
    meaning: "The shipment is moving through your network or between hubs.",
    owner: "Driver, linehaul team, or agent",
  },
  {
    status: "OUT_FOR_DELIVERY",
    meaning: "The shipment is assigned for final delivery to the recipient.",
    owner: "Driver or delivery agent",
  },
  {
    status: "DELIVERED",
    meaning: "Delivery is complete and proof of delivery can be generated.",
    owner: "Driver, agent, or dispatcher",
  },
];

const exceptionStatuses = [
  {
    status: "FAILED_DELIVERY",
    when: "Recipient unavailable, wrong address, refused delivery, or delivery attempt failed.",
  },
  {
    status: "RETURNED",
    when: "The shipment is being returned to the sender or origin depot.",
  },
  {
    status: "ON_HOLD",
    when: "The shipment needs review, payment, documents, customs information, or manual approval.",
  },
  {
    status: "CANCELLED",
    when: "The shipment should no longer move through the network.",
  },
];

const teamRoles = [
  {
    role: "Tenant Admin",
    bestFor: "Business owners and senior operators",
    access: "Full access to billing, settings, users, branding, API keys, finance, and all operational data.",
  },
  {
    role: "Tenant Manager",
    bestFor: "Operations leads and finance managers",
    access: "Operations and finance access without plan, billing, or ownership-level settings.",
  },
  {
    role: "Dispatcher",
    bestFor: "Dispatch desk and depot coordinators",
    access: "Create shipments, assign jobs, manage statuses, and monitor routes.",
  },
  {
    role: "Agent",
    bestFor: "Drivers, warehouse scanners, and field staff",
    access: "Field operations only through fauward Go or scanning workflows.",
  },
  {
    role: "Customer User",
    bestFor: "Shippers, account customers, or consignee users",
    access: "View their own shipments, timelines, and documents only.",
  },
];

const notificationTriggers = [
  {
    trigger: "Shipment created",
    customerMessage: "Confirms the booking and shares the tracking reference.",
    usualChannel: "Email",
  },
  {
    trigger: "Collected",
    customerMessage: "Confirms the item has been picked up.",
    usualChannel: "Email or SMS",
  },
  {
    trigger: "Out for delivery",
    customerMessage: "Tells the recipient to expect delivery soon.",
    usualChannel: "SMS",
  },
  {
    trigger: "Delivered",
    customerMessage: "Confirms completion and can include proof of delivery details.",
    usualChannel: "Email or SMS",
  },
  {
    trigger: "Failed delivery / held",
    customerMessage: "Explains the exception and prompts the customer to contact you or wait for updates.",
    usualChannel: "Email and SMS",
  },
];

const planDetails = [
  {
    name: "Starter",
    fit: "Small teams starting with core shipment operations.",
    includes: "Customer tracking, shipment lifecycle, labels, basic team roles, and standard support.",
  },
  {
    name: "Pro",
    fit: "Growing logistics businesses that need finance, dispatch, fleet workflows, and integrations.",
    includes: "Everything in Starter plus invoicing, dispatch, fauward Go, API access, webhooks, and advanced reporting.",
  },
  {
    name: "Enterprise",
    fit: "High-volume operators with custom domain, support, security, or procurement needs.",
    includes: "Everything in Pro plus custom domain, SLA, volume pricing, dedicated support, and tailored onboarding.",
  },
];

function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="mt-5 space-y-3">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-3 text-base leading-7 text-gray-700">
          <span className="mt-2 inline-flex h-2 w-2 shrink-0 rounded-full bg-amber-600" aria-hidden />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function NumberedList({ items }: { items: string[] }) {
  return (
    <ol className="mt-5 space-y-4">
      {items.map((item, index) => (
        <li key={item} className="flex gap-4 text-base leading-7 text-gray-700">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-50 text-sm font-bold text-amber-700">
            {index + 1}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

function DocsSectionBlock({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-28 border-b border-gray-200 py-12 first:pt-0 last:border-0 last:pb-0"
    >
      <h2 className="text-3xl font-bold tracking-tight text-gray-900">{title}</h2>
      <div className="mt-5 space-y-6 text-base leading-7 text-gray-700">{children}</div>
    </section>
  );
}

function SubHeading({ children }: { children: ReactNode }) {
  return <h3 className="pt-2 text-xl font-bold text-gray-900">{children}</h3>;
}

function Callout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
      <p className="font-bold text-gray-900">{title}</p>
      <div className="mt-2 text-sm leading-6 text-gray-700">{children}</div>
    </div>
  );
}

function CardGrid({
  items,
}: {
  items: Array<{ title: string; description: string }>;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {items.map((item) => (
        <div key={item.title} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900">{item.title}</h3>
          <p className="mt-2 text-sm leading-6 text-gray-600">{item.description}</p>
        </div>
      ))}
    </div>
  );
}

function SimpleTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: Array<Record<string, string>>;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col" className="px-5 py-3 font-bold uppercase tracking-wide text-gray-500">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {rows.map((row, index) => (
            <tr key={`${row[columns[0]]}-${index}`}>
              {columns.map((column, columnIndex) => (
                <td
                  key={column}
                  className={`px-5 py-4 align-top ${
                    columnIndex === 0 ? "whitespace-nowrap font-semibold text-gray-900" : "text-gray-700"
                  }`}
                >
                  {row[column]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DocsPage() {
  return (
    <>
      <section className="relative overflow-hidden bg-white py-16 lg:py-24">
        <div className="absolute inset-0 -z-10 bg-grid opacity-60" aria-hidden />
        <div className="marketing-container">
          <div className="max-w-3xl">
            <p className="mb-5 inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
              Tenant documentation
            </p>
            <h1 className="text-4xl font-bold leading-tight text-gray-900 md:text-5xl lg:text-6xl">
              Run your logistics business on <span className="text-amber-600">Fauward.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-gray-600">
              Set up your branded portal, manage shipments, coordinate field teams, invoice
              customers, and keep every customer informed from one workspace.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="inline-flex h-12 items-center justify-center rounded-lg bg-amber-600 px-7 text-base font-semibold text-white transition hover:bg-amber-700"
              >
                Start free trial
              </Link>
              <a
                href="#getting-started"
                className="inline-flex h-12 items-center justify-center rounded-lg border border-gray-300 px-7 text-base font-semibold text-gray-700 transition hover:bg-gray-50"
              >
                Read setup guide
              </a>
            </div>
          </div>
        </div>
      </section>

      <DocsLayout sections={sections}>
        <article className="mx-auto max-w-4xl">
          <DocsSectionBlock id="getting-started" title="Getting Started">
            <p>
              Sign up at{" "}
              <Link href="/signup" className="font-semibold text-amber-700 underline-offset-4 hover:underline">
                fauward.com/signup
              </Link>
              . No card is required, and every new workspace starts with a 14-day free trial.
            </p>

            <CardGrid
              items={[
                {
                  title: "What you get immediately",
                  description:
                    "A tenant workspace, branded customer portal, shipment dashboard, tracking references, team invites, and access to the onboarding wizard.",
                },
                {
                  title: "What you should prepare",
                  description:
                    "Your business name, logo, preferred brand colours, sender address, first team member, and one real shipment to test your workflow.",
                },
              ]}
            />

            <SubHeading>Onboarding wizard</SubHeading>
            <p>After signup, the onboarding wizard walks you through the minimum setup:</p>
            <NumberedList
              items={[
                "Set your business name and subdomain, such as yourcompany.fauward.com.",
                "Upload your logo and set your brand colours for the portal, emails, and widget.",
                "Invite your first team member and choose the right role for them.",
                "Create your first shipment and confirm the tracking timeline looks right.",
                "Add the tracking or booking widget to your website when you are ready for customer traffic.",
              ]}
            />

            <SubHeading>First-day checklist</SubHeading>
            <CheckList
              items={[
                "Create a test shipment from your own address to a known recipient.",
                "Assign it to yourself or a dispatcher, then move it through each status.",
                "Generate a proof of delivery document and confirm the customer timeline is clear.",
                "Send yourself a sample notification so you can review the sender name and branding.",
                "Invite the team members who will operate live jobs and enforce MFA for sensitive roles.",
              ]}
            />

            <Callout title="Portal access">
              <p>
                Your portal is available immediately at your subdomain. Customers can use your
                branded tracking page as soon as a shipment has a tracking reference.
              </p>
            </Callout>
          </DocsSectionBlock>

          <DocsSectionBlock id="your-dashboard" title="Your Dashboard">
            <p>
              The dashboard is the daily control room for your operation. It is designed for owners,
              managers, dispatchers, and finance users who need a live summary without digging
              through every module.
            </p>

            <SimpleTable
              columns={["Metric", "What it means", "What to do next"]}
              rows={dashboardMetrics.map((metric) => ({
                Metric: metric.label,
                "What it means": metric.meaning,
                "What to do next": metric.action,
              }))}
            />

            <SubHeading>Activity feed</SubHeading>
            <p>
              The feed shows recent operational activity such as new shipments, status changes,
              assignments, invoice updates, customer messages, and failed delivery events. Use it
              during shift handovers to understand what changed while a manager or dispatcher was away.
            </p>

            <SubHeading>Quick actions</SubHeading>
            <CardGrid
              items={[
                {
                  title: "Create shipment",
                  description:
                    "Open a blank shipment form for sender, recipient, cargo, pricing, and notification details.",
                },
                {
                  title: "Assign job",
                  description:
                    "Move unassigned shipments into dispatch by choosing a driver, agent, pickup window, or route.",
                },
                {
                  title: "Generate invoice",
                  description:
                    "Create a draft invoice using shipment pricing and customer account details.",
                },
                {
                  title: "Review exceptions",
                  description:
                    "Jump to failed deliveries, held shipments, returns, and cancelled work that needs a decision.",
                },
              ]}
            />

            <Callout title="Real-time updates">
              <p>
                Dashboard counts, activity, and status changes update in real time. If another user
                assigns a job or a driver confirms delivery, the dashboard reflects it without a manual refresh.
              </p>
            </Callout>
          </DocsSectionBlock>

          <DocsSectionBlock id="shipments" title="Shipments">
            <p>
              Shipments are the core record in Fauward. A shipment contains the sender, recipient,
              cargo, pricing, route, status history, documents, and customer-facing tracking timeline.
            </p>

            <p>Every shipment moves through a defined status lifecycle:</p>
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-gray-50 p-4">
              <code className="whitespace-nowrap text-sm font-semibold text-gray-800">
                PENDING -&gt; COLLECTED -&gt; IN_TRANSIT -&gt; OUT_FOR_DELIVERY -&gt; DELIVERED
              </code>
            </div>

            <SimpleTable
              columns={["Status", "Meaning", "Typical owner"]}
              rows={shipmentStatuses.map((status) => ({
                Status: status.status,
                Meaning: status.meaning,
                "Typical owner": status.owner,
              }))}
            />

            <SubHeading>Exception branches</SubHeading>
            <SimpleTable
              columns={["Status", "When to use it"]}
              rows={exceptionStatuses.map((status) => ({
                Status: status.status,
                "When to use it": status.when,
              }))}
            />

            <SubHeading>Creating a shipment</SubHeading>
            <p>
              Create shipments from the dashboard, shipment list, booking widget, or API. Fill in
              sender, recipient, cargo details, service type, pricing, and any collection or delivery
              instructions. A tracking reference such as{" "}
              <code className="rounded bg-amber-50 px-1.5 py-0.5 text-sm font-semibold text-amber-700">
                FW-10482
              </code>{" "}
              is generated automatically.
            </p>

            <CheckList
              items={[
                "Sender details: name, company, address, phone, email, pickup notes, and preferred pickup window.",
                "Recipient details: name, company, address, phone, email, delivery notes, and notification preference.",
                "Cargo details: item description, quantity, weight, dimensions, declared value, fragility, and special handling notes.",
                "Commercial details: service level, price, tax treatment, customer account, and invoice reference.",
              ]}
            />

            <SubHeading>Tracking & timeline</SubHeading>
            <p>
              Every status change is logged with a timestamp, source, and user where available. The
              internal timeline helps your team audit what happened. The customer timeline presents
              the customer-safe version of the same journey.
            </p>

            <SubHeading>Bulk operations</SubHeading>
            <p>
              In the shipment list, select multiple shipments to assign a driver, move them to a new
              status, export them to CSV, or prepare a manifest. Use filters before selecting rows if
              you only want to update a specific depot, customer, route, service type, or status.
            </p>

            <SubHeading>Documents</SubHeading>
            <CardGrid
              items={[
                {
                  title: "Proof of delivery",
                  description:
                    "Generated after completion using captured recipient name, OTP, signature, photo, and delivery timestamp.",
                },
                {
                  title: "Cargo manifest",
                  description:
                    "A route or depot-level document listing shipments, references, destinations, and handling notes.",
                },
                {
                  title: "Shipping labels",
                  description:
                    "Printable labels containing the tracking reference, barcode or QR code, sender, recipient, and routing details.",
                },
                {
                  title: "CSV exports",
                  description:
                    "Operational exports for finance review, customer reporting, depot handovers, and exception analysis.",
                },
              ]}
            />
          </DocsSectionBlock>

          <DocsSectionBlock id="dispatch-field-ops" title="Dispatch & Field Ops">
            <SubHeading>Dispatch</SubHeading>
            <p>
              The Dispatch page turns shipments into work. Assign jobs to drivers or agents, plan
              routes, set pickup windows, and monitor progress as field updates come in.
            </p>

            <CardGrid
              items={[
                {
                  title: "Unassigned queue",
                  description:
                    "See shipments that need a driver, agent, route, pickup window, or operational decision.",
                },
                {
                  title: "Driver workload",
                  description:
                    "Compare active jobs by driver before assigning additional pickups or deliveries.",
                },
                {
                  title: "Route planning",
                  description:
                    "Group shipments by area, depot, delivery window, service level, or customer account.",
                },
                {
                  title: "Live progress",
                  description:
                    "Track when jobs are collected, scanned, held, failed, or delivered without calling the field team.",
                },
              ]}
            />

            <SubHeading>fauward Go</SubHeading>
            <p>
              Your field team uses fauward Go, a mobile web app installed directly to their phone
              with no app store required. Drivers see only their assigned work and step through each
              job in the correct order.
            </p>
            <CheckList
              items={[
                "View assigned pickups, linehaul movements, deliveries, and exception tasks.",
                "Scan QR codes or barcodes at each stop to verify the right parcel.",
                "Capture proof of delivery with recipient name, OTP, signature, or photo.",
                "Add delivery notes when access is blocked, a recipient is unavailable, or cargo is damaged.",
                "Work offline while scans and confirmations queue locally and sync when the device is back online.",
              ]}
            />

            <SubHeading>Proof of delivery options</SubHeading>
            <SimpleTable
              columns={["Proof type", "Best for", "Customer value"]}
              rows={[
                {
                  "Proof type": "Recipient name",
                  "Best for": "Low-risk courier and depot handover workflows.",
                  "Customer value": "Shows who accepted the shipment.",
                },
                {
                  "Proof type": "OTP",
                  "Best for": "Higher-value deliveries where the recipient must confirm possession.",
                  "Customer value": "Reduces disputes and mistaken handoffs.",
                },
                {
                  "Proof type": "Signature",
                  "Best for": "B2B delivery, regulated goods, or contract-required proof.",
                  "Customer value": "Creates a signed completion record.",
                },
                {
                  "Proof type": "Photo",
                  "Best for": "Leave-safe locations, door drops, damaged cargo, or site proof.",
                  "Customer value": "Provides visual confirmation of the delivery state.",
                },
              ]}
            />

            <SubHeading>Agents</SubHeading>
            <p>
              For simpler scan-and-advance workflows, the agents app lets field staff quickly update
              shipment status by scanning a tracking label. It is useful at depots, warehouses,
              partner counters, and temporary collection points.
            </p>
          </DocsSectionBlock>

          <DocsSectionBlock id="finance-invoicing" title="Finance & Invoicing">
            <p>
              Finance connects shipment operations to billing. Pricing entered on shipments can flow
              into quotes, invoices, payment tracking, and reconciliation.
            </p>

            <CardGrid
              items={[
                {
                  title: "Quotes",
                  description:
                    "Prepare a customer price before the job is accepted. Convert the quote to an invoice when the work is confirmed.",
                },
                {
                  title: "Invoices",
                  description:
                    "Invoice line items can auto-populate from shipment pricing, service fees, surcharges, and customer account details.",
                },
                {
                  title: "Payments",
                  description:
                    "Accept payment via Stripe, including card and bank transfer where enabled for your account.",
                },
                {
                  title: "Reconciliation",
                  description:
                    "Match payments to invoices, review partial payments, and identify overdue customer balances.",
                },
              ]}
            />

            <SubHeading>Invoice lifecycle</SubHeading>
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-gray-50 p-4">
              <code className="whitespace-nowrap text-sm font-semibold text-gray-800">
                DRAFT -&gt; SENT -&gt; PAID
              </code>
              <span className="ml-3 text-sm text-gray-600">with OVERDUE for unpaid invoices past the due date</span>
            </div>

            <CheckList
              items={[
                "Create quotes and convert them to invoices in one click.",
                "Auto-populate line items from shipment pricing, service type, and customer account details.",
                "Add manual line items for waiting time, storage, customs handling, insurance, or special services.",
                "Send invoices to customer billing contacts and track when they become overdue.",
                "Export invoice history, payments, and reconciliation reports to CSV.",
              ]}
            />

            <Callout title="Operational habit">
              <p>
                Keep pricing accurate on each shipment before delivery. That gives finance a cleaner
                invoice draft and reduces manual edits at month end.
              </p>
            </Callout>
          </DocsSectionBlock>

          <DocsSectionBlock id="your-team" title="Your Team">
            <p>
              Invite team members from{" "}
              <span className="font-semibold text-gray-900">Settings -&gt; Team</span>. Each member
              gets a role that controls what they can see and do.
            </p>

            <SimpleTable
              columns={["Role", "Best for", "Access"]}
              rows={teamRoles.map((role) => ({
                Role: role.role,
                "Best for": role.bestFor,
                Access: role.access,
              }))}
            />

            <SubHeading>Invites and onboarding</SubHeading>
            <p>
              Members receive an email invite and set their own password. If the invite expires,
              resend it from the team settings page. For operational staff, confirm they can log in
              before their first shift and that their assigned role matches the work they need to do.
            </p>

            <SubHeading>Security controls</SubHeading>
            <CheckList
              items={[
                "Enforce MFA with an authenticator app for admins, managers, finance users, and API key owners.",
                "Use the lowest role that lets each user do their job.",
                "Remove inactive users when staff leave, change depot, or no longer need access.",
                "Create separate user accounts instead of sharing one dispatcher or driver login.",
              ]}
            />
          </DocsSectionBlock>

          <DocsSectionBlock id="customer-tracking-widget" title="Customer Tracking Widget">
            <p>
              Embed a branded tracking widget on your own website so customers can check shipment
              status without contacting your team. This reduces inbound calls and gives customers a
              self-service way to see the latest timeline.
            </p>

            <SubHeading>Embed code</SubHeading>
            <p>Add one script tag to your site:</p>
            <pre className="overflow-x-auto rounded-xl border border-gray-200 bg-gray-950 p-5 text-sm leading-6 text-gray-100">
              <code>{`<script src="https://widget.fauward.com/embed.js" data-tenant="yourslug"></script>`}</code>
            </pre>

            <SubHeading>What customers see</SubHeading>
            <CheckList
              items={[
                "A branded tracking search field using your logo and colours.",
                "Current shipment status, tracking reference, and customer-safe timeline.",
                "Milestone timestamps such as collected, in transit, out for delivery, and delivered.",
                "Exception states when a shipment is failed, held, returned, or cancelled.",
              ]}
            />

            <SubHeading>Recommended placement</SubHeading>
            <p>
              Add the widget to your public tracking page, customer support page, and post-booking
              confirmation page. If your website has a customer portal, place it where customers
              already go for shipment updates.
            </p>

            <Callout title="Brand inheritance">
              <p>
                The widget inherits your configured brand colours and logo automatically, so changes
                made in Settings -&gt; Branding appear consistently across the portal and widget.
              </p>
            </Callout>
          </DocsSectionBlock>

          <DocsSectionBlock id="branding-white-label" title="Branding & White-Label">
            <p>
              Fauward is fully white-label, so your customers experience your logistics brand rather
              than Fauward. Branding applies across the portal, tracking widget, customer emails, and
              customer-facing documents where supported.
            </p>

            <SubHeading>What you can customise</SubHeading>
            <CardGrid
              items={[
                {
                  title: "Business identity",
                  description:
                    "Set your business name, logo, portal display name, and customer-facing support identity.",
                },
                {
                  title: "Colours",
                  description:
                    "Set primary and accent colours used across the tenant portal, customer tracking, and widget.",
                },
                {
                  title: "Domain",
                  description:
                    "Use your Fauward subdomain immediately. Enterprise customers can configure a custom domain.",
                },
                {
                  title: "Email sender",
                  description:
                    "Set the sender name customers see when receiving tracking and finance notifications.",
                },
                {
                  title: "Languages and layout",
                  description:
                    "Use RTL layout support for right-to-left languages where your customer experience requires it.",
                },
                {
                  title: "Documents",
                  description:
                    "Keep labels, manifests, and proof of delivery documents consistent with your customer-facing brand.",
                },
              ]}
            />

            <SubHeading>Branding checklist</SubHeading>
            <CheckList
              items={[
                "Use a clear logo that works on white backgrounds and small screens.",
                "Choose a primary colour with enough contrast for buttons and important labels.",
                "Preview the customer tracking page after making changes.",
                "Send yourself a test notification to confirm the customer-facing sender name.",
                "Review documents after brand changes if your team prints labels or PODs.",
              ]}
            />

            <p>
              Update your branding any time from{" "}
              <span className="font-semibold text-gray-900">Settings -&gt; Branding</span>.
            </p>
          </DocsSectionBlock>

          <DocsSectionBlock id="notifications" title="Notifications">
            <p>
              Fauward sends automatic notifications to your customers at key shipment milestones.
              Use notifications to reduce support volume, improve customer confidence, and keep
              delivery expectations clear.
            </p>

            <SubHeading>Channels</SubHeading>
            <SimpleTable
              columns={["Channel", "Use it for", "Setup"]}
              rows={[
                {
                  Channel: "Email",
                  "Use it for": "Shipment confirmations, delivery updates, invoices, PODs, and longer messages.",
                  Setup: "Uses your configured sender name.",
                },
                {
                  Channel: "SMS",
                  "Use it for": "Time-sensitive collection, out-for-delivery, delivery, and exception alerts.",
                  Setup: "Enable Twilio in Settings -> Notifications.",
                },
                {
                  Channel: "Messaging",
                  "Use it for": "Direct customer conversations inside your support inbox.",
                  Setup: "Use the Messaging tab powered by Relay.",
                },
              ]}
            />

            <SubHeading>Common triggers</SubHeading>
            <SimpleTable
              columns={["Trigger", "Customer message", "Usual channel"]}
              rows={notificationTriggers.map((trigger) => ({
                Trigger: trigger.trigger,
                "Customer message": trigger.customerMessage,
                "Usual channel": trigger.usualChannel,
              }))}
            />

            <SubHeading>Customer messaging tips</SubHeading>
            <CheckList
              items={[
                "Keep milestone messages short and specific.",
                "Use your brand sender name so customers recognise the update.",
                "Avoid exposing internal route, depot, or staff details in customer-facing messages.",
                "Use failed-delivery messages to tell customers what happens next.",
                "Review notifications when you change your operating hours or support process.",
              ]}
            />
          </DocsSectionBlock>

          <DocsSectionBlock id="api-webhooks" title="API & Webhooks">
            <p>
              API keys and webhooks help you connect Fauward to your own booking forms, ecommerce
              systems, finance tools, customer portals, warehouse software, and reporting workflows.
            </p>

            <SubHeading>API keys</SubHeading>
            <p>
              Generate API keys from{" "}
              <span className="font-semibold text-gray-900">Settings -&gt; API Keys</span>. Keys
              are scoped to your tenant and should be treated like passwords.
            </p>

            <p>All API calls use:</p>
            <pre className="overflow-x-auto rounded-xl border border-gray-200 bg-gray-950 p-5 text-sm leading-6 text-gray-100">
              <code>{`Authorization: Bearer <your-api-key>`}</code>
            </pre>

            <SubHeading>Common API uses</SubHeading>
            <CardGrid
              items={[
                {
                  title: "Create shipments",
                  description:
                    "Send new bookings from your website, ecommerce checkout, warehouse system, or customer portal into Fauward.",
                },
                {
                  title: "Read tracking status",
                  description:
                    "Display shipment status in your own customer portal or account dashboard.",
                },
                {
                  title: "Sync customers",
                  description:
                    "Keep customer account names, billing contacts, and references aligned with your source system.",
                },
                {
                  title: "Export finance data",
                  description:
                    "Pull invoices, payment status, or shipment charges into your accounting or reporting process.",
                },
              ]}
            />

            <SubHeading>Webhooks</SubHeading>
            <p>
              Register webhook endpoints to receive real-time events when shipments change status,
              invoices are paid, and other important updates happen. Configure endpoints from{" "}
              <span className="font-semibold text-gray-900">Settings -&gt; Webhooks</span>.
            </p>

            <p>
              Each event is delivered as a POST with a JSON payload and signed with your webhook
              secret. Your receiving system should verify the signature before trusting the payload.
            </p>

            <pre className="overflow-x-auto rounded-xl border border-gray-200 bg-gray-950 p-5 text-sm leading-6 text-gray-100">
              <code>{`{
  "event": "shipment.status_updated",
  "tenant": "yourslug",
  "data": {
    "trackingReference": "FW-10482",
    "previousStatus": "IN_TRANSIT",
    "status": "OUT_FOR_DELIVERY",
    "updatedAt": "2026-04-26T09:30:00Z"
  }
}`}</code>
            </pre>

            <SubHeading>Common events</SubHeading>
            <CheckList
              items={[
                "shipment.status_updated",
                "shipment.delivered",
                "shipment.failed_delivery",
                "invoice.paid",
                "invoice.overdue",
                "customer.message_received",
              ]}
            />

            <Callout title="Operational advice">
              <p>
                Give each integration its own API key where possible. That makes it easier to rotate
                or revoke one system without disrupting the rest of your operation.
              </p>
            </Callout>
          </DocsSectionBlock>

          <DocsSectionBlock id="account-billing" title="Account & Billing">
            <SubHeading>Plans</SubHeading>
            <SimpleTable
              columns={["Plan", "Best fit", "Includes"]}
              rows={planDetails.map((plan) => ({
                Plan: plan.name,
                "Best fit": plan.fit,
                Includes: plan.includes,
              }))}
            />

            <p>
              Upgrade or downgrade from{" "}
              <span className="font-semibold text-gray-900">Settings -&gt; Plan & Billing</span>.
              Changes take effect immediately, and billing is prorated.
            </p>

            <SubHeading>Trial</SubHeading>
            <p>
              Your 14-day trial includes full Pro features. No card is required to start. Before the
              trial ends, you will be prompted to add a payment method and choose the plan that fits
              your shipment volume and operating needs.
            </p>

            <SubHeading>Billing administration</SubHeading>
            <CheckList
              items={[
                "Only users with billing access should manage plans, payment methods, and invoices.",
                "Keep the billing contact email current so invoice and renewal notices reach the right person.",
                "Review plan limits before seasonal peaks, new customer launches, or additional depot rollouts.",
                "Export operational and finance data before major account changes if your internal process requires it.",
              ]}
            />

            <SubHeading>Cancellation</SubHeading>
            <p>
              Cancel any time from{" "}
              <span className="font-semibold text-gray-900">Settings -&gt; Plan & Billing</span>.
              Your data is retained for 30 days after cancellation so you can export records or
              reactivate the workspace if needed.
            </p>
          </DocsSectionBlock>
        </article>
      </DocsLayout>
    </>
  );
}
