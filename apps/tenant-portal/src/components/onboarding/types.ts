export type InviteMember = {
  id: string;
  email: string;
  role: "Manager" | "Finance" | "Staff";
};

export type OnboardingState = {
  logoFile?: File;
  logoPreview?: string;
  companyName: string;
  primaryColor: string;
  firstShipmentTracking?: string;
  firstShipmentCreated: boolean;
  invitedMembers: InviteMember[];
  paymentsConnected: boolean;
  stripeAccountId?: string;
};

export const initialOnboardingState: OnboardingState = {
  companyName: "",
  primaryColor: "#0D1F3C",
  firstShipmentCreated: false,
  invitedMembers: [],
  paymentsConnected: false
};
