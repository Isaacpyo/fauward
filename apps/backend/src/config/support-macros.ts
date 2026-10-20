// Saved replies for the Fauward Support Desk (customer.support, WP-2.3). Read-only in the console; editing is out of
// scope (catalogue). `{tenantName}` and `{ticketNumber}` are filled in by the console before sending.

export type SupportMacro = { id: string; title: string; body: string };

export const SUPPORT_MACROS: readonly SupportMacro[] = [
  {
    id: 'acknowledge',
    title: 'Acknowledge and investigating',
    body: 'Thanks for getting in touch about {ticketNumber}. We are looking into it now and will update this ticket as soon as we know more.'
  },
  {
    id: 'need-details',
    title: 'Ask for more detail',
    body: 'To investigate {ticketNumber} we need a little more detail: the tracking number or invoice number involved, the time it happened, and what you expected to see. Reply on this ticket with what you have.'
  },
  {
    id: 'billing-handoff',
    title: 'Billing question handed to billing',
    body: 'We have passed {ticketNumber} to the Fauward billing team. They will reply on this ticket within one working day.'
  },
  {
    id: 'resolved-confirm',
    title: 'Resolved — please confirm',
    body: 'We believe {ticketNumber} is resolved. If anything still looks wrong for {tenantName}, reply here and the ticket will reopen.'
  }
];
