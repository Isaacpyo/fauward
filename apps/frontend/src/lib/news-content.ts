export type NewsArticleSection = {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
};

export type NewsArticleDetail = {
  lead: string;
  sections: NewsArticleSection[];
};

export const NEWS_ARTICLE_DETAILS: Record<string, NewsArticleDetail> = {
  "ai-agent-launch": {
    lead:
      "Fauward Agent adds an automation layer on top of dispatch, exception handling, and driver communication so operations teams can intervene only when a decision truly needs a human.",
    sections: [
      {
        heading: "What is launching",
        paragraphs: [
          "The first release focuses on high-frequency workflows that usually slow dispatch teams down: driver assignment, shipment triage, and outbound status communication.",
          "Instead of asking operators to watch every board and manually re-route edge cases, the agent monitors shipment events and proposes or executes the next best action against the tenant's configured rules.",
        ],
        bullets: [
          "Automatic shipment assignment based on workload, proximity, and route fit",
          "Exception detection for missed scans, failed deliveries, and SLA risk",
          "Suggested customer and driver communications when a shipment needs intervention",
        ],
      },
      {
        heading: "Why it matters for operators",
        paragraphs: [
          "Most logistics teams do not lose time on the happy path; they lose it when queues spike, drivers go offline, or a shipment falls between systems. The new agent is designed to absorb that operational noise before it becomes a customer issue.",
          "Teams still keep full visibility and auditability. Every automated action is attached to a shipment event trail so supervisors can review what happened, when it happened, and which rule or signal triggered it.",
        ],
      },
      {
        heading: "What comes next",
        paragraphs: [
          "The launch establishes the control layer for broader AI-assisted workflows across forecasting, route balancing, and proactive service recovery.",
          "Enterprise teams can already use the current release to reduce manual dispatch effort while keeping approval gates on sensitive actions.",
        ],
      },
    ],
  },
  "mena-expansion": {
    lead:
      "The latest regional rollout expands Fauward's payments coverage across MENA so operators can manage card collections, settlement visibility, and invoicing from the same tenant environment.",
    sections: [
      {
        heading: "Regional payment coverage",
        paragraphs: [
          "Checkout.com and HyperPay are now available inside the Fauward billing workflow for eligible MENA customers, giving operators more flexibility than a one-gateway stack.",
          "This matters most for businesses handling a mix of account billing, immediate card payments, and region-specific operational requirements around reconciliation and customer trust.",
        ],
        bullets: [
          "Embedded invoice payment flow for supported MENA markets",
          "Shared reporting between finance and operations teams",
          "Fewer handoffs between payment records and delivery records",
        ],
      },
      {
        heading: "Operational impact",
        paragraphs: [
          "Payments are most useful when they are tied to the shipment lifecycle instead of existing in a separate finance tool. That is the design principle behind the expansion.",
          "By keeping payment events and invoice state changes inside Fauward, operators get a cleaner audit trail and faster recovery when a delivery, payment, or customer notification needs attention.",
        ],
      },
      {
        heading: "What MENA teams can expect",
        paragraphs: [
          "The expanded coverage is paired with region-aware onboarding guidance so teams can deploy quickly without rebuilding their finance process from scratch.",
          "The result is a more consistent handoff between dispatch, proof-of-delivery, invoicing, and payment collection for fast-moving regional operations.",
        ],
      },
    ],
  },
  "offline-driver-sync": {
    lead:
      "Offline-first proof-of-delivery was built to handle the reality of low-connectivity routes, where signatures, photos, and status updates need to survive poor signal without duplicating or losing events.",
    sections: [
      {
        heading: "Design constraints",
        paragraphs: [
          "Driver apps in the field cannot depend on continuous connectivity. A single failed upload cannot block collection of a signature, delivery note, or exception reason.",
          "The sync system therefore treats the device as a temporary source of truth and moves data back to the platform only when the network can confirm receipt safely.",
        ],
        bullets: [
          "Local queueing for proof-of-delivery events",
          "Retry-safe uploads with idempotent handoff patterns",
          "State reconciliation when a device reconnects after long gaps",
        ],
      },
      {
        heading: "How sync works in practice",
        paragraphs: [
          "Each field event is captured locally with the shipment context needed to replay it later. Once connectivity returns, the client flushes queued actions in order and confirms which items the backend has accepted.",
          "This approach protects operators from the two worst outcomes in low-connectivity zones: missing proof and duplicate proof.",
        ],
      },
      {
        heading: "Why it matters commercially",
        paragraphs: [
          "Reliable proof-of-delivery is not only an engineering concern. It affects invoice timing, dispute resolution, and customer confidence in the service.",
          "By making offline capture dependable, Fauward reduces the gap between a driver completing work on the road and the business being able to act on that completion centrally.",
        ],
      },
    ],
  },
  "per-seat-pricing-broken": {
    lead:
      "Per-seat pricing punishes logistics businesses at the exact moment they need to add more dispatchers, finance staff, and operators to keep service levels healthy.",
    sections: [
      {
        heading: "Why per-seat pricing breaks down",
        paragraphs: [
          "Logistics growth does not happen neatly one user at a time. Teams often need to add roles quickly during seasonal spikes, depot expansion, or new-customer launches.",
          "When software cost rises every time a company hires the people needed to keep shipments moving, the pricing model creates a tax on operational maturity.",
        ],
        bullets: [
          "Hiring a dispatcher should not trigger a sudden platform cost jump",
          "Cross-functional access matters across operations, finance, and customer service",
          "A growing team should improve service quality, not make tooling less affordable",
        ],
      },
      {
        heading: "What Fauward does differently",
        paragraphs: [
          "Fauward prices around shipment volume and platform capability instead of the number of seats a business needs. That keeps costs aligned to operational throughput rather than org chart complexity.",
          "It also removes the friction that pushes teams to share logins or keep people out of the system, both of which create avoidable operational risk.",
        ],
      },
      {
        heading: "The long-term effect",
        paragraphs: [
          "A flat team model gives operators freedom to add finance users, depot managers, and support staff as the business evolves.",
          "That makes the platform more usable over time, because more of the business can work from the same source of truth instead of falling back to side systems.",
        ],
      },
    ],
  },
  "api-v2-release": {
    lead:
      "API v2 expands Fauward's integration surface with richer event payloads, documented webhook delivery, and a public OpenAPI description that makes implementation materially easier for engineering teams.",
    sections: [
      {
        heading: "What changed in v2",
        paragraphs: [
          "The release adds more explicit event structures, better tenant webhook control, and cleaner idempotency expectations around write operations.",
          "That combination matters for engineering teams integrating Fauward into ERPs, finance stacks, customer apps, or carrier workflows where retries and event consistency are not optional.",
        ],
        bullets: [
          "Structured webhook payloads for shipment and invoice lifecycle events",
          "Improved idempotency for safer retry behaviour",
          "A public OpenAPI contract for faster implementation and review",
        ],
      },
      {
        heading: "Why this reduces integration risk",
        paragraphs: [
          "Operational integrations often fail because teams reverse-engineer behaviour from partial examples. A versioned schema and clearer event model cut that ambiguity down.",
          "The result is less time spent building adapters around guesswork and more time spent shipping the workflows that actually matter to the business.",
        ],
      },
      {
        heading: "What teams can build with it",
        paragraphs: [
          "Engineering teams can now wire shipment creation, invoice handling, notifications, and reporting pipelines into Fauward with less custom glue.",
          "For scaling tenants, that means a cleaner path from initial setup to production-grade automation across operations and finance.",
        ],
      },
    ],
  },
  "cod-workflows-africa": {
    lead:
      "Cash-on-delivery remains operationally significant across many African markets, but the businesses improving margins are the ones digitising collection, reconciliation, and exception handling instead of treating COD as an offline side process.",
    sections: [
      {
        heading: "Why COD still matters",
        paragraphs: [
          "In many markets, COD is still a trust mechanism as much as a payment method. Customers want to inspect or receive goods before committing cash or payment confirmation.",
          "That means operators need systems that treat payment collection as part of last-mile execution, not as a separate back-office workflow.",
        ],
        bullets: [
          "Delivery confirmation and payment collection need to stay linked",
          "Failed collection must trigger clear follow-up paths",
          "Finance teams need same-day visibility into collected versus outstanding amounts",
        ],
      },
      {
        heading: "Where operators lose money",
        paragraphs: [
          "Manual COD processes create three common leaks: delayed reconciliation, weak audit trails, and slow exception recovery when the driver cannot collect on delivery.",
          "Each of those leaks compounds as volume grows, especially when multiple depots or partner fleets are involved.",
        ],
      },
      {
        heading: "How digitised workflows help",
        paragraphs: [
          "Digitised COD workflows give operators a timestamped record of collection status, delivery outcome, and follow-up actions from the same shipment record.",
          "That shortens the gap between what happened on the road and what finance teams can verify centrally, which is where healthier cash flow starts.",
        ],
      },
    ],
  },
};
