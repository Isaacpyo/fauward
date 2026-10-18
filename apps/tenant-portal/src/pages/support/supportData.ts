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
