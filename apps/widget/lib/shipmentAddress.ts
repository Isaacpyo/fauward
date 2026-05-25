import { countryIso2 } from "./shipmentTenantConfig";

export type AddressFieldKey = "address1" | "address2" | "city" | "state" | "postcode";

export type AddressFieldConfig = {
  key: AddressFieldKey;
  labelKey: string;
  required: boolean;
};

export type AddressSchema = {
  countryIso2: string;
  fields: AddressFieldConfig[];
};

const DEFAULT_FIELDS: AddressFieldConfig[] = [
  { key: "address1", labelKey: "address.address1", required: true },
  { key: "address2", labelKey: "address.address2", required: false },
  { key: "city", labelKey: "address.city", required: true },
  { key: "state", labelKey: "address.region", required: false },
  { key: "postcode", labelKey: "address.postcode", required: false },
];

const ADDRESS_SCHEMAS: Record<string, AddressSchema> = {
  GB: {
    countryIso2: "GB",
    fields: [
      { key: "address1", labelKey: "address.address1", required: true },
      { key: "address2", labelKey: "address.address2", required: false },
      { key: "city", labelKey: "address.townCity", required: true },
      { key: "state", labelKey: "address.county", required: false },
      { key: "postcode", labelKey: "address.postcode", required: true },
    ],
  },
  IE: {
    countryIso2: "IE",
    fields: [
      { key: "address1", labelKey: "address.address1", required: true },
      { key: "address2", labelKey: "address.address2", required: false },
      { key: "city", labelKey: "address.townCity", required: true },
      { key: "state", labelKey: "address.county", required: false },
      { key: "postcode", labelKey: "address.eircode", required: false },
    ],
  },
  NG: {
    countryIso2: "NG",
    fields: [
      { key: "address1", labelKey: "address.address1", required: true },
      { key: "address2", labelKey: "address.address2", required: false },
      { key: "city", labelKey: "address.city", required: true },
      { key: "state", labelKey: "address.state", required: true },
      { key: "postcode", labelKey: "address.postcodeOptional", required: false },
    ],
  },
  GH: {
    countryIso2: "GH",
    fields: [
      { key: "address1", labelKey: "address.address1", required: true },
      { key: "address2", labelKey: "address.address2", required: false },
      { key: "city", labelKey: "address.city", required: true },
      { key: "state", labelKey: "address.region", required: true },
      { key: "postcode", labelKey: "address.postcodeOptional", required: false },
    ],
  },
  KE: {
    countryIso2: "KE",
    fields: [
      { key: "address1", labelKey: "address.address1", required: true },
      { key: "address2", labelKey: "address.address2", required: false },
      { key: "city", labelKey: "address.townCity", required: true },
      { key: "state", labelKey: "address.county", required: true },
      { key: "postcode", labelKey: "address.postcodeOptional", required: false },
    ],
  },
  ZA: {
    countryIso2: "ZA",
    fields: [
      { key: "address1", labelKey: "address.address1", required: true },
      { key: "address2", labelKey: "address.address2", required: false },
      { key: "city", labelKey: "address.city", required: true },
      { key: "state", labelKey: "address.province", required: true },
      { key: "postcode", labelKey: "address.postcode", required: true },
    ],
  },
  AE: {
    countryIso2: "AE",
    fields: [
      { key: "address1", labelKey: "address.address1", required: true },
      { key: "address2", labelKey: "address.address2", required: false },
      { key: "city", labelKey: "address.areaCity", required: true },
      { key: "state", labelKey: "address.emirate", required: true },
    ],
  },
  SA: {
    countryIso2: "SA",
    fields: [
      { key: "address1", labelKey: "address.address1", required: true },
      { key: "address2", labelKey: "address.address2", required: false },
      { key: "city", labelKey: "address.city", required: true },
      { key: "state", labelKey: "address.province", required: true },
      { key: "postcode", labelKey: "address.postalCode", required: false },
    ],
  },
  US: {
    countryIso2: "US",
    fields: [
      { key: "address1", labelKey: "address.address1", required: true },
      { key: "address2", labelKey: "address.address2", required: false },
      { key: "city", labelKey: "address.city", required: true },
      { key: "state", labelKey: "address.state", required: true },
      { key: "postcode", labelKey: "address.zip", required: true },
    ],
  },
  CA: {
    countryIso2: "CA",
    fields: [
      { key: "address1", labelKey: "address.address1", required: true },
      { key: "address2", labelKey: "address.address2", required: false },
      { key: "city", labelKey: "address.city", required: true },
      { key: "state", labelKey: "address.province", required: true },
      { key: "postcode", labelKey: "address.postalCode", required: true },
    ],
  },
};

export function getAddressSchema(countryName: string): AddressSchema {
  const iso2 = countryIso2(countryName) ?? "DEFAULT";
  return ADDRESS_SCHEMAS[iso2] ?? { countryIso2: iso2, fields: DEFAULT_FIELDS };
}

export function requiredAddressFieldKeys(countryName: string): AddressFieldKey[] {
  return getAddressSchema(countryName).fields.filter((field) => field.required).map((field) => field.key);
}

