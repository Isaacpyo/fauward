export const API_KEY_SCOPES = [
  "shipments:read",
  "shipments:write",
  "tracking:read",
  "invoices:read",
  "invoices:write",
  "webhooks:manage"
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export type ApiKeyStatus = "ACTIVE" | "REVOKED";

export type ApiKeyRecord = {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: ApiKeyScope[];
  createdAt: string;
  lastUsedAt?: string | null;
  status: ApiKeyStatus;
};

export type GeneratedApiKey = {
  id: string;
  name: string;
  keyPrefix: string;
  fullKey: string;
  scopes: ApiKeyScope[];
  createdAt: string;
  lastUsedAt?: string | null;
  status: ApiKeyStatus;
};

export const WEBHOOK_EVENTS = [
  "shipment.created",
  "shipment.updated",
  "shipment.status_changed",
  "shipment.delivered",
  "invoice.created",
  "invoice.paid",
  "invoice.overdue"
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number];

export type WebhookEndpoint = {
  id: string;
  url: string;
  events: WebhookEventType[];
  active: boolean;
  secret: string;
  createdAt: string;
};

export type WebhookDeliveryLogItem = {
  id: string;
  endpointId: string;
  timestamp: string;
  eventType: WebhookEventType;
  statusCode: number;
  latencyMs: number;
  attempts: number;
  requestHeaders: Record<string, string>;
  requestBody: unknown;
  responseHeaders: Record<string, string>;
  responseBody?: unknown;
};

export type WebhookSendTestResult = {
  endpointId: string;
  ok: boolean;
  statusCode: number;
  latencyMs: number;
  responsePreview?: string;
};

