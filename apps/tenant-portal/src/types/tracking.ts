import type { ShipmentState } from "@/types/domain";

export type TrackingEvent = {
  id: string;
  status: ShipmentState;
  description: string;
  location?: string;
  timestamp: string;
  note?: string;
};

export type TrackingResult = {
  tracking_number: string;
  status: ShipmentState;
  origin_city: string;
  destination_city: string;
  estimated_delivery_date?: string;
  delivered_at?: string;
  service_tier: string;
  events: TrackingEvent[];
  pod_photo_url?: string;
  signature_url?: string;
  exception_reason?: string;
  support_email?: string;
  support_phone?: string;
};
