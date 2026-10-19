import type { EmailTemplateKey } from './email-templates.js';

// Code-defined email content (D6, WP-2.2). Used by the SMTP transport, and by SendGrid when no dynamic template id is
// configured for a key, so every notification can be delivered without anything set up in a vendor dashboard.

type Data = Record<string, unknown>;
export type RenderedEmail = { subject: string; text: string; html: string };
type Content = { subject: (data: Data) => string; lines: (data: Data) => Array<string | null> };

function str(data: Data, key: string, fallback = ''): string {
  const value = data[key];
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function money(data: Data) {
  const amount = str(data, 'amount');
  const currency = str(data, 'currency');
  return amount ? `${amount}${currency ? ` ${currency}` : ''}` : '';
}

function link(data: Data, label = 'Open') {
  const url = str(data, 'link') || str(data, 'url') || str(data, 'resetUrl');
  return url ? `${label}: ${url}` : null;
}

const workspace = (data: Data) => str(data, 'tenantName', 'your workspace');
const tracking = (data: Data) => str(data, 'trackingNumber', 'your shipment');

function shipmentStatus(label: string): Content {
  return {
    subject: (data) => `Shipment ${tracking(data)}: ${label}`,
    lines: (data) => [`Shipment ${tracking(data)} is now ${label.toLowerCase()}.`, str(data, 'notes') || null, link(data, 'Track it')]
  };
}

const CONTENT: Record<EmailTemplateKey, Content> = {
  booking_confirmed: { subject: (d) => `Booking confirmed: ${tracking(d)}`, lines: (d) => [`Your shipment ${tracking(d)} has been booked.`, link(d, 'Track it')] },
  shipment_processing: shipmentStatus('Processing'),
  shipment_picked_up: shipmentStatus('Picked up'),
  shipment_in_transit: shipmentStatus('In transit'),
  out_for_delivery: shipmentStatus('Out for delivery'),
  delivered: shipmentStatus('Delivered'),
  failed_delivery: { subject: (d) => `Delivery attempt failed: ${tracking(d)}`, lines: (d) => [`We could not deliver ${tracking(d)}.`, str(d, 'reason') ? `Reason: ${str(d, 'reason')}` : null, link(d, 'Track it')] },
  shipment_exception: shipmentStatus('Delayed by an exception'),
  shipment_returned: shipmentStatus('Returned'),
  shipment_cancelled: shipmentStatus('Cancelled'),
  invoice_sent: { subject: (d) => `Invoice ${str(d, 'invoiceNumber')}`, lines: (d) => [`Invoice ${str(d, 'invoiceNumber')} for ${money(d)} has been issued.`, str(d, 'dueDate') ? `Due: ${str(d, 'dueDate')}` : null, link(d, 'View invoice')] },
  invoice_overdue: { subject: (d) => `Invoice ${str(d, 'invoiceNumber')} is overdue`, lines: (d) => [`Invoice ${str(d, 'invoiceNumber')} for ${money(d)} is past its due date.`, link(d, 'Pay now')] },
  payment_received: { subject: (d) => `Payment received${str(d, 'invoiceNumber') ? ` for ${str(d, 'invoiceNumber')}` : ''}`, lines: (d) => [`We received your payment${money(d) ? ` of ${money(d)}` : ''}. Thank you.`] },
  payment_failed: { subject: () => 'Your payment did not go through', lines: (d) => [`Your payment${money(d) ? ` of ${money(d)}` : ''} failed.`, 'Please try again or use another payment method.', link(d, 'Pay')] },
  quote_sent: { subject: (d) => `Quote ${str(d, 'quoteNumber')} from ${workspace(d)}`, lines: (d) => [`${workspace(d)} has sent you quote ${str(d, 'quoteNumber')}${money(d) ? ` for ${money(d)}` : ''}.`, link(d, 'View quote')] },
  return_approved: { subject: (d) => `Return approved: ${tracking(d)}`, lines: (d) => [`Your return for ${tracking(d)} has been approved.`, link(d)] },
  return_received: { subject: (d) => `Return received: ${tracking(d)}`, lines: (d) => [`We received the return for ${tracking(d)}.`] },
  return_refunded: { subject: (d) => `Refund issued: ${tracking(d)}`, lines: (d) => [`Your refund${money(d) ? ` of ${money(d)}` : ''} has been issued.`] },
  return_fee: { subject: (d) => `Return fee for ${tracking(d)}`, lines: (d) => [`A return fee${money(d) ? ` of ${money(d)}` : ''} applies to ${tracking(d)}.`, link(d, 'Pay')] },
  ticket_created: { subject: (d) => `Ticket ${str(d, 'ticketNumber')} received`, lines: (d) => [`We received your request "${str(d, 'subject')}".`, link(d, 'View ticket')] },
  ticket_reply_from_staff: { subject: (d) => `New reply on ticket ${str(d, 'ticketNumber')}`, lines: (d) => [str(d, 'excerpt') || 'You have a new reply.', link(d, 'View ticket')] },
  ticket_reply_from_customer: { subject: (d) => `Customer replied on ticket ${str(d, 'ticketNumber')}`, lines: (d) => [str(d, 'excerpt') || 'A customer replied.', link(d, 'View ticket')] },
  ticket_resolved: { subject: (d) => `Ticket ${str(d, 'ticketNumber')} resolved`, lines: (d) => [`Your ticket "${str(d, 'subject')}" has been resolved.`, link(d, 'View ticket')] },
  password_reset: { subject: () => 'Reset your Fauward password', lines: (d) => ['We received a request to reset your password. The link expires in 60 minutes.', link(d, 'Reset password'), 'If you did not ask for this, ignore this email.'] },
  staff_invite: {
    subject: (d) => (d.isReset === true ? 'Your Fauward access code has been reset' : `You've been added to ${workspace(d)} on Fauward`),
    lines: (d) => [`You have been invited to ${workspace(d)} on Fauward.`, str(d, 'accessCode') ? `Access code: ${str(d, 'accessCode')}` : null, link(d, 'Sign in')]
  },
  trial_expiring: { subject: () => 'Your Fauward trial is ending soon', lines: (d) => [`The trial for ${workspace(d)} ends ${str(d, 'trialEnd', 'soon')}.`, 'Choose a plan in Settings → Billing to keep your data and access.'] },
  trial_expiry: { subject: () => 'Your Fauward trial has ended', lines: (d) => [`The trial for ${workspace(d)} has ended.`, 'Choose a plan in Settings → Billing to continue.'] },
  usage_warning_80: { subject: () => 'You are approaching your Fauward usage limit', lines: (d) => [`${workspace(d)} has used ${str(d, 'used')} of ${str(d, 'limit')} shipments this month.`] },
  usage_limit_reached: { subject: () => 'You have reached your Fauward usage limit', lines: (d) => [`${workspace(d)} has used all ${str(d, 'limit')} shipments in this month's plan.`, 'Upgrade in Settings → Billing to keep creating shipments.'] },
  ops_new_shipment: { subject: (d) => `New shipment ${tracking(d)}`, lines: (d) => [`Shipment ${tracking(d)} was booked.`, link(d)] },
  permission_request_approval: { subject: () => 'A field operator needs your approval', lines: (d) => [str(d, 'summary') || 'A permission request is waiting for you.', link(d, 'Review')] },
  tenant_suspended: { subject: () => 'Your Fauward workspace has been suspended', lines: (d) => [`${workspace(d)} has been suspended.`, str(d, 'publicReason') ? `Reason: ${str(d, 'publicReason')}` : null, 'You can appeal from the notice shown when you sign in.'] },
  tenant_unsuspended: { subject: () => 'Your Fauward workspace is active again', lines: (d) => [`${workspace(d)} is active again.`] },
  tenant_closed: { subject: () => 'Your Fauward workspace has been closed', lines: (d) => [`${workspace(d)} has been closed.`, str(d, 'purgeAfter') ? `Data will be deleted after ${str(d, 'purgeAfter')}.` : null] },
  appeal_decided: { subject: (d) => `Your appeal was ${str(d, 'decision', 'decided').toLowerCase()}`, lines: (d) => [`Fauward reviewed your appeal: ${str(d, 'decision')}.`, str(d, 'resolution') || null] },
  support_reply_from_fauward: { subject: (d) => `Fauward Support replied${str(d, 'ticketNumber') ? ` (${str(d, 'ticketNumber')})` : ''}`, lines: (d) => [str(d, 'excerpt') || 'Fauward Support replied to your request.', link(d, 'View the conversation')] },
  dsar_ready: { subject: () => 'Your data request is ready', lines: (d) => [`The ${str(d, 'requestType', 'data')} request for ${str(d, 'subjectEmail', 'the data subject')} is ready to download.`, link(d, 'Download')] },
  dsar_completed_erasure: { subject: () => 'Erasure request completed', lines: (d) => [`Personal data for ${str(d, 'subjectEmail', 'the data subject')} has been erased.`] },
  region_change_decided: { subject: (d) => `Region change ${str(d, 'decision', 'decided').toLowerCase()}`, lines: (d) => [`Your request to move to ${str(d, 'requestedRegion')} was ${str(d, 'decision').toLowerCase()}.`, str(d, 'reason') || null] },
  plan_changed: { subject: (d) => `Your plan is now ${str(d, 'toPlan')}`, lines: (d) => [`${workspace(d)} moved from ${str(d, 'fromPlan')} to ${str(d, 'toPlan')}.`] },
  plan_change_request_decided: { subject: (d) => `Plan change ${str(d, 'decision', 'decided').toLowerCase()}`, lines: (d) => [`Your request to move to ${str(d, 'toPlan')} was ${str(d, 'decision').toLowerCase()}.`, str(d, 'reason') || null] },
  staff_access_started: { subject: () => 'Fauward staff opened your workspace', lines: (d) => [`${str(d, 'staffName', 'A Fauward staff member')} started a ${str(d, 'scope', 'read-only')} session.`, `Reason: ${str(d, 'reason')}`, 'See Settings → Staff access for the full log.'] },
  api_key_revoked_by_fauward: { subject: () => 'Fauward revoked one of your API keys', lines: (d) => [`API key ${str(d, 'keyPrefix')} was revoked by Fauward.`, `Reason: ${str(d, 'reason')}`] },
  ai_limit_changed: { subject: () => 'Your AI usage limit changed', lines: (d) => [str(d, 'summary') || 'Fauward changed the AI usage limit for your workspace.'] },
  ai_limit_reached: { subject: () => 'Your workspace reached its AI usage limit', lines: (d) => [`Your workspace reached its ${str(d, 'what', 'AI usage limit')}.`, 'AI features stop until next month or until the limit is raised. Reply to Fauward support to change it.'] },
  exception_escalation_update: { subject: (d) => (str(d, 'status') === 'resolved' ? 'Fauward resolved your escalated exception' : 'Fauward replied on your escalated exception'), lines: (d) => [str(d, 'subject'), str(d, 'reply') || null, 'See Exceptions in your Fauward workspace.'] },
  gateway_verification_failed: { subject: (d) => `${str(d, 'provider', 'Payment gateway')} connection test failed`, lines: (d) => [str(d, 'error') || 'The provider rejected the saved key.', 'Check the keys under Settings → Integrations and test the connection again.'] },
  feedback_status_changed: { subject: (d) => `Update on "${str(d, 'title', 'your feedback')}"`, lines: (d) => [`Status: ${str(d, 'status')}.`, str(d, 'comment') || null] },
  trial_extension_decided: { subject: (d) => `Trial extension ${str(d, 'decision', 'decided').toLowerCase()}`, lines: (d) => [str(d, 'summary') || null] },
  incident_update: { subject: (d) => `Incident update: ${str(d, 'title')}`, lines: (d) => [str(d, 'body') || null, link(d, 'Status')] },
  onboarding_nudge: { subject: () => 'Finish setting up your Fauward workspace', lines: (d) => [`Next step: ${str(d, 'step', 'complete your setup')}.`, link(d, 'Continue setup')] },
  user_locked_by_fauward: { subject: () => 'Fauward locked a user in your workspace', lines: (d) => [`${str(d, 'userEmail', 'A user')} was locked by Fauward.`, `Reason: ${str(d, 'reason')}`] },
  billing_payment_failed: { subject: () => 'Your Fauward payment failed', lines: (d) => [`Fauward could not collect payment for ${workspace(d)}.`, 'Update your payment details in Settings → Billing to avoid interruption.'] },
  billing_final_warning: { subject: () => 'Final notice: update your Fauward payment details', lines: (d) => [`Payment for ${workspace(d)} has failed again. The workspace stays suspended until it is paid.`] },
  billing_account_cancelled: { subject: () => 'Your Fauward subscription was cancelled', lines: (d) => [`${workspace(d)} was cancelled after repeated failed payments.`] },
  staff_notification: { subject: (d) => `[Fauward console] ${str(d, 'title', 'Notification')}`, lines: (d) => [str(d, 'body') || null, link(d, 'Open in the console')] }
};

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Subject and plain/HTML body for a template key; unknown keys get a generic message, never a throw. */
export function renderEmail(templateKey: string, data: Data): RenderedEmail {
  const content = (CONTENT as Record<string, Content | undefined>)[templateKey];
  const subject = content ? content.subject(data) : str(data, 'title', 'Notification from Fauward');
  const lines = (content ? content.lines(data) : [str(data, 'body') || null, link(data)]).filter((line): line is string => Boolean(line));
  const text = lines.join('\n\n');
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#111827">${lines
    .map((line) => `<p>${escapeHtml(line).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')}</p>`)
    .join('')}</div>`;
  return { subject, text, html };
}

/** Subjects that override a SendGrid dynamic template's own subject (kept from the pre-WP-2.2 worker). */
export function subjectOverride(templateKey: string, data: Data): string | undefined {
  const overridden = ['staff_invite', 'password_reset', 'trial_expiring', 'trial_expiry', 'usage_warning_80', 'usage_limit_reached'];
  return overridden.includes(templateKey) ? renderEmail(templateKey, data).subject : undefined;
}
