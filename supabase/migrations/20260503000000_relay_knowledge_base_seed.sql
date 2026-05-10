-- Relay knowledge base seed — generated from Fauward codebase + logistics support research
-- Run: supabase/migrations/20260503000000_relay_knowledge_base_seed.sql

INSERT INTO public.relay_knowledge_base
  (tenant_id, category, problem, resolution, escalate)
SELECT
  tenant_id,
  CASE
    WHEN category = 'returns'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.relay_knowledge_base'::regclass
          AND pg_get_constraintdef(oid) ILIKE '%returns%'
      )
    THEN 'delivery'
    ELSE category
  END,
  problem,
  resolution,
  escalate
FROM (
VALUES
  (NULL, 'tracking', 'How do I track my shipment?',
   $kb$Use lookup_shipment with the tracking number they provide. Fauward tracking numbers use the format SLUG-YYYYMM-6CHARS, for example FWD-202506-A3F9K2. Summarise the current status in plain English, the last known location if available, and the estimated delivery date. If no shipment is found, ask them to double-check the reference and offer to connect them with a human agent.$kb$,
   false),

  (NULL, 'tracking', 'What does PENDING mean?',
   $kb$Use lookup_shipment to get the current status, then explain: your shipment is created but has not moved into active handling yet. If the customer needs to change booking details, this is usually the safest stage to ask for help before pickup begins.$kb$,
   false),

  (NULL, 'tracking', 'What does PROCESSING mean?',
   $kb$Use lookup_shipment to get the current status, then explain: your shipment is being prepared for collection, warehouse handling, or dispatch. The next normal update is PICKED_UP, unless the shipment is cancelled before it leaves.$kb$,
   false),

  (NULL, 'tracking', 'What does PICKED_UP mean?',
   $kb$Use lookup_shipment to get the current status, then explain: your parcel has been collected or accepted into the courier workflow. It has left the initial booking stage and should next move into transit unless an exception is reported.$kb$,
   false),

  (NULL, 'tracking', 'What does IN_TRANSIT mean?',
   $kb$Use lookup_shipment to get the current status, then explain: your shipment is moving between facilities, hubs, or route points. Tracking may be quiet during this stage until the next scan or driver update is received.$kb$,
   false),

  (NULL, 'tracking', 'What does OUT_FOR_DELIVERY mean?',
   $kb$Use lookup_shipment to get the current status, then explain: your shipment is with the delivery route for today or the current delivery run. Share the estimated delivery window if available, and avoid promising an exact time unless the shipment record provides one.$kb$,
   false),

  (NULL, 'tracking', 'What does DELIVERED mean?',
   $kb$Use lookup_shipment to get the current status, then explain: your shipment has been marked as completed at the destination. Share the delivery timestamp and proof of delivery details if available. If the customer says they did not receive it, review the proof and connect them with a human agent for a delivery dispute.$kb$,
   true),

  (NULL, 'tracking', 'What does FAILED_DELIVERY mean?',
   $kb$Use lookup_shipment to get the current status, then explain: the courier attempted delivery or could not complete delivery on this run. The shipment can usually move back to OUT_FOR_DELIVERY for a re-attempt, or it may be returned or investigated depending on the reason shown.$kb$,
   false),

  (NULL, 'tracking', 'What does RETURNED mean?',
   $kb$Use lookup_shipment to get the current status, then explain: the shipment has been returned and the delivery journey is closed. If the customer wants a refund, replacement, or compensation, connect them with a human agent because those decisions need account review.$kb$,
   true),

  (NULL, 'tracking', 'What does CANCELLED mean?',
   $kb$Use lookup_shipment to get the current status, then explain: the shipment was cancelled before completion and will not continue through the delivery flow. If they believe it was cancelled by mistake, connect them with a human agent to review the booking.$kb$,
   false),

  (NULL, 'tracking', 'What does EXCEPTION mean?',
   $kb$Use lookup_shipment to get the current status, then explain: something needs attention before the shipment can continue, such as a route issue, address issue, scan mismatch, or operational delay. The shipment may move back into processing, out for delivery, or failed delivery after review.$kb$,
   false),

  (NULL, 'tracking', 'My status has not updated in a while.',
   $kb$Use lookup_shipment to get the current status, then check the last event time. Explain that tracking can pause between scans, during linehaul, or while a driver is offline and syncing updates. If the shipment is beyond its expected delivery date or the last update looks stale, connect them with a human agent for investigation.$kb$,
   false),

  (NULL, 'tracking', 'My tracking number is not found.',
   $kb$Ask the customer to re-enter the full tracking number in the format SLUG-YYYYMM-6CHARS, with no extra spaces. Use lookup_shipment again. If it is still not found, explain that the reference may not be active yet, may belong to another courier portal, or may have been typed incorrectly, then offer to connect them with a human agent.$kb$,
   false),

  (NULL, 'tracking', 'Tracking says delivered but I did not receive it.',
   $kb$Use lookup_shipment to get the current status, then check the delivery timestamp and proof of delivery details. Ask the customer to check nearby safe places, reception, mailroom, neighbours, and the delivery address shown on their order. Because this is a disputed delivery, connect them with a human agent to review the proof and open an investigation.$kb$,
   true),

  (NULL, 'tracking', 'How do I subscribe to real-time tracking updates?',
   $kb$Tell the customer they can keep the public tracking page open to receive live status changes when updates are available. If they are using the tenant portal, they can also view shipment activity from the portal tracking view. For developer or webhook subscriptions, connect them with a human agent or integration contact.$kb$,
   false),

  (NULL, 'tracking', 'What is the difference between the public tracking page and the tenant portal?',
   $kb$Explain that the public tracking page is for recipients and customers who only need shipment progress using a tracking number. The tenant portal is for authorised staff to manage shipments, invoices, customers, drivers, and operational actions across their own business.$kb$,
   false),

  (NULL, 'delivery', 'What happens when a delivery fails?',
   $kb$Use lookup_shipment to get the current status, then explain that FAILED_DELIVERY means the courier could not complete the delivery on that attempt. Depending on the reason, the shipment may be sent out again, held for instructions, moved to exception review, or returned after the available attempts are exhausted.$kb$,
   false),

  (NULL, 'delivery', 'How do delivery re-attempts work?',
   $kb$Use lookup_shipment to get the current status, then explain that a failed delivery can move back to OUT_FOR_DELIVERY for a re-attempt when the route team confirms it is eligible. Ask the customer to keep access clear, confirm contact details, and watch for updates. If the next attempt needs a date or address decision, connect them with a human agent.$kb$,
   false),

  (NULL, 'delivery', 'When will my parcel arrive?',
   $kb$Use lookup_shipment to get the current status and estimated delivery date. Share the date or window shown there, and explain that delivery windows can change with route load, weather, traffic, access issues, or failed attempts. If there is no estimate, offer to connect them with a human agent.$kb$,
   false),

  (NULL, 'delivery', 'My driver is running late.',
   $kb$Use lookup_shipment to get the current status. If it is OUT_FOR_DELIVERY, explain that route timing can shift because of traffic, earlier stops, access delays, or heavy items. Share the latest estimate if available. If the delivery is urgent or the window has passed, connect them with a human agent.$kb$,
   false),

  (NULL, 'delivery', 'Delivery was attempted but no one was home.',
   $kb$Use lookup_shipment to get the current status. Explain that the courier records the failed attempt and the shipment may be scheduled for another OUT_FOR_DELIVERY run, held for instructions, or returned depending on the service rules. Ask the customer to confirm availability and contact details; connect them with a human agent if rescheduling is needed.$kb$,
   false),

  (NULL, 'delivery', 'Can I change the delivery address?',
   $kb$Use lookup_shipment to check the shipment status. Explain that address changes after pickup require human review for security, pricing, route, and fraud-prevention reasons. Do not confirm the change yourself; connect them with a human agent.$kb$,
   true),

  (NULL, 'delivery', 'Can you leave my parcel in a safe place or with a neighbour?',
   $kb$Use lookup_shipment to get the current status. Explain that safe-place or neighbour instructions can only be applied when the tenant and service allow it, and some shipments require signature, photo, or one-time passcode confirmation. If the shipment is already out for delivery, connect them with a human agent to see whether instructions can still be added.$kb$,
   false),

  (NULL, 'delivery', 'The driver contacted me asking for money.',
   $kb$Treat this as suspicious. Use lookup_shipment only to confirm shipment context, but do not tell the customer to pay the driver. Tell them I will connect them with a human agent immediately so the team can verify the contact and protect the shipment.$kb$,
   true),

  (NULL, 'delivery', 'My parcel was left in the wrong location.',
   $kb$Use lookup_shipment to get the current status and proof details. Ask the customer to check the delivery photo, safe place, reception, mailroom, and neighbours if shown. Because the customer is disputing the delivery location, connect them with a human agent for investigation.$kb$,
   true),

  (NULL, 'delivery', 'Delivery is marked delivered but the item arrived damaged.',
   $kb$Use lookup_shipment to confirm the delivery record, then connect the customer with a human agent. Ask them to keep the packaging, take clear photos of the item and outer packaging, and avoid disposing of anything until the claim is reviewed. Do not promise compensation or refund eligibility.$kb$,
   true),

  (NULL, 'delivery', 'What proof of delivery do you collect?',
   $kb$Use lookup_shipment to get the current status, then explain that proof of delivery can include the recipient name, signature, delivery photo, scan verification, location metadata, and one-time passcode confirmation where that service requires it. If the customer disputes the proof or needs a copy, connect them with a human agent.$kb$,
   false),

  (NULL, 'delivery', 'How does one-time passcode delivery confirmation work?',
   $kb$Use lookup_shipment to confirm whether the shipment requires passcode confirmation. Explain that the driver may ask the recipient for the delivery code to confirm the parcel is being handed to the right person. The customer should never share payment details or banking information; if anything feels suspicious, connect them with a human agent.$kb$,
   false),

  (NULL, 'delivery', 'Do you handle large or heavy item delivery?',
   $kb$Explain that large or heavy shipments may need extra handling, appropriate vehicle assignment, access checks, and more flexible delivery windows. Use lookup_shipment if they have a tracking number. If they need to change access instructions, book special handling, or report damage, connect them with a human agent.$kb$,
   false),

  (NULL, 'delivery', 'The courier says delivery failed but no one came.',
   $kb$Use lookup_shipment to get the latest delivery event and any reason recorded. Explain that failed attempts can be caused by access issues, route cut-off, incorrect contact details, or scan errors. Because the customer disputes the attempt, connect them with a human agent to review driver notes and route evidence.$kb$,
   true),

  (NULL, 'returns', 'How do I request a return?',
   $kb$Use lookup_shipment if the customer provides a shipment or tracking number. Explain that return requests can be opened for reasons including wrong item, damaged item, not as described, no longer needed, refused delivery, or another reason. Ask for the shipment reference and return reason, then connect them with a human agent if approval, refund, or compensation is required.$kb$,
   true),

  (NULL, 'returns', 'What do return statuses mean?',
   $kb$Explain the return lifecycle in plain English: REQUESTED means the return has been submitted, APPROVED means it can proceed, LABEL_ISSUED means the return label is ready, PICKED_UP means the return was collected, IN_HUB means it is being processed by operations, RECEIVED means the returned item arrived, REFUNDED means the refund was recorded, RESOLVED means the case is closed, and REJECTED means the return was declined.$kb$,
   false),

  (NULL, 'returns', 'How long does a return take?',
   $kb$Use lookup_shipment if a shipment reference is available. Explain that timing depends on approval, label issue, pickup, hub processing, inspection, and any refund review. Give the current return stage if available. If the customer is asking about a refund date or compensation, connect them with a human agent.$kb$,
   true),

  (NULL, 'returns', 'I need to return damaged goods.',
   $kb$Use lookup_shipment to confirm the shipment, then connect the customer with a human agent because damaged goods can involve evidence review, compensation, replacement, or refund decisions. Ask them to keep the packaging and provide photos of the item, packaging, label, and delivery condition.$kb$,
   true),

  (NULL, 'returns', 'I received the wrong item.',
   $kb$Use lookup_shipment to confirm the shipment, then explain that a wrong-item return can be requested under the WRONG_ITEM reason. Ask the customer to keep the item and packaging available. If replacement, refund, or priority collection is needed, connect them with a human agent.$kb$,
   true),

  (NULL, 'returns', 'How do I print a return label?',
   $kb$Explain that once a return reaches LABEL_ISSUED, the customer can download or print the label from the return instructions provided by the merchant or tenant portal. If the label is missing, expired, unreadable, or the customer cannot print it, connect them with a human agent for label help.$kb$,
   false),

  (NULL, 'returns', 'Why was my return rejected?',
   $kb$Explain that REJECTED means the return request was reviewed and declined under the tenant return rules. Because rejection reasons are account-specific and may affect refund eligibility, connect the customer with a human agent to review the case.$kb$,
   true),

  (NULL, 'returns', 'When will I get my refund after a return?',
   $kb$Explain that refunds are reviewed after the returned item is received and checked. If the return status is RECEIVED, REFUNDED, or RESOLVED, summarise that stage if available. Because refund timing and eligibility require account review, connect the customer with a human agent.$kb$,
   true),

  (NULL, 'returns', 'I refused the delivery and want to know what happens next.',
   $kb$Use lookup_shipment to get the current status. Explain that refused delivery can create a return request or move the shipment toward RETURNED, depending on the tenant workflow. If the customer wants a refund, replacement, or fee review, connect them with a human agent.$kb$,
   true),

  (NULL, 'billing', 'How is shipping pricing calculated?',
   $kb$Explain that shipping price depends mainly on the service tier, parcel weight and dimensions, the origin and destination zones, and any service-specific charges such as remote area, oversized, overweight, fuel, insurance, or seasonal handling. Do not describe internal formulas or multipliers. If the customer disputes a charge, connect them with a human agent.$kb$,
   false),

  (NULL, 'billing', 'What is STANDARD shipping?',
   $kb$Explain that STANDARD is the regular service tier for non-urgent shipments. It is usually chosen when cost matters more than the fastest delivery speed. Use the quote or shipment details for the exact estimated delivery date.$kb$,
   false),

  (NULL, 'billing', 'What is EXPRESS shipping?',
   $kb$Explain that EXPRESS is a faster service tier than STANDARD where the route and tenant service rules support it. It is suitable when the customer needs a quicker delivery window but does not necessarily require overnight delivery.$kb$,
   false),

  (NULL, 'billing', 'What is OVERNIGHT shipping?',
   $kb$Explain that OVERNIGHT is the fastest listed service tier and is intended for shipments that need next-day or overnight movement where available. Availability depends on route, cutoff time, destination zone, and tenant service coverage.$kb$,
   false),

  (NULL, 'billing', 'What do invoice statuses mean?',
   $kb$Explain that DRAFT means the invoice is being prepared, SENT means it has been issued to the customer, PAID means payment has been recorded, and OVERDUE means the due date has passed without full payment. If the customer sees a status they disagree with, connect them with a human agent.$kb$,
   false),

  (NULL, 'billing', 'What payment methods are supported?',
   $kb$Explain that available payment methods depend on the tenant and region. Fauward can support card payments through Stripe, regional payments through Paystack, bank transfer, cash, and M-Pesa where enabled. For the exact payment options on an invoice or shipment, direct the customer to the payment instructions or connect them with a human agent.$kb$,
   false),

  (NULL, 'billing', 'There is an incorrect charge on my invoice.',
   $kb$Explain that invoice disputes need billing review. Ask the customer for the invoice number, shipment reference, and the charge they believe is incorrect. Do not promise a refund or adjustment; connect them with a human agent.$kb$,
   true),

  (NULL, 'billing', 'How do I get a shipping quote?',
   $kb$Explain that a quote is based on origin, destination, parcel size and weight, service tier, declared value, and any special handling needs. If the customer is in the tenant portal, they can create a quote from the quotes or shipment booking area. If they need a custom or bulk quote, connect them with a human agent.$kb$,
   false),

  (NULL, 'billing', 'How do promo codes work?',
   $kb$Explain that promo codes are applied during shipment creation when they are active and eligible for that customer or order. A code may have an expiry date, usage limit, minimum order value, maximum discount, or customer eligibility rule. If the customer believes a valid code failed, connect them with a human agent.$kb$,
   false),

  (NULL, 'billing', 'My promo code is expired or not working.',
   $kb$Explain that a promo code may fail if it is expired, already fully used, below the minimum order value, not available for that customer, or not valid for the selected service. If the customer has a code they believe should work, ask for the code and connect them with a human agent to review it.$kb$,
   false),

  (NULL, 'billing', 'What is a credit note?',
   $kb$Explain that a credit note records an approved credit against an invoice or account balance. Because credits affect billing records and may relate to disputes, refunds, or adjustments, connect the customer with a human agent for credit note requests or questions about a specific credit.$kb$,
   true),

  (NULL, 'account', 'How do I sign up or register for Fauward?',
   $kb$Explain that Fauward is for logistics businesses that need a branded platform for booking, tracking, delivery operations, billing, and customer support. Registration creates a tenant account and the first admin user. If they want help choosing a plan or setting up their business account, connect them with a human agent.$kb$,
   false),

  (NULL, 'account', 'How do I invite staff?',
   $kb$Explain that a tenant admin can invite staff from the user management area and choose an appropriate role: TENANT_ADMIN for account administration, TENANT_MANAGER for operational management, TENANT_STAFF for day-to-day work, or TENANT_DRIVER for field delivery work. If the invite cannot be sent, connect them with a human agent.$kb$,
   false),

  (NULL, 'account', 'What are Fauward plan limits?',
   $kb$Explain the plan limits factually: Starter is 3 staff and 300 shipments per month at £29 per month, Pro is 15 staff and 2,000 shipments per month at £79 per month, and Enterprise is unlimited with pricing from £500 per month. Do not describe internal enforcement logic.$kb$,
   false),

  (NULL, 'account', 'How do I upgrade my plan?',
   $kb$Explain that plan upgrades can be handled from billing or account settings when available. If they need Enterprise, custom limits, dedicated setup, or help changing billing, connect them with a human agent.$kb$,
   true),

  (NULL, 'account', 'I forgot my password.',
   $kb$Tell the customer to use the forgot-password option on the login page and follow the reset email. If the email does not arrive, the link has expired, or they no longer have access to the email address, connect them with a human agent.$kb$,
   false),

  (NULL, 'account', 'How do I set up MFA or two-factor authentication?',
   $kb$Explain that signed-in users can set up MFA from their security settings by scanning the authenticator setup code, entering the current verification code, and saving backup codes if provided. If they are locked out or changed phones, connect them with a human agent for account verification.$kb$,
   false),

  (NULL, 'account', 'How do I add a driver?',
   $kb$Explain that an authorised admin or manager can create or invite a user with the TENANT_DRIVER role and complete the driver profile so the person can receive assigned delivery work in the field app. If driver setup or access fails, connect them with a human agent.$kb$,
   false),

  (NULL, 'account', 'Can I use a custom domain or white-label branding?',
   $kb$Explain that Fauward supports white-label branding, including tenant brand name, logo, colours, and verified custom domains where the plan and setup allow it. If they want a custom domain connected or branding reviewed, connect them with a human agent.$kb$,
   true),

  (NULL, 'account', 'My account is suspended or terminated.',
   $kb$Explain that account suspension or termination requires human review for security, billing, or policy reasons. Do not attempt to resolve it yourself; connect them with a human agent immediately.$kb$,
   true),

  (NULL, 'account', 'I want my data deleted or need a GDPR erasure request.',
   $kb$Explain that data deletion and privacy rights requests require verified human handling because they can affect account records, legal retention, and personal data. Connect them with a human agent immediately.$kb$,
   true),

  (NULL, 'general', 'What is Fauward?',
   $kb$Explain that Fauward is a B2B logistics platform for couriers, freight forwarders, and third-party logistics providers. It helps logistics businesses manage bookings, shipments, tracking, driver operations, invoicing, payments, support, and branded customer experiences from one platform.$kb$,
   false),

  (NULL, 'general', 'Which regions does Fauward support?',
   $kb$Explain that Fauward is built for logistics teams operating in the UK, West Africa including Nigeria and Ghana, East Africa including Kenya and Uganda, the Middle East including UAE and Saudi Arabia, Southern Africa, North America, and Asia Pacific. Actual service coverage depends on the tenant, route, and carrier setup.$kb$,
   false),

  (NULL, 'general', 'Which currencies are supported?',
   $kb$Explain that GBP is the default currency, and Fauward supports multi-currency setup by region and tenant configuration. The currency shown on a quote, shipment, invoice, or payment should be treated as the source of truth for that transaction.$kb$,
   false),

  (NULL, 'general', 'How do I contact human support?',
   $kb$Tell the customer I can connect them with a human agent. If the issue involves a shipment, ask for the tracking number first so the agent has the right context; otherwise collect a short description of the issue and start the handoff.$kb$,
   false),

  (NULL, 'general', 'What is the SLA or delivery guarantee?',
   $kb$Explain that delivery commitments depend on the tenant, route, service tier, cutoff time, and shipment terms. Do not promise compensation or a guaranteed delivery time unless it is shown in the shipment or contract details. If they are asking about a missed SLA or claim, connect them with a human agent.$kb$,
   true),

  (NULL, 'general', 'Can Fauward integrate with our API or webhooks?',
   $kb$Explain that Fauward supports API and webhook integrations for authorised tenants, including shipment, tracking, payment, and operational events. Do not share secrets, keys, signing details, or account-specific configuration in chat. For setup, testing, or developer access, connect them with a human agent.$kb$,
   false),

  (NULL, 'general', 'Is my shipment or account data visible to other companies?',
   $kb$Explain that each logistics business has its own tenant workspace, and customers and staff should only see information they are authorised to access. If they believe they can see another companys data, connect them with a human agent immediately for security review.$kb$,
   true)
) AS kb_rows(tenant_id, category, problem, resolution, escalate);
