import { parsePhoneNumberFromString, type CountryCode, type MetadataJson } from "libphonenumber-js/core";
import metadata from "libphonenumber-js/metadata.max.json";
import { z } from "zod";

import { getAddressSchema, requiredAddressFieldKeys } from "./shipmentAddress";
import { calculateShipmentPricing } from "./shipmentPricing";
import type { PackageInput } from "./shipmentPricing";
import type { CorridorConfig, TenantConfig } from "./shipmentTenantConfig";
import { countryFromName, countryIso2, getDialCodeForCountry } from "./shipmentTenantConfig";

export type PartyInput = {
  fullName: string;
  email: string;
  phone: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  contentDescription?: string;
};

export type GoodsInput = {
  category: string;
  declaredValue: number;
  insurance: string;
  notes: string;
};

export type CustomsItemInput = {
  description: string;
  hsCode: string;
  quantity: number;
  declaredValue: number;
  countryOfOrigin: string;
};

export type CustomsDeclarationInput = {
  type: "DDP" | "DDU";
  reasonForExport: string;
  items: CustomsItemInput[];
};

export type ShipmentDraftInput = {
  corridorId: string;
  sender: PartyInput;
  recipient: PartyInput;
  goods: GoodsInput;
  pkg: PackageInput;
  phoneVerified: boolean;
  customs: CustomsDeclarationInput;
};

export type WidgetShipmentPayload = {
  direction: string;
  route: string;
  sender_name: string;
  sender_email: string | null;
  sender_phone: string;
  sender_address: Record<string, string>;
  recipient_name: string;
  recipient_email: string | null;
  recipient_phone: string;
  recipient_address: Record<string, string>;
  category: string;
  declared_value: number;
  insurance: string;
  notes: string | null;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  weight_kg: number;
  chargeable_weight: number;
  price_estimate: number;
  currency: string;
  phone_verified: boolean;
  source: "widget";
  widget_session_id: string | null;
  idempotency_key: string;
  customs_declaration?: {
    type: "DDP" | "DDU";
    items: Array<{
      description: string;
      hsCode: string;
      quantity: number;
      declaredValue: number;
      currency: string;
      countryOfOrigin: string;
      reasonForExport: string;
    }>;
    totalValue: number;
    currency: string;
    documents: unknown[];
    status: "PENDING";
    holdReason: null;
  };
};

const partySchema = z.object({
  fullName: z.string(),
  email: z.string(),
  phone: z.string(),
  address1: z.string(),
  address2: z.string(),
  city: z.string(),
  state: z.string(),
  postcode: z.string(),
  country: z.string(),
  contentDescription: z.string().optional(),
});

const goodsSchema = z.object({
  category: z.string(),
  declaredValue: z.coerce.number(),
  insurance: z.string(),
  notes: z.string(),
});

const packageSchema = z.object({
  lengthCm: z.coerce.number(),
  widthCm: z.coerce.number(),
  heightCm: z.coerce.number(),
  weightKg: z.coerce.number(),
});

const customsItemSchema = z.object({
  description: z.string(),
  hsCode: z.string(),
  quantity: z.coerce.number(),
  declaredValue: z.coerce.number(),
  countryOfOrigin: z.string(),
});

const customsSchema = z.object({
  type: z.enum(["DDP", "DDU"]),
  reasonForExport: z.string(),
  items: z.array(customsItemSchema),
});

export const shipmentDraftSchema = z.object({
  corridorId: z.string(),
  sender: partySchema,
  recipient: partySchema,
  goods: goodsSchema,
  pkg: packageSchema,
  phoneVerified: z.boolean(),
  customs: customsSchema,
});

export type ValidationResult =
  | { ok: true; data: ShipmentDraftInput }
  | { ok: false; issues: string[] };

function trimParty(party: PartyInput): PartyInput {
  return {
    ...party,
    fullName: party.fullName.trim(),
    email: party.email.trim(),
    phone: party.phone.trim(),
    address1: party.address1.trim(),
    address2: party.address2.trim(),
    city: party.city.trim(),
    state: party.state.trim(),
    postcode: party.postcode.trim(),
    country: party.country.trim(),
    contentDescription: party.contentDescription?.trim(),
  };
}

export function findCorridor(config: TenantConfig, corridorId: string): CorridorConfig | null {
  return config.corridors.find((corridor) => corridor.id === corridorId) ?? null;
}

export function formatPhoneE164(phone: string, countryName: string): string | null {
  const iso2 = countryIso2(countryName);
  if (!iso2) return null;
  const raw = phone.trim();
  const candidate = raw.startsWith("+") ? raw : `+${getDialCodeForCountry(countryName)}${raw.replace(/\D/g, "")}`;
  const parsed = parsePhoneNumberFromString(candidate, iso2 as CountryCode, metadata as MetadataJson);
  if (!parsed?.isValid()) return null;
  return parsed.number;
}

export function isPhoneValidForCountry(phone: string, countryName: string): boolean {
  return formatPhoneE164(phone, countryName) !== null;
}

function validateParty(party: PartyInput, side: "sender" | "recipient", issues: string[]) {
  if (!party.fullName) issues.push(`${side}.fullName`);
  if (party.email && !z.string().email().safeParse(party.email).success) issues.push(`${side}.email`);
  if (!party.country || !countryFromName(party.country)) issues.push(`${side}.country`);
  if (!party.phone || !isPhoneValidForCountry(party.phone, party.country)) issues.push(`${side}.phone`);

  for (const field of requiredAddressFieldKeys(party.country)) {
    if (!party[field].trim()) issues.push(`${side}.${field}`);
  }
}

export function validateShipmentDraft(
  input: unknown,
  config: TenantConfig,
  options: { requirePhoneVerified?: boolean } = {},
): ValidationResult {
  const parsed = shipmentDraftSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((issue) => issue.path.join(".") || issue.message) };
  }

  const data: ShipmentDraftInput = {
    ...parsed.data,
    sender: trimParty(parsed.data.sender),
    recipient: trimParty(parsed.data.recipient),
    goods: {
      ...parsed.data.goods,
      category: parsed.data.goods.category.trim(),
      insurance: parsed.data.goods.insurance.trim(),
      notes: parsed.data.goods.notes.trim(),
    },
    customs: {
      ...parsed.data.customs,
      reasonForExport: parsed.data.customs.reasonForExport.trim(),
      items: parsed.data.customs.items.map((item) => ({
        ...item,
        description: item.description.trim(),
        hsCode: item.hsCode.trim(),
        countryOfOrigin: item.countryOfOrigin.trim(),
      })),
    },
  };

  const issues: string[] = [];
  const corridor = findCorridor(config, data.corridorId);
  if (!corridor) issues.push("corridor");
  validateParty(data.sender, "sender", issues);
  validateParty(data.recipient, "recipient", issues);

  if (corridor) {
    if (data.sender.country !== corridor.originCountry) issues.push("sender.country");
    if (data.recipient.country !== corridor.destinationCountry) issues.push("recipient.country");
  }

  if (data.pkg.lengthCm <= 0) issues.push("pkg.lengthCm");
  if (data.pkg.widthCm <= 0) issues.push("pkg.widthCm");
  if (data.pkg.heightCm <= 0) issues.push("pkg.heightCm");
  if (data.pkg.weightKg < 5) issues.push("pkg.weightKg");
  if (data.goods.declaredValue <= 0) issues.push("goods.declaredValue");

  const category = config.allowedCategories.find((item) => item.key === data.goods.category);
  if (!category || category.status === "blocked") issues.push("goods.category");

  const insuranceTier = config.pricing.insuranceTiers.find((tier) => tier.key === data.goods.insurance && tier.enabled);
  if (!insuranceTier) issues.push("goods.insurance");

  if (options.requirePhoneVerified && !data.phoneVerified) issues.push("phoneVerified");

  if (corridor?.customsRequired) {
    if (!data.customs.reasonForExport) issues.push("customs.reasonForExport");
    if (data.customs.items.length === 0) issues.push("customs.items");
    data.customs.items.forEach((item, index) => {
      if (!item.description) issues.push(`customs.items.${index}.description`);
      if (!item.hsCode) issues.push(`customs.items.${index}.hsCode`);
      if (item.quantity <= 0) issues.push(`customs.items.${index}.quantity`);
      if (item.declaredValue <= 0) issues.push(`customs.items.${index}.declaredValue`);
      if (!item.countryOfOrigin || !countryFromName(item.countryOfOrigin)) issues.push(`customs.items.${index}.countryOfOrigin`);
    });
  }

  return issues.length ? { ok: false, issues } : { ok: true, data };
}

function addressJson(party: PartyInput): Record<string, string> {
  const schema = getAddressSchema(party.country);
  const json: Record<string, string> = {
    country: party.country,
  };
  for (const field of schema.fields) {
    const value = party[field.key].trim();
    if (value) json[field.key] = value;
  }
  if (party.contentDescription?.trim()) {
    json.contentDescription = party.contentDescription.trim();
  }
  return json;
}

function customsPayload(data: ShipmentDraftInput, currency: string): WidgetShipmentPayload["customs_declaration"] {
  const items = data.customs.items.map((item) => ({
    description: item.description,
    hsCode: item.hsCode,
    quantity: item.quantity,
    declaredValue: item.declaredValue,
    currency,
    countryOfOrigin: item.countryOfOrigin,
    reasonForExport: data.customs.reasonForExport,
  }));
  return {
    type: data.customs.type,
    items,
    totalValue: items.reduce((total, item) => total + item.declaredValue * item.quantity, 0),
    currency,
    documents: [],
    status: "PENDING",
    holdReason: null,
  };
}

function combineNotes(goodsNotes: string): string | null {
  const notes = goodsNotes.trim();
  return notes || null;
}

export function buildWidgetShipmentPayload(
  draft: ShipmentDraftInput,
  config: TenantConfig,
  options: { widgetSessionId: string | null; idempotencyKey: string },
): WidgetShipmentPayload {
  const corridor = findCorridor(config, draft.corridorId);
  if (!corridor) throw new Error("Invalid corridor");
  const pricing = calculateShipmentPricing(draft.pkg, draft.goods.declaredValue, draft.goods.insurance, config);
  const customs = corridor.customsRequired ? customsPayload(draft, config.currency) : undefined;
  const senderPhone = formatPhoneE164(draft.sender.phone, draft.sender.country);
  const recipientPhone = formatPhoneE164(draft.recipient.phone, draft.recipient.country);
  if (!senderPhone || !recipientPhone) throw new Error("Invalid phone number");

  return {
    direction: corridor.direction,
    route: corridor.route,
    sender_name: draft.sender.fullName,
    sender_email: draft.sender.email || null,
    sender_phone: senderPhone,
    sender_address: addressJson(draft.sender),
    recipient_name: draft.recipient.fullName,
    recipient_email: draft.recipient.email || null,
    recipient_phone: recipientPhone,
    recipient_address: addressJson(draft.recipient),
    category: draft.goods.category,
    declared_value: draft.goods.declaredValue,
    insurance: draft.goods.insurance,
    notes: combineNotes(draft.goods.notes),
    length_cm: draft.pkg.lengthCm,
    width_cm: draft.pkg.widthCm,
    height_cm: draft.pkg.heightCm,
    weight_kg: draft.pkg.weightKg,
    chargeable_weight: pricing.chargeableWeight,
    price_estimate: pricing.total,
    currency: config.currency,
    phone_verified: draft.phoneVerified,
    source: "widget",
    widget_session_id: options.widgetSessionId,
    idempotency_key: options.idempotencyKey,
    ...(customs ? { customs_declaration: customs } : {}),
  };
}
