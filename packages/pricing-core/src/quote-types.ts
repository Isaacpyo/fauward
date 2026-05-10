export type CarrierOptionSource = 'INTERNAL_FLEET' | 'EXTERNAL_CARRIER';

export interface SurchargeBreakdown {
  label: string;
  amount: number;
  type?: string;
}

export interface CarrierOption {
  carrier: string;
  serviceLevel: string;
  source: CarrierOptionSource;
  price: number;
  currency: string;
  transitDays?: number;
  chargeableWeightKg: number;
  surcharges: SurchargeBreakdown[];
  isPreferred?: boolean;
  isFastest?: boolean;
  metadata?: Record<string, unknown>;
}

export interface RateQuote {
  id?: string;
  tenantId?: string;
  shipmentId?: string | null;
  origin: Record<string, unknown>;
  destination: Record<string, unknown>;
  weightKg: number;
  volumetricWeightKg?: number;
  chargeableWeightKg: number;
  quotes: CarrierOption[];
  expiresAt: string;
  createdAt?: string;
}
