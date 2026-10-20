export type Ticket = {
  id: string;
  ticketNumber: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
  customer?: {
    firstName?: string | null;
    lastName?: string | null;
    email: string;
  } | null;
  assignee?: {
    firstName?: string | null;
    lastName?: string | null;
    email: string;
  } | null;
};

export type TicketMessage = {
  id: string;
  body: string;
  /** D5: PUBLIC (seen by the customer) or TENANT_INTERNAL (staff only). */
  visibility: "PUBLIC" | "TENANT_INTERNAL";
  authorType: "TENANT_USER" | "END_CUSTOMER" | "STAFF" | "SYSTEM";
  /** Display name from the API; Fauward staff appear as "Fauward Support". */
  authorLabel: string;
  createdAt: string;
};

export type TicketDetail = {
  id: string;
  ticketNumber: string;
  subject: string;
  status: string;
  priority: string;
  category: string;
  assignedTo?: string | null;
  /** The PLATFORM ticket this was escalated to (tenant staff only). */
  linkedTicket?: { id: string; ticketNumber: string; status: string } | null;
  messages: TicketMessage[];
};
