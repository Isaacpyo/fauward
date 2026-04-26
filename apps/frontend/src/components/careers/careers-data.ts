export type CareerRole = {
  title: string;
  department: "Engineering" | "Research" | "Design";
  location: string;
  slug: string;
};

export const sampleRoles: CareerRole[] = [
  {
    title: "Senior Backend Engineer - Shipment Tracking",
    department: "Engineering",
    location: "Remote, UK/EU",
    slug: "senior-backend-engineer-shipment-tracking",
  },
  {
    title: "Frontend Engineer - Customer Tracking Portal",
    department: "Engineering",
    location: "Remote, EMEA",
    slug: "frontend-engineer-customer-tracking-portal",
  },
  {
    title: "Platform Engineer - Integrations and Webhooks",
    department: "Engineering",
    location: "London or Remote",
    slug: "platform-engineer-integrations-webhooks",
  },
  {
    title: "Logistics Data Researcher",
    department: "Research",
    location: "Remote, Global",
    slug: "logistics-data-researcher",
  },
  {
    title: "Supply Chain Research Lead",
    department: "Research",
    location: "London, Hybrid",
    slug: "supply-chain-research-lead",
  },
  {
    title: "Product Designer - Fleet Dashboard",
    department: "Design",
    location: "Remote, EMEA",
    slug: "product-designer-fleet-dashboard",
  },
];
