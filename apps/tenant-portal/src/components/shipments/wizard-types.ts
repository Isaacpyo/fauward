export type AddressFields = {
  line1: string;
  line2: string;
  city: string;
  postcode: string;
  country: string;
  contactName: string;
  contactPhone: string;
};

/** Service tiers the pricing engine understands (`TenantSettings.serviceTierConfig` keys). */
export type ServiceTier = "STANDARD" | "EXPRESS" | "OVERNIGHT";

export const SERVICE_TIERS: Array<{ tier: ServiceTier; label: string }> = [
  { tier: "STANDARD", label: "Standard" },
  { tier: "EXPRESS", label: "Express" },
  { tier: "OVERNIGHT", label: "Overnight" }
];

export type ShipmentWizardData = {
  pickup: AddressFields;
  delivery: AddressFields;
  returnSameAsPickup: boolean;
  packageWeightKg: string;
  packageLengthCm: string;
  packageWidthCm: string;
  packageHeightCm: string;
  quantity: string;
  description: string;
  fragile: boolean;
  specialInstructions: string;
  serviceTier: ServiceTier;
  termsAccepted: boolean;
};

export const initialAddress: AddressFields = {
  line1: "",
  line2: "",
  city: "",
  postcode: "",
  country: "",
  contactName: "",
  contactPhone: ""
};

export const initialShipmentWizardData: ShipmentWizardData = {
  pickup: { ...initialAddress },
  delivery: { ...initialAddress },
  returnSameAsPickup: true,
  packageWeightKg: "",
  packageLengthCm: "",
  packageWidthCm: "",
  packageHeightCm: "",
  quantity: "1",
  description: "",
  fragile: false,
  specialInstructions: "",
  serviceTier: "STANDARD",
  termsAccepted: false
};

export type ShipmentQuote = {
  chargeableWeightKg: number;
  breakdown: Array<{ label: string; amount: number }>;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  currency: string;
};

function quantityOf(data: ShipmentWizardData) {
  return Math.max(1, Math.floor(Number(data.quantity) || 1));
}

function optionalNumber(value: string) {
  const parsed = Number(value);
  return value.trim() && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/** The one line item the wizard books: total weight across all packages, largest package dimensions. */
export function wizardItem(data: ShipmentWizardData) {
  const quantity = quantityOf(data);
  return {
    description: [data.description.trim(), data.fragile ? "Fragile" : ""].filter(Boolean).join(" · ") || undefined,
    quantity,
    weightKg: Number(data.packageWeightKg) * quantity,
    lengthCm: optionalNumber(data.packageLengthCm),
    widthCm: optionalNumber(data.packageWidthCm),
    heightCm: optionalNumber(data.packageHeightCm)
  };
}

/** Body for `POST /v1/pricing/calculate` (the same engine `POST /v1/shipments` prices with). */
export function quoteRequest(data: ShipmentWizardData) {
  const item = wizardItem(data);
  return {
    serviceTier: data.serviceTier,
    weightKg: item.weightKg,
    lengthCm: item.lengthCm ?? 0,
    widthCm: item.widthCm ?? 0,
    heightCm: item.heightCm ?? 0
  };
}

function address(fields: AddressFields) {
  return {
    line1: fields.line1.trim(),
    line2: fields.line2.trim() || undefined,
    city: fields.city.trim(),
    postcode: fields.postcode.trim() || undefined,
    country: fields.country.trim(),
    contactName: fields.contactName.trim(),
    contactPhone: fields.contactPhone.trim()
  };
}

/** Body for `POST /v1/shipments` (shipments.routes.ts). */
export function createShipmentRequest(data: ShipmentWizardData) {
  return {
    originAddress: address(data.pickup),
    destinationAddress: address(data.delivery),
    serviceTier: data.serviceTier,
    specialInstructions: [data.fragile ? "Fragile — handle with care" : "", data.specialInstructions.trim()].filter(Boolean).join("\n") || undefined,
    items: [wizardItem(data)]
  };
}
