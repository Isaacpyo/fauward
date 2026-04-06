export type TenantRole =
  | "SUPER_ADMIN"
  | "TENANT_ADMIN"
  | "TENANT_MANAGER"
  | "TENANT_FINANCE"
  | "TENANT_STAFF"
  | "TENANT_DRIVER"
  | "CUSTOMER_ADMIN"
  | "CUSTOMER_USER";

export type TenantConfig = {
  tenant_id: string;
  name: string;
  logo_url: string;
  domain: string;
  primary_color: string;
  accent_color: string;
  locale: string;
  rtl: boolean;
  currency: string;
  timezone: string;
  onboarding_complete?: boolean;
  support_email?: string;
  support_phone?: string;
};

export type User = {
  id: string;
  full_name: string;
  email: string;
  role: TenantRole;
  avatar_url?: string;
  impersonated?: boolean;
  plan: "starter" | "pro" | "enterprise";
};

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  href?: string;
};

export type ToastItem = {
  id: string;
  title: string;
  description?: string;
  variant?: "default" | "success" | "warning" | "error";
};

export type ShipmentState =
  | "PENDING"
  | "PROCESSING"
  | "PICKED_UP"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "FAILED_DELIVERY"
  | "RETURNED"
  | "CANCELLED"
  | "EXCEPTION";

export type InvoiceState = "DRAFT" | "SENT" | "PAID" | "OVERDUE" | "VOID";
