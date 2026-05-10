export type RelaySource = "marketing" | "tenant_portal";
export type RelaySender = "customer" | "admin" | "system";
export type RelayStatus = "open" | "assigned" | "closed";
export type RelayAiStatus = "pending" | "ai_handling" | "ai_resolved" | "human_needed";

export type RelayConversation = {
  id: string;
  tenant_id: string | null;
  source_app: RelaySource;
  customer_name: string | null;
  customer_email: string | null;
  subject: string | null;
  status: RelayStatus;
  ai_status?: RelayAiStatus | null;
  ai_turn_count?: number | null;
  assigned_admin_id: string | null;
  access_token_hash?: string | null;
  last_message_at: string | null;
  created_at: string | null;
};

export type RelayMessage = {
  id: string;
  conversation_id: string;
  sender_type: RelaySender;
  sender_id: string | null;
  body: string;
  read_at: string | null;
  created_at: string | null;
};

export type RelayFeedback = {
  id: string;
  conversation_id: string;
  tenant_id: string | null;
  source_app: RelaySource;
  customer_name: string | null;
  customer_email: string | null;
  rating: number;
  comment: string | null;
  submitted_by: string | null;
  created_at: string;
};

export interface RelayWidgetProps {
  tenantId?: string;
  brandColor?: string;
  greeting?: string;
}

export interface RelayMessagingTabProps {
  mode: "tenant" | "super";
  tenantId?: string;
  tenantName?: string;
  tenantEmail?: string;
}
