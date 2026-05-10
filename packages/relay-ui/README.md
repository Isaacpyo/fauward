# @fauward/relay-ui

UI components for the Fauward Relay customer support system.

**Full documentation →** [`docs/relay.md`](../../docs/relay.md)

---

## Components

### `RelayWidget`

Floating chat bubble for customer-facing surfaces (marketing site, embeds).

```tsx
import { RelayWidget } from '@fauward/relay-ui';

<RelayWidget
  tenantId="07fa9a89-37a7-4177-99ba-8f52bb42d883"
  brandColor="#0f766e"
  greeting="Hi, how can we help?"
/>
```

**Features:**
- Animated typing indicator when AI is processing (`ai_status === 'ai_handling'`)
- Tracking number input card for `{"type":"tracking_input"}` messages
- "Chat with an associate" button after 2+ customer messages
- Amber handoff banner when `ai_status === 'human_needed'`
- Supabase real-time subscription for instant message delivery
- Polling: 10s normally, 2s while AI is typing
- Session persistence via `sessionStorage`
- Unread message badge

### `RelayMessagingTab`

Full inbox UI for tenant portal and superadmin.

```tsx
import { RelayMessagingTab } from '@fauward/relay-ui';

<RelayMessagingTab
  mode="tenant"           // "tenant" | "super"
  tenantId="..."
  accessToken="..."
/>
```

---

## Message types

The widget parses `message.body` for special JSON payloads:

```json
// Triggers a tracking number input field
{
  "type": "tracking_input",
  "message": "Please enter your tracking number:",
  "placeholder": "e.g. QS2605-47-B3K9-83721"
}
```

Any other body is rendered as plain text.

---

## Frontend routing

The widget calls `/api/relay/...`. This must proxy to the backend:

- **Next.js** (`apps/frontend`): API route handlers in `src/app/api/relay/` proxy to `BACKEND_URL/api/v1/relay`
- **Vite** (`apps/tenant-portal`): `vite.config.ts` proxies `/api/relay` → port 5000 → backend

> Never call Supabase relay handlers directly — the AI only fires from the backend routes.
