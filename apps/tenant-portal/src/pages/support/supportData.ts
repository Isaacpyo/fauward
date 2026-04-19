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
  isInternal: boolean;
  createdAt: string;
  author: {
    firstName?: string | null;
    lastName?: string | null;
    email: string;
    role: string;
  };
};

export type TicketDetail = {
  id: string;
  ticketNumber: string;
  subject: string;
  status: string;
  priority: string;
  category: string;
  assignedTo?: string | null;
  messages: TicketMessage[];
};

const SUPPORT_DRAFTS_STORAGE_KEY = "fw_support_ticket_drafts";

export const fallbackTickets: Ticket[] = [
  {
    id: "ticket-1",
    ticketNumber: "SUP-10021",
    subject: "Parcel marked delivered but not received",
    category: "DELIVERY_ISSUE",
    priority: "HIGH",
    status: "OPEN",
    createdAt: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    customer: { firstName: "Maya", lastName: "Cole", email: "maya@northline.com" },
    assignee: { firstName: "Liam", lastName: "Hart", email: "liam@fauward.com" }
  },
  {
    id: "ticket-2",
    ticketNumber: "SUP-10020",
    subject: "Need POD photo for invoice dispute",
    category: "TRACKING_ISSUE",
    priority: "NORMAL",
    status: "IN_PROGRESS",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    customer: { firstName: "Ada", lastName: "Nwosu", email: "ada@acmeretail.com" },
    assignee: { firstName: "Ruth", lastName: "Grey", email: "ruth@fauward.com" }
  }
];

const fallbackTicketDetails: Record<string, TicketDetail> = {
  "ticket-1": {
    id: "ticket-1",
    ticketNumber: "SUP-10021",
    subject: "Parcel marked delivered but not received",
    status: "OPEN",
    priority: "HIGH",
    category: "DELIVERY_ISSUE",
    assignedTo: "liam@fauward.com",
    messages: [
      {
        id: "msg-1",
        body: "Customer reports the parcel was marked delivered at 09:41 but reception has not received it.",
        isInternal: false,
        createdAt: new Date(Date.now() - 1000 * 60 * 32).toISOString(),
        author: { firstName: "Maya", lastName: "Cole", email: "maya@northline.com", role: "CUSTOMER_USER" }
      },
      {
        id: "msg-2",
        body: "Ops team requested the courier handoff scan and geolocation check before calling the consignee.",
        isInternal: true,
        createdAt: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
        author: { firstName: "Liam", lastName: "Hart", email: "liam@fauward.com", role: "TENANT_STAFF" }
      }
    ]
  },
  "ticket-2": {
    id: "ticket-2",
    ticketNumber: "SUP-10020",
    subject: "Need POD photo for invoice dispute",
    status: "IN_PROGRESS",
    priority: "NORMAL",
    category: "TRACKING_ISSUE",
    assignedTo: "ruth@fauward.com",
    messages: [
      {
        id: "msg-3",
        body: "Please share the signed POD image for invoice INV-2041. Finance needs it for an active dispute.",
        isInternal: false,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
        author: { firstName: "Ada", lastName: "Nwosu", email: "ada@acmeretail.com", role: "CUSTOMER_ADMIN" }
      },
      {
        id: "msg-4",
        body: "Requested POD asset retrieval from the shipment detail screen and queued a resend.",
        isInternal: true,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
        author: { firstName: "Ruth", lastName: "Grey", email: "ruth@fauward.com", role: "TENANT_STAFF" }
      }
    ]
  }
};

function readDrafts(): TicketDetail[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(SUPPORT_DRAFTS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TicketDetail[]) : [];
  } catch {
    return [];
  }
}

function writeDrafts(drafts: TicketDetail[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(SUPPORT_DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
}

export function listDraftTicketDetails() {
  return readDrafts();
}

export function listDraftTickets(): Ticket[] {
  return readDrafts().map((ticket) => ({
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    subject: ticket.subject,
    category: ticket.category,
    priority: ticket.priority,
    status: ticket.status,
    createdAt: ticket.messages[0]?.createdAt ?? new Date().toISOString(),
    customer: ticket.messages[0]
      ? {
          firstName: ticket.messages[0].author.firstName,
          lastName: ticket.messages[0].author.lastName,
          email: ticket.messages[0].author.email
        }
      : null,
    assignee: ticket.assignedTo ? { email: ticket.assignedTo } : null
  }));
}

export function saveDraftTicket(ticket: TicketDetail) {
  const drafts = readDrafts();
  const remaining = drafts.filter((draft) => draft.id !== ticket.id);
  writeDrafts([ticket, ...remaining]);
}

export function findTicketDetail(id: string) {
  const draft = readDrafts().find((ticket) => ticket.id === id);
  return draft ?? fallbackTicketDetails[id];
}
