export type AddressFields = {
  line1: string;
  line2: string;
  city: string;
  postcode: string;
  country: string;
  contactName: string;
  contactPhone: string;
};

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
  serviceTier: "Standard" | "Express" | "Same Day";
  insurance: boolean;
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
  serviceTier: "Standard",
  insurance: false,
  termsAccepted: false
};
