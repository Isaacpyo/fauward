# Fauward Agent — Product & Pricing

← [Back to README](../README.md)

---

## Built in, not bolted on

Fauward Agent runs inside your workspace. It automatically assigns shipments, monitors SLA deadlines, handles failed deliveries, and answers your operations questions in plain English — all within your existing plan, with no extra setup.

**For logistics companies (platform operators):**
It runs your dispatch loop. Shipments get assigned, customers get notified, and SLA risks get flagged — without a dispatcher needing to log in.

**For enterprise shippers (buyers of logistics services):**
It gives you direct, plain-English visibility into what's happening with your shipments. No waiting for a report. No chasing your LSP for a CSV.

---

## What it does

These are the six things the agent does automatically, as shown on the Agent page in your dashboard:

### Shipment assignment
New shipments are automatically assigned to the best available Fauward Go operator based on proximity, capacity, and current workload. No dispatcher needed.

### Exception handling
Failed deliveries trigger instant customer notifications and SLA risk flags. Rerouting is recommended and escalated for your approval — never done silently.

### SLA monitoring
Shipments approaching their deadline are flagged **HIGH** (>60 min delay) or **MEDIUM** (30–60 min) and logged for supervisor review before a breach occurs.

### Customer notifications
Status updates trigger email or SMS using approved templates — out for delivery, delayed, failed, reattempt scheduled. Duplicate sends are prevented automatically.

### Carrier selection
Live rate card pricing is fetched per route and weight. The agent surfaces the best option by cost, service tier, and estimated delivery time.

### Natural language queries
Ask "How many shipments failed this week?" and get a direct answer — no dashboards, no filters, no SQL. Available directly from your Agent dashboard page.

---

## Ask a question — how it works in the dashboard

On the Agent page, your operations team types a question and hits **Ask**. The agent queries your live data and responds in plain English, usually in 10–45 seconds.

**Example questions your team can ask:**

- *How many shipments failed this week?*
- *What are the top delay reasons this month?*
- *Show me SLA breach rate for the last 30 days*
- *Which Fauward Go operators have the best on-time rate?*

Every response shows which tools were called, how long each took, and total token usage — so your team can see exactly what data the agent queried to produce the answer. Nothing is hidden.

---

## What requires your approval

Fauward Agent is not fully autonomous. Anything that could cause a significant operational change is escalated — never executed silently:

- Rerouting a shipment that already has an assigned Fauward Go operator
- Reassigning a Fauward Go operator after a label has been purchased
- Any action involving cancellations, refunds, or carrier overrides

These actions appear in the agent response with a clear flag. Your team reviews and decides.

---

## Safe by design

### Policy-controlled
Every action is classified before it runs. Safe operations execute automatically. Risky ones — like rerouting an assigned shipment — require your approval. Blocked actions (like accessing another tenant's data) cannot execute at all.

### Tenant-isolated
The agent can only access data belonging to your workspace. Cross-tenant access is blocked at five independent layers — route, schema, policy, handler, and audit.

### Fully audited
Every tool call is logged with decision, duration, and outcome. No action is taken silently. Every response shows which tools ran and how long they took. Coming soon: Agent Activity tab in your dashboard.

---

## Pricing

Fauward Agent is included in **Pro** and **Enterprise** plans. Starter workspaces see the Agent page with an upgrade prompt.

| | Starter | Pro | Enterprise |
|---|---|---|---|
| **Fauward Agent** | ✗ | ✓ | ✓ |
| **Agent runs per month** | — | 1,000 | Unlimited |
| **Natural language queries** | — | ✓ | ✓ |
| **Shipment assignment** | — | ✓ | ✓ |
| **SLA monitoring + alerts** | — | ✓ | ✓ |
| **Customer notifications** | — | ✓ | ✓ |
| **Carrier selection** | — | ✓ | ✓ |
| **Approval workflow UI** | — | — | ✓ *(coming)* |
| **Agent Activity dashboard** | — | — | ✓ *(coming)* |
| **Custom model configuration** | — | — | ✓ |
| **Priority agent support** | — | — | ✓ |

**What counts as a run?**
One run = one event processed. A `shipment_created` event is one run. A failed delivery is one run. A natural language query is one run. A single run can call multiple tools internally — that still counts as one run.

**What happens at 1,000 runs on Pro?**
Additional runs pause until the next billing cycle. You'll receive a warning at 80% usage. Upgrade to Enterprise for unlimited runs.

---

## What it is not

- **Not a general-purpose chatbot.** The agent only acts through 14 pre-defined, scoped tools. It cannot access the internet, generate arbitrary code, or answer questions outside your logistics operations.
- **Not a replacement for your team.** It handles safe, repeatable work. Your dispatchers and operations managers handle everything that requires context, judgment, or escalation.
- **Not another integration.** No third-party AI accounts to set up, no API keys to manage in your portal, no separate billing.

---

## Frequently asked questions

**Can the agent make mistakes?**
Yes. The model can misread a situation or call the wrong tool. That's why every write operation is logged in an audit trail, rerouting always requires human approval, and assignment is reversible. We've designed for failure deliberately.

**Does it work outside business hours?**
Yes. The agent fires whenever an event occurs — midnight, weekends, public holidays. That's the primary value: 24/7 coverage without adding headcount.

**Can I turn it off?**
Yes. The agent only fires when your backend emits an event. It can be disabled workspace-wide or per event type without any code changes.

**Is our shipment data used to train the model?**
No. Queries are sent for inference only. Data is not retained or used for training. Enterprise customers can request a Data Processing Agreement.

**What happens if the AI provider is down?**
The agent returns a structured failure result. Your shipment operations continue normally — the agent is a non-blocking layer. Nothing in your core platform depends on it.

---

## Outcomes from live testing

These figures are from live end-to-end tests against the Fauward platform, not estimates.

- **Fauward Go operator assignment:** 766ms average (single tool execution)
- **Full shipment_created run** (parallel Fauward Go + carrier fetch → assign): ~5s end-to-end
- **Operations query:** 10–45 seconds depending on how many tools are called
- **Token efficiency:** ~6,000–17,000 tokens per run after optimisation (down from 40,000 before the reasoning effort fix)
- **Parallel tool calls:** Fauward Go availability and carrier rates are fetched simultaneously, not sequentially

---

## Coming next

| Feature | Who benefits |
|---|---|
| Approval workflow UI | Operations managers — review and act on reroute recommendations from the dashboard |
| Agent Activity tab | Admins — full history of every agent run, action taken, and outcome |
| Streaming responses | Real-time visibility as the agent works through a query |
| Per-tenant agent config | Enterprise — set run limits, enabled tools, and notification budgets per workspace |
| Carrier performance analytics | LSPs and shippers — per-carrier on-time rate and volume data |
