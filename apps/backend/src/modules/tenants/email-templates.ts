export const EMAIL_TEMPLATE_KEYS = [
  'booking_confirmed',
  'shipment_picked_up',
  'out_for_delivery',
  'delivered',
  'failed_delivery',
  'shipment_exception',
  'invoice_sent',
  'invoice_overdue',
  'payment_received',
  'return_approved',
  'return_received',
  'return_refunded',
  'ticket_created',
  'ticket_reply_from_staff',
  'ticket_reply_from_customer',
  'ticket_resolved',
  'staff_invite',
  'password_reset',
  'trial_expiring',
  'usage_warning_80',
  'usage_limit_reached',
  'ops_new_shipment'
] as const;

export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number];

