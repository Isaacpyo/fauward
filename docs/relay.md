# Fauward Relay

AI-assisted customer support and tenant messaging for Fauward. Relay triages inbound customer messages, creates agent-reviewable drafts, and escalates risky conversations. AI output is never sent to a customer without human approval.

Navigation: [Tracking Core](./tracking-core.md) | [Platform Superadmin](./platform-superadmin-public.md) | [README](../README.md)

---

## Contents

1. [Current Guarantees](#1-current-guarantees)
2. [Architecture](#2-architecture)
3. [AI Flow](#3-ai-flow)
4. [Draft Approval Flow](#4-draft-approval-flow)
5. [Data Model](#5-data-model)
6. [API Routes](#6-api-routes)
7. [Tracking Integration](#7-tracking-integration)
8. [Knowledge Base](#8-knowledge-base)
9. [Widget and Frontend Routing](#9-widget-and-frontend-routing)
10. [Configuration](#10-configuration)
11. [Operational Checks](#11-operational-checks)
12. [File Index](#12-file-index)

---

## 1. Current Guarantees

Relay follows these platform rules:

- All AI calls go through `LLMGatewayService`.
- There are no direct DeepSeek or OpenAI API calls in Relay.
- AI-generated replies are always drafts.
- AI drafts are surfaced to a human agent queue for review.
- Customer delivery only happens when a human calls `POST /api/v1/tenant/relay/messages/:id/approve-and-send`.
- System status notifications created from deterministic `TrackingEvent` updates may send automatically. They are not AI-generated.
- Tenant portal conversations are tenant-scoped and validated before reads, writes, and approval.
- Customer-facing tracking information is sourced from the unified tracking core, not legacy shipment events.

---

## 2. Architecture

```text
Customer message
  -> POST /api/v1/relay/conversations/:id/messages
  -> handleCreateMessage()
  -> customer message inserted as non-draft
  -> fireRelayAi() when sender_type = customer
  -> runRelayAi()
  -> LLMGatewayService task = relay_classify
  -> optional LLMGatewayService task = relay_escalation_analysis
  -> insert relay_messages row as draft
  -> tenant agent reviews
  -> POST /api/v1/tenant/relay/messages/:id/approve-and-send
  -> is_draft = false, draft_mode = false, approved_by/approved_at set
  -> realtime clients treat approval as the send signal
```

Relay uses:

| Layer | Implementation |
|---|---|
| HTTP routes | `apps/backend/src/modules/relay/relay.routes.ts` |
| AI orchestration | `apps/backend/src/modules/relay/relay.ai.service.ts` |
| AI provider gateway | `apps/backend/src/shared/services/llm-gateway.service.ts` |
| Shared Supabase API handlers | `packages/relay-api/src/index.ts` |
| Shared Relay types | `packages/relay-api/src/types.ts` |
| Customer widget | `packages/relay-ui/src/RelayWidget.tsx` |
| Tenant inbox UI | `packages/relay-ui/src/RelayMessagingTab.tsx` |

---

## 3. AI Flow

`runRelayAi()` is called only after a customer message. It uses `LLMGatewayService` directly.

### Classification

Relay first calls:

```ts
llmGateway.run({
  task: "relay_classify",
  tenantId,
  input: { conversationId, message, conversation },
  outputSchema: RelayClassificationSchema,
  allowAutoAction: false
})
```

Expected structured output:

```ts
{
  category: string;
  urgency: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  customerSentiment: string;
  recommendedAction: "AUTO_REPLY" | "QUEUE_FOR_AGENT" | "ESCALATE_TO_SUPPORT";
  confidence: number;
  draftReply?: string;
}
```

Decision rules:

| Condition | Result |
|---|---|
| `confidence < 0.60` | Set `ai_status = human_needed`; do not surface an AI suggestion |
| `recommendedAction = ESCALATE_TO_SUPPORT` | Run escalation analysis |
| `urgency = HIGH` or `CRITICAL` | Run escalation analysis |
| `confidence >= 0.85` and `AUTO_REPLY` | Insert `draftReply` as a draft for approval |
| Otherwise | Insert a conservative draft and mark for human review |

### Escalation Analysis

Escalation uses:

```ts
llmGateway.run({
  task: "relay_escalation_analysis",
  tenantId,
  input: { conversationId, message, classification },
  outputSchema: RelayEscalationSchema,
  allowAutoAction: false
})
```

Expected structured output:

```ts
{
  likelyCause: string;
  suggestedResolution: string;
  escalationPriority: string;
  affectedShipments: string[];
  compensationRecommended: boolean;
  confidence: number;
}
```

The escalation output is inserted as a draft JSON message:

```json
{
  "type": "escalation_analysis",
  "classification": {},
  "escalation": {}
}
```

The conversation is then marked `human_needed`.

---

## 4. Draft Approval Flow

Relay separates message creation from customer delivery.

### Draft Creation

AI drafts are inserted into `relay_messages` with:

```ts
{
  sender_type: "system",
  sender_id: "ai-agent",
  is_draft: true,
  draft_mode: true
}
```

Admin-created replies also default to draft mode in `packages/relay-api/src/index.ts`:

```ts
sender_type === "admin" -> is_draft defaults to true
sender_type === "customer" -> is_draft = false
sender_type === "system" -> is_draft defaults to false
```

The system non-draft exception is reserved for deterministic status notifications generated from tracking events.

### Human Approval

Approval route:

```http
POST /api/v1/tenant/relay/messages/:id/approve-and-send
```

The route:

1. Requires authentication.
2. Requires tenant context.
3. Reads the `relay_messages` row.
4. Rejects customer messages.
5. Reads the parent `relay_conversations` row.
6. Confirms `conversation.tenant_id === request.tenant.id`.
7. Updates:

```ts
{
  is_draft: false,
  draft_mode: false,
  approved_by: request.user?.sub,
  approved_at: new Date().toISOString()
}
```

The approval flip is the send signal consumed by Relay realtime clients.

### No Auto-Send Rule

There must be no path where an AI-drafted reply is inserted and delivered in the same operation. The implementation enforces this by:

- inserting AI output with `is_draft = true`;
- exposing a separate approve-and-send route;
- documenting the deterministic system notification exception in code.

---

## 5. Data Model

Relay conversations and messages are Supabase-managed tables.

### `relay_conversations`

Key fields:

| Column | Notes |
|---|---|
| `id` | Conversation UUID |
| `tenant_id` | Tenant scope for tenant portal conversations |
| `source_app` | `marketing` or `tenant_portal` |
| `customer_name` | Optional customer display name |
| `customer_email` | Optional customer email |
| `subject` | Optional subject |
| `status` | `open`, `assigned`, `closed` |
| `ai_status` | AI state such as `pending`, `ai_handling`, `draft_ready`, `human_needed` |
| `assigned_admin_id` | Human owner |
| `access_token_hash` | Hashed public conversation token |
| `last_message_at` | Used for inbox sorting |

### `relay_messages`

Key fields:

| Column | Notes |
|---|---|
| `id` | Message UUID |
| `conversation_id` | Parent conversation |
| `sender_type` | `customer`, `admin`, or `system` |
| `sender_id` | Customer email, user ID, or `ai-agent` |
| `body` | Text body or structured JSON string |
| `is_draft` | True until approved for customer delivery |
| `draft_mode` | Compatibility flag for draft UI |
| `approved_by` | Human user ID that approved the draft |
| `approved_at` | Approval timestamp |
| `read_at` | Read receipt timestamp |
| `created_at` | Creation timestamp |

Relay approval fields are added by:

```text
apps/backend/prisma/migrations/0017_relay_approval_fields/migration.sql
```

---

## 6. API Routes

All routes are registered by `registerRelayRoutes(app)`.

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/relay/conversations` | Authenticated | List conversations |
| `POST` | `/api/v1/relay/conversations` | Optional plus tenant portal guard | Create conversation and trigger AI for first message |
| `GET` | `/api/v1/relay/conversations/:id` | Optional plus conversation access | Get conversation |
| `PATCH` | `/api/v1/relay/conversations/:id` | Authenticated plus conversation access | Update conversation status or assignment |
| `GET` | `/api/v1/relay/conversations/:id/messages` | Optional plus conversation access | List messages |
| `POST` | `/api/v1/relay/conversations/:id/messages` | Optional plus conversation access | Insert message; trigger AI for customer messages |
| `GET` | `/api/v1/relay/feedback` | Authenticated | List feedback |
| `POST` | `/api/v1/relay/feedback` | Optional plus conversation access | Submit feedback |
| `POST` | `/api/v1/tenant/relay/messages/:id/approve-and-send` | Authenticated tenant user | Approve a draft and send it |

AI fires on:

- `POST /api/v1/relay/conversations` after a first customer message is created.
- `POST /api/v1/relay/conversations/:id/messages` when `sender_type === "customer"`.

AI does not fire when:

- the message is not from a customer;
- the conversation is already `human_needed`;
- tenant access checks fail.

---

## 7. Tracking Integration

Relay support workflows should use the unified tracking core:

1. `TrackingSnapshot` for the current customer-safe status.
2. `TrackingEvent` filtered to customer-visible events for timeline data.
3. Shipment fields only as fallback context.

Customer-facing responses must not expose internal status codes, platform-only notes, driver-only data, or tenant-internal exception details.

Tracking AI summaries and exception diagnosis live in:

```text
apps/backend/src/modules/tracking/tracking.ai.service.ts
```

Those services also use `LLMGatewayService` with:

- `tracking_customer_summary`
- `tracking_exception_analysis`

---

## 8. Knowledge Base

Relay knowledge base entries are stored in Supabase table `public.relay_knowledge_base`.

| Column | Notes |
|---|---|
| `id` | Entry ID |
| `tenant_id` | Null for global entries, tenant ID for scoped entries |
| `category` | `tracking`, `delivery`, `billing`, `account`, `general`, etc. |
| `problem` | Customer-style issue text |
| `resolution` | Instruction for the AI or support agent |
| `escalate` | If true, route to human review |
| `search_vector` | Full-text search column |

Search is done through:

```sql
relay_search_knowledge_base(p_query, p_tenant_id, p_limit)
```

Rules for entries:

- Write `problem` in customer language.
- Write `resolution` as instructions, not marketing copy.
- Set `escalate = true` for refunds, compensation, legal issues, damage, cancellation, abuse, and high-risk cases.
- Tenant entries should override or supplement global entries.

Seed scripts:

```bash
node apps/backend/src/scripts/seed-knowledge-base.mjs
node apps/backend/src/scripts/seed-docs-page.mjs
```

---

## 9. Widget and Frontend Routing

The widget calls frontend `/api/relay/...` routes, which proxy to the backend `/api/v1/relay/...` routes.

### Next.js Frontend

```text
/api/relay/conversations              -> /api/v1/relay/conversations
/api/relay/conversations/:id          -> /api/v1/relay/conversations/:id
/api/relay/conversations/:id/messages -> /api/v1/relay/conversations/:id/messages
/api/relay/feedback                   -> /api/v1/relay/feedback
```

### Tenant Portal

The tenant portal uses the shared Relay UI and backend routes. Tenant portal conversations must carry tenant context and pass the backend access checks.

### Widget Behaviors

| Behavior | Notes |
|---|---|
| Realtime updates | Supabase realtime listens for conversation and message changes |
| Draft handling | Draft messages are available to agent UIs, not sent to customers until approval |
| Customer messages | Inserted as non-draft and may trigger AI |
| Handoff banner | Shown when `ai_status = human_needed` |
| Session persistence | Conversation ID and access token are stored client-side for public conversations |

---

## 10. Configuration

Relay itself should not own provider-specific AI config. Provider keys are read by `LLMGatewayService`.

Relevant environment variables:

| Variable | Notes |
|---|---|
| `SUPABASE_URL` | Supabase project URL for Relay admin client |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key for backend Relay operations |
| `JWT_ACCESS_SECRET` | Used by shared Relay API auth context when present |
| `DEEPSEEK_API_KEY` | Used only by `LLMGatewayService` |
| `DEEPSEEK_BASE_URL` | Used only by `LLMGatewayService` |

Direct provider calls outside the gateway are forbidden. Verify with:

```bash
rg "deepseek|DeepSeek|openai" apps/backend/src --type ts | rg -v "llm-gateway"
```

Expected output: zero results.

---

## 11. Operational Checks

Before shipping Relay changes, run:

```bash
cd apps/backend
npx tsc --noEmit
npx vitest run src/modules/relay/relay.ai.service.test.ts
```

Global checks:

```bash
rg "deepseek|DeepSeek|openai" apps/backend/src --type ts | rg -v "llm-gateway"
rg "is_draft|draft_mode|approve-and-send" apps/backend/src/modules/relay packages/relay-api/src --type ts
```

Expected:

- zero direct provider calls outside `llm-gateway.service.ts`;
- AI drafts inserted with `is_draft = true`;
- approve-and-send route is the only path that flips drafts to sent;
- deterministic system status notifications are the only non-draft exception.

---

## 12. File Index

```text
apps/backend/src/modules/relay/
  relay.routes.ts              Backend Relay route registration and AI trigger
  relay.ai.service.ts          Relay classification, escalation, and draft insertion
  relay.ai.service.test.ts     Relay AI behavior tests
  relay.ai.prompts.ts          Prompt and KB helpers retained for Relay context
  relay.ai.tools.ts            Tool schemas retained for Relay context

apps/backend/src/shared/services/
  llm-gateway.service.ts       Required gateway for all AI calls

packages/relay-api/src/
  index.ts                     Supabase Relay API handlers
  types.ts                     Shared Relay conversation and message types

packages/relay-ui/src/
  RelayWidget.tsx              Customer-facing chat widget
  RelayMessagingTab.tsx        Tenant/admin inbox UI
  client.ts                    Relay client helpers
  types.ts                     UI-facing Relay types

apps/frontend/src/app/api/relay/
  conversations/route.ts
  conversations/[id]/route.ts
  conversations/[id]/messages/route.ts
  feedback/route.ts

apps/backend/prisma/migrations/
  0017_relay_approval_fields/migration.sql

supabase/migrations/
  20260426150000_relay.sql
  20260426162000_relay_feedback.sql
  20260426172000_relay_security.sql
  20260502000000_relay_ai.sql
  20260502200000_relay_kb_optimise.sql
```
