export type JobType = "shipment" | "hub" | "dispatch" | "pickup" | "transfer" | "delivery" | "return";
export type JobStatus = "assigned" | "in_progress" | "completed" | "failed" | "exception";
export type Priority = "low" | "normal" | "high" | "critical";
export type StopStatus =
  | "assigned"
  | "in_progress"
  | "completed"
  | "failed"
  | "exception";
export type WorkflowStage =
  | "shipment_creation"
  | "warehouse_intake"
  | "dispatch_handoff"
  | "pickup"
  | "linehaul"
  | "delivery"
  | "return_initiation"
  | "return_receipt";
export type VerificationTarget = "shipment" | "package" | "label";
export type PendingMutationType =
  | "status_update"
  | "pod_upload"
  | "location_update"
  | "exception_submit"
  | "verification_submit";
export type PendingMutationState = "pending" | "syncing" | "failed" | "synced";

export type FieldUser = {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: string;
  tenantLabel: string;
  vehicleLabel: string;
  shiftLabel: string;
  permissions: string[];
};

export type StopVerificationCode = {
  id: string;
  target: VerificationTarget;
  label: string;
  value: string;
  codeType: "qr" | "barcode";
};

export type PodRequirements = {
  otp: boolean;
  signature: boolean;
  photo: boolean;
  recipientName: boolean;
};

export type FieldJob = {
  id: string;
  shipmentId: string;
  type: JobType;
  workflowStage: WorkflowStage;
  status: JobStatus;
  priority: Priority;
  routeId?: string;
  stopId?: string;
  address: string;
  contactName?: string;
  contactPhone?: string;
  instructions?: string;
  timeWindowStart?: string;
  timeWindowEnd?: string;
  updatedAt: string;
};

export type FieldRoute = {
  id: string;
  label: string;
  area: string;
  vehicleLabel: string;
  assignedAt: string;
  shiftWindow: string;
};

export type FieldStop = {
  id: string;
  routeId: string;
  shipmentId: string;
  sequence: number;
  type: JobType;
  workflowStage: WorkflowStage;
  title: string;
  address: string;
  contactName?: string;
  contactPhone?: string;
  instructions?: string;
  etaLabel: string;
  packageCount: number;
  podRequirements?: PodRequirements;
  verificationCodes: StopVerificationCode[];
  status: StopStatus;
  updatedAt: string;
};

export type PendingMutation = {
  id: string;
  type: PendingMutationType;
  entityId: string;
  payload: Record<string, unknown>;
  createdAt: string;
  retryCount: number;
  idempotencyKey: string;
  state: PendingMutationState;
};

export type PodDraft = {
  id: string;
  shipmentId: string;
  stopId?: string;
  otpCode?: string;
  recipientName?: string;
  signatureRef?: string;
  photoRefs?: string[];
  deliveredAt?: string;
  lat?: number;
  lng?: number;
  notes?: string;
  state: "draft" | "ready" | "uploaded" | "failed";
};

export type ScanVerificationRecord = {
  id: string;
  shipmentId?: string;
  packageId?: string;
  stopId?: string;
  target: VerificationTarget;
  expectedValue?: string;
  codeType: "qr" | "barcode";
  scannedValue: string;
  result: "matched" | "mismatch" | "unknown";
  createdAt: string;
  synced: boolean;
};

export type LocationPing = {
  id: string;
  lat: number;
  lng: number;
  accuracy?: number;
  source: "gps" | "manual";
  stopId?: string;
  createdAt: string;
  synced: boolean;
};

export const stopStatusLabel: Record<StopStatus, string> = {
  assigned: "Assigned",
  in_progress: "In progress",
  completed: "Completed",
  failed: "Failed",
  exception: "Exception",
};

export const jobStatusLabel: Record<JobStatus, string> = {
  assigned: "Assigned",
  in_progress: "In progress",
  completed: "Completed",
  failed: "Failed",
  exception: "Exception",
};

export const priorityLabel: Record<Priority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  critical: "Critical",
};

export const workflowStageLabel: Record<WorkflowStage, string> = {
  shipment_creation: "Shipment creation",
  warehouse_intake: "Warehouse intake",
  dispatch_handoff: "Dispatch handoff",
  pickup: "Pickup",
  linehaul: "Linehaul",
  delivery: "Delivery",
  return_initiation: "Return initiation",
  return_receipt: "Return receipt",
};

export const verificationTargetLabel: Record<VerificationTarget, string> = {
  shipment: "Shipment",
  package: "Package",
  label: "Label",
};

export const pendingMutationStateLabel: Record<PendingMutationState, string> = {
  pending: "Pending",
  syncing: "Syncing",
  failed: "Failed",
  synced: "Synced",
};

export const pendingMutationTypeLabel: Record<PendingMutationType, string> = {
  status_update: "Status update",
  pod_upload: "POD upload",
  location_update: "Location ping",
  exception_submit: "Exception",
  verification_submit: "Verification",
};

export const stopStatusTone: Record<StopStatus, "neutral" | "info" | "success" | "warning" | "danger"> = {
  assigned: "neutral",
  in_progress: "info",
  completed: "success",
  failed: "danger",
  exception: "warning",
};

export const priorityTone: Record<Priority, "neutral" | "info" | "warning" | "danger"> = {
  low: "neutral",
  normal: "info",
  high: "warning",
  critical: "danger",
};

export const mutationStateTone: Record<
  PendingMutationState,
  "neutral" | "info" | "success" | "warning" | "danger"
> = {
  pending: "warning",
  syncing: "info",
  failed: "danger",
  synced: "success",
};

export const scanResultTone: Record<
  ScanVerificationRecord["result"],
  "neutral" | "info" | "success" | "warning" | "danger"
> = {
  matched: "success",
  mismatch: "danger",
  unknown: "warning",
};
