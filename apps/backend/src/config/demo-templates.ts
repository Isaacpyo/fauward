// gtm.demos (WP-4.15): code-defined demo templates. A template decides the demo tenant's plan and what the seed
// function generates (customer organisations, shipments across the lifecycle). Everything is written to a tenant with
// status DEMO, which MRR, health scoring, the onboarding funnel and attribution leave out.

export type DemoPlace = { city: string; country: string; postcode: string; street: string };

export type DemoTemplate = {
  id: string;
  name: string;
  description: string;
  plan: 'STARTER' | 'PRO' | 'ENTERPRISE';
  organisations: readonly string[];
  shipments: number;
  /** Share of shipments going abroad (0–1). */
  internationalShare: number;
  serviceTiers: readonly string[];
  items: readonly { description: string; kg: readonly [number, number]; value: readonly [number, number] }[];
};

export const DEMO_DOMESTIC_PLACES: readonly DemoPlace[] = [
  { city: 'London', country: 'GB', postcode: 'E14 5AB', street: '18 Canary Wharf Quay' },
  { city: 'London', country: 'GB', postcode: 'NW10 7LQ', street: 'Unit 7, Park Royal Trade Centre' },
  { city: 'Manchester', country: 'GB', postcode: 'M17 1SN', street: 'Trafford Park Logistics Hub' },
  { city: 'Birmingham', country: 'GB', postcode: 'B5 4BU', street: '12 Digbeth High Street' },
  { city: 'Leeds', country: 'GB', postcode: 'LS1 4DY', street: '27 Wellington Place' },
  { city: 'Bristol', country: 'GB', postcode: 'BS1 6FL', street: '31 Temple Quay' },
  { city: 'Glasgow', country: 'GB', postcode: 'G2 5QR', street: '140 West George Street' },
  { city: 'Cardiff', country: 'GB', postcode: 'CF10 5AL', street: '2 Callaghan Square' }
];

export const DEMO_INTERNATIONAL_PLACES: readonly DemoPlace[] = [
  { city: 'Rotterdam', country: 'NL', postcode: '3011 AD', street: 'Wilhelminakade 77' },
  { city: 'Paris', country: 'FR', postcode: '75011', street: '14 Rue Oberkampf' },
  { city: 'Dublin', country: 'IE', postcode: 'D02 X285', street: '1 Grand Canal Square' },
  { city: 'Lagos', country: 'NG', postcode: '101241', street: '15 Adeola Odeku Street' },
  { city: 'New York', country: 'US', postcode: '10013', street: '88 Varick Street' }
];

export const DEMO_TEMPLATES: readonly DemoTemplate[] = [
  {
    id: 'courier',
    name: 'Courier',
    description: 'Same-day and next-day parcels around UK cities.',
    plan: 'PRO',
    organisations: ['Northgate Retail Group', 'Brightwater Pharmacy', 'Velo Cycles UK', 'Juniper & Moss Home', 'Copperleaf Fashion'],
    shipments: 40,
    internationalShare: 0,
    serviceTiers: ['STANDARD', 'EXPRESS', 'OVERNIGHT'],
    items: [
      { description: 'Boxed homeware', kg: [2, 12], value: [40, 260] },
      { description: 'Pharmaceutical supplies (ambient)', kg: [1, 6], value: [120, 900] },
      { description: 'Apparel cartons', kg: [4, 20], value: [90, 600] }
    ]
  },
  {
    id: 'freight-forwarder',
    name: 'Freight forwarder',
    description: 'Palletised and international freight with customs-ready items.',
    plan: 'ENTERPRISE',
    organisations: ['Atlas Components Ltd', 'Meridian Medical Supplies', 'Silverline Electronics', 'Oakridge Furniture Co.'],
    shipments: 30,
    internationalShare: 0.5,
    serviceTiers: ['STANDARD', 'EXPRESS'],
    items: [
      { description: 'Industrial components', kg: [8, 140], value: [300, 4200] },
      { description: 'Palletised dry goods', kg: [180, 620], value: [600, 3800] },
      { description: 'Consumer electronics', kg: [1, 9], value: [150, 1800] }
    ]
  },
  {
    id: 'logistics-3pl',
    name: '3PL',
    description: 'Warehouse fulfilment for several retail clients.',
    plan: 'PRO',
    organisations: ['Hearth & Field Foods', 'Northgate Retail Group', 'Oakridge Furniture Co.', 'Velo Cycles UK', 'Juniper & Moss Home', 'Copperleaf Fashion'],
    shipments: 50,
    internationalShare: 0.1,
    serviceTiers: ['STANDARD', 'EXPRESS'],
    items: [
      { description: 'Flat-pack furniture', kg: [18, 65], value: [180, 950] },
      { description: 'Bicycle (boxed)', kg: [14, 22], value: [450, 2400] },
      { description: 'Boxed homeware', kg: [2, 12], value: [40, 260] }
    ]
  }
];

export function findDemoTemplate(id: string) {
  return DEMO_TEMPLATES.find((template) => template.id === id) ?? null;
}

/** Demos live at most this long from creation or from an extension. */
export const DEMO_MAX_DAYS = 30;
export const DEMO_DEFAULT_DAYS = 14;
/** Upper bound on a share-link session; it also never outlives the demo. */
export const DEMO_SESSION_HOURS = 8;
