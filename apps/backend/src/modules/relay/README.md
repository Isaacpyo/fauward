# Relay Module

AI-assisted customer support and tenant messaging for Fauward.

**Full documentation:** [`docs/relay.md`](../../../../../docs/relay.md)

---

## Files

| File | Purpose |
|---|---|
| `relay.routes.ts` | HTTP endpoints, message creation, draft approval, and delivery orchestration |
| `relay.ai.service.ts` | Classification, escalation analysis, and draft creation through `LLMGatewayService` |
| `relay.ai.prompts.ts` | Prompt and knowledge-base helpers |
| `relay.ai.tools.ts` | Tool schemas used by the AI orchestration layer |

## Current Rules

- Relay does not call AI providers directly. All AI requests go through `apps/backend/src/shared/services/llm-gateway.service.ts`.
- AI-generated replies are always saved as drafts.
- Drafts are surfaced to the agent queue for human review.
- Customer delivery only happens through `POST /api/v1/tenant/relay/messages/:id/approve-and-send`.
- The approve-and-send route validates tenant ownership, sets `isDraft=false`, records `approvedBy` and `approvedAt`, then calls the existing delivery mechanism.
- Deterministic system status notifications generated from tracking events may send automatically because they are not AI-generated.

## AI Tasks

| Task | Gateway key |
|---|---|
| Message classification | `relay_classify` |
| Draft reply | `relay_reply_draft` |
| Escalation analysis | `relay_escalation_analysis` |

## KB Scripts

```bash
node apps/backend/src/scripts/seed-knowledge-base.mjs
node apps/backend/src/scripts/seed-docs-page.mjs
```
