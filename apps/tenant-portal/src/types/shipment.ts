import type { InvoiceState, ShipmentState } from "@/types/domain";

export type ShipmentListItem = {
  id: string;
  tracking_number: string;
  status: ShipmentState;
  customer_name: string;
  origin: string;
  destination: string;
  route_id?: string;
  route_name?: string;
  driver_name?: string;
  service_tier: "Standard" | "Express" | "Same Day";
  created_at: string;
  reference?: string;
};

export type ShipmentTimelineEvent = {
  id: string;
  status: ShipmentState;
  description: string;
  location?: string;
  timestamp: string;
  actor: string;
  note?: string;
};

export type ShipmentDocument = {
  id: string;
  file_name: string;
  file_url: string;
  file_type: "jpg" | "png" | "webp" | "pdf";
  uploaded_by: string;
  uploaded_at: string;
  preview_url?: string;
};

export type ShipmentNote = {
  id: string;
  author_name: string;
  author_avatar?: string;
  text: string;
  created_at: string;
};

export type ShipmentDetail = {
  id: string;
  tracking_number: string;
  status: ShipmentState;
  service_tier: "Standard" | "Express" | "Same Day";
  customer_id: string;
  customer_name: string;
  organisation_name?: string;
  reference_number?: string;
  created_at: string;
  pickup_address: string;
  delivery_address: string;
  origin_city: string;
  destination_city: string;
  package_weight_kg: number;
  package_dimensions_cm?: string;
  package_quantity: number;
  package_description?: string;
  special_instructions?: string;
  pricing_amount: number;
  assigned_driver_id?: string;
  assigned_driver_name?: string;
  assigned_driver_avatar?: string;
  assigned_staff_name?: string;
  timeline: ShipmentTimelineEvent[];
  documents: ShipmentDocument[];
  invoice?: {
    id: string;
    number: string;
    status: InvoiceState;
    amount: number;
    due_date: string;
  };
  notes: ShipmentNote[];
  exception_reason?: string;
  pod_photo_url?: string;
  signature_url?: string;
  estimated_delivery_date?: string;
};

export type DriverListItem = {
  id: string;
  name: string;
  avatar_url?: string;
  current_load: number;
  status: "available" | "busy" | "offline";
};
