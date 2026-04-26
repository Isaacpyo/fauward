export type RelaySource = "marketing" | "tenant_portal";
export type RelaySender = "customer" | "admin" | "system";
export type RelayStatus = "open" | "assigned" | "closed";

export type RelayConversation = {
  id: string;
  tenant_id: string | null;
  source_app: RelaySource;
  customer_name: string | null;
  customer_email: string | null;
  subject: string | null;
  status: RelayStatus;
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

export type CreateRelayConversationInput = {
  source_app: RelaySource;
  tenant_id?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  subject?: string | null;
  first_message: string;
  access_token_hash?: string | null;
};

export type CreateRelayMessageInput = {
  sender_type: RelaySender;
  sender_id?: string | null;
  body: string;
};

export type ListRelayConversationsInput = {
  status?: RelayStatus;
  source_app?: RelaySource;
  search?: string;
  tenant_id?: string;
};

export type UpdateRelayConversationInput = {
  status?: RelayStatus;
  assigned_admin_id?: string | null;
};

export type CreateRelayFeedbackInput = {
  conversation_id: string;
  rating: number;
  comment?: string | null;
  submitted_by?: string | null;
  tenant_id?: string | null;
};
