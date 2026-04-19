import type {
  FieldJob,
  FieldRoute,
  FieldStop,
  FieldUser,
  JobStatus,
  JobType,
  LocationPing,
  PendingMutation,
  PendingMutationState,
  PodDraft,
  Priority,
  ScanVerificationRecord,
  StopStatus,
  VerificationTarget,
  WorkflowStage,
} from "@/types/field";
import { apiRequest } from "@/lib/api/http";

type AssignedWorkload = {
  jobs: FieldJob[];
  routes: FieldRoute[];
  stops: FieldStop[];
};

type SyncBatchContext = {
  user: FieldUser;
  jobs: FieldJob[];
  routes: FieldRoute[];
  stops: FieldStop[];
  podDrafts: PodDraft[];
  scanVerifications: ScanVerificationRecord[];
  locationPings: LocationPing[];
};

type SyncMutationResult = {
  mutationId: string;
  state: PendingMutationState;
};

type SyncBatchResult = {
  results: SyncMutationResult[];
};

const workflowStages: WorkflowStage[] = [
  "shipment_creation",
  "warehouse_intake",
  "dispatch_handoff",
  "pickup",
  "linehaul",
  "delivery",
  "return_initiation",
  "return_receipt",
];

const jobTypes: JobType[] = ["shipment", "hub", "dispatch", "pickup", "transfer", "delivery", "return"];
const priorities: Priority[] = ["low", "normal", "high", "critical"];
const jobStatuses: JobStatus[] = ["assigned", "in_progress", "completed", "failed", "exception"];
const stopStatuses: StopStatus[] = ["assigned", "in_progress", "completed", "failed", "exception"];
const verificationTargets: VerificationTarget[] = ["shipment", "package", "label"];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readValue = (source: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    if (key in source) {
      return source[key];
    }
  }

  return undefined;
};

const readString = (source: Record<string, unknown>, keys: string[], fallback?: string) => {
  const value = readValue(source, keys);
  return typeof value === "string" && value.trim() ? value : fallback;
};

const readNumber = (source: Record<string, unknown>, keys: string[], fallback?: number) => {
  const value = readValue(source, keys);
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
};

const readBoolean = (source: Record<string, unknown>, keys: string[], fallback = false) => {
  const value = readValue(source, keys);
  return typeof value === "boolean" ? value : fallback;
};

const readStringArray = (source: Record<string, unknown>, keys: string[]) => {
  const value = readValue(source, keys);

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
};

const readArray = (source: Record<string, unknown>, keys: string[]) => {
  const value = readValue(source, keys);
  return Array.isArray(value) ? value : [];
};

const readEnum = <T extends string>(
  source: Record<string, unknown>,
  keys: string[],
  allowed: readonly T[],
  fallback: T,
) => {
  const value = readString(source, keys);
  return value && allowed.includes(value as T) ? (value as T) : fallback;
};

const inferStageFromType = (type: JobType): WorkflowStage => {
  switch (type) {
    case "shipment":
      return "shipment_creation";
    case "hub":
      return "warehouse_intake";
    case "dispatch":
      return "dispatch_handoff";
    case "pickup":
      return "pickup";
    case "transfer":
      return "linehaul";
    case "delivery":
      return "delivery";
    case "return":
      return "return_initiation";
    default:
      return "delivery";
  }
};

const collectItems = (payload: unknown, keys: string[]) => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!isRecord(payload)) {
    return [];
  }

  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
};

const normalizeUser = (payload: unknown): FieldUser => {
  const source = isRecord(payload) ? payload : {};

  return {
    id: readString(source, ["id", "userId", "sub"], "field-user") ?? "field-user",
    tenantId: readString(source, ["tenantId", "tenant_id"], "tenant") ?? "tenant",
    name: readString(source, ["name", "fullName"], "Field operator") ?? "Field operator",
    email: readString(source, ["email"], "") ?? "",
    role: readString(source, ["role"], "Field operator") ?? "Field operator",
    tenantLabel:
      readString(source, ["tenantLabel", "tenantName", "tenant", "tenantSlug"], "Assigned tenant") ??
      "Assigned tenant",
    vehicleLabel:
      readString(source, ["vehicleLabel", "vehicleName", "vehicle"], "Unassigned vehicle") ?? "Unassigned vehicle",
    shiftLabel: readString(source, ["shiftLabel", "shiftName", "shift"], "Active shift") ?? "Active shift",
    permissions: readStringArray(source, ["permissions", "scopes"]),
  };
};

const normalizeRoute = (payload: unknown): FieldRoute | undefined => {
  if (!isRecord(payload)) {
    return undefined;
  }

  const id = readString(payload, ["id", "routeId", "route_id"]);

  if (!id) {
    return undefined;
  }

  return {
    id,
    label: readString(payload, ["label", "name"], "Assigned route") ?? "Assigned route",
    area: readString(payload, ["area", "zone", "region"], "Assigned area") ?? "Assigned area",
    vehicleLabel:
      readString(payload, ["vehicleLabel", "vehicleName", "vehicle"], "Unassigned vehicle") ?? "Unassigned vehicle",
    assignedAt: readString(payload, ["assignedAt", "assigned_at", "updatedAt"], new Date().toISOString()) ?? new Date().toISOString(),
    shiftWindow: readString(payload, ["shiftWindow", "shift_window", "window"], "Active shift") ?? "Active shift",
  };
};

const normalizeJob = (payload: unknown): FieldJob | undefined => {
  if (!isRecord(payload)) {
    return undefined;
  }

  const id = readString(payload, ["id", "jobId", "job_id"]);
  const shipmentId = readString(payload, ["shipmentId", "shipment_id", "reference"]);

  if (!id || !shipmentId) {
    return undefined;
  }

  const type = readEnum(payload, ["type", "jobType", "job_type"], jobTypes, "delivery");
  const workflowStage = readEnum(
    payload,
    ["workflowStage", "workflow_stage", "stage"],
    workflowStages,
    inferStageFromType(type),
  );

  return {
    id,
    shipmentId,
    type,
    workflowStage,
    status: readEnum(payload, ["status", "jobStatus", "job_status"], jobStatuses, "assigned"),
    priority: readEnum(payload, ["priority"], priorities, "normal"),
    routeId: readString(payload, ["routeId", "route_id"]),
    stopId: readString(payload, ["stopId", "stop_id"]),
    address: readString(payload, ["address", "locationAddress", "location_address"], "Address unavailable") ?? "Address unavailable",
    contactName: readString(payload, ["contactName", "contact_name", "recipientName", "recipient_name"]),
    contactPhone: readString(payload, ["contactPhone", "contact_phone", "recipientPhone", "recipient_phone"]),
    instructions: readString(payload, ["instructions", "notes"]),
    timeWindowStart: readString(payload, ["timeWindowStart", "time_window_start", "windowStart", "etaStart"]),
    timeWindowEnd: readString(payload, ["timeWindowEnd", "time_window_end", "windowEnd", "etaEnd"]),
    updatedAt: readString(payload, ["updatedAt", "updated_at", "createdAt"], new Date().toISOString()) ?? new Date().toISOString(),
  };
};

const normalizeVerificationCodes = (payload: Record<string, unknown>) =>
  readArray(payload, ["verificationCodes", "verification_codes", "scanTargets", "scan_targets"])
    .map((item) => {
      if (!isRecord(item)) {
        return undefined;
      }

      const id = readString(item, ["id", "codeId", "code_id"]);

      if (!id) {
        return undefined;
      }

      return {
        id,
        target: readEnum(item, ["target"], verificationTargets, "shipment"),
        label: readString(item, ["label", "name"], "Verification code") ?? "Verification code",
        value: readString(item, ["value", "code"], "") ?? "",
        codeType: readEnum(item, ["codeType", "code_type"], ["qr", "barcode"], "barcode"),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

const normalizeStop = (
  payload: unknown,
  defaults: Partial<Pick<FieldStop, "routeId" | "shipmentId" | "workflowStage" | "type" | "title" | "address">> = {},
): FieldStop | undefined => {
  if (!isRecord(payload)) {
    return undefined;
  }

  const id = readString(payload, ["id", "stopId", "stop_id"]);
  const type = readEnum(payload, ["type", "jobType", "job_type"], jobTypes, defaults.type ?? "delivery");
  const workflowStage = readEnum(
    payload,
    ["workflowStage", "workflow_stage", "stage"],
    workflowStages,
    defaults.workflowStage ?? inferStageFromType(type),
  );

  if (!id) {
    return undefined;
  }

  return {
    id,
    routeId: readString(payload, ["routeId", "route_id"], defaults.routeId ?? "unassigned-route") ?? "unassigned-route",
    shipmentId: readString(payload, ["shipmentId", "shipment_id"], defaults.shipmentId ?? "unknown-shipment") ?? "unknown-shipment",
    sequence: readNumber(payload, ["sequence", "order"], 0) ?? 0,
    type,
    workflowStage,
    title:
      readString(payload, ["title", "label", "name"], defaults.title ?? "Assigned stop") ?? "Assigned stop",
    address:
      readString(payload, ["address", "locationAddress", "location_address"], defaults.address ?? "Address unavailable") ??
      "Address unavailable",
    contactName: readString(payload, ["contactName", "contact_name", "recipientName", "recipient_name"]),
    contactPhone: readString(payload, ["contactPhone", "contact_phone", "recipientPhone", "recipient_phone"]),
    instructions: readString(payload, ["instructions", "notes"]),
    etaLabel: readString(payload, ["etaLabel", "eta", "timeWindowStart", "time_window_start"], "--:--") ?? "--:--",
    packageCount: readNumber(payload, ["packageCount", "package_count", "packages"], 0) ?? 0,
    podRequirements: (() => {
      const requirements = readValue(payload, ["podRequirements", "pod_requirements"]);

      if (!isRecord(requirements)) {
        return undefined;
      }

      return {
        otp: readBoolean(requirements, ["otp"]),
        signature: readBoolean(requirements, ["signature"]),
        photo: readBoolean(requirements, ["photo"]),
        recipientName: readBoolean(requirements, ["recipientName", "recipient_name"]),
      };
    })(),
    verificationCodes: normalizeVerificationCodes(payload),
    status: readEnum(payload, ["status", "stopStatus", "stop_status"], stopStatuses, "assigned"),
    updatedAt: readString(payload, ["updatedAt", "updated_at", "createdAt"], new Date().toISOString()) ?? new Date().toISOString(),
  };
};

const buildFallbackStop = (job: FieldJob): FieldStop => ({
  id: job.stopId ?? `stop-${job.id}`,
  routeId: job.routeId ?? "unassigned-route",
  shipmentId: job.shipmentId,
  sequence: 0,
  type: job.type,
  workflowStage: job.workflowStage,
  title: job.instructions ? job.instructions.split(".")[0] : `${job.type} stop`,
  address: job.address,
  contactName: job.contactName,
  contactPhone: job.contactPhone,
  instructions: job.instructions,
  etaLabel: job.timeWindowStart ?? "--:--",
  packageCount: 0,
  verificationCodes: [],
  status: job.status,
  updatedAt: job.updatedAt,
});

const normalizeSyncResults = (payload: unknown, selected: PendingMutation[]): SyncMutationResult[] => {
  const items = collectItems(payload, ["results", "mutations", "items"]);

  if (items.length === 0) {
    return selected.map((mutation) => ({
      mutationId: mutation.id,
      state: "synced",
    }));
  }

  return items
    .map((item) => {
      if (!isRecord(item)) {
        return undefined;
      }

      const mutationId =
        readString(item, ["mutationId", "mutation_id", "id", "clientMutationId"]) ??
        readString(item, ["eventId", "event_id"]);

      if (!mutationId) {
        return undefined;
      }

      const rawState = readString(item, ["state", "status"], "synced") ?? "synced";
      const normalizedState: PendingMutationState =
        rawState === "pending" || rawState === "syncing" || rawState === "failed" || rawState === "synced"
          ? rawState
          : rawState === "accepted" || rawState === "reconciled" || rawState === "success" || rawState === "ok"
            ? "synced"
            : "failed";

      return {
        mutationId,
        state: normalizedState,
      };
    })
    .filter((item): item is SyncMutationResult => Boolean(item));
};

const resolveJobForMutation = (mutation: PendingMutation, context: SyncBatchContext) => {
  const stopId = typeof mutation.payload.stopId === "string" ? mutation.payload.stopId : undefined;
  const shipmentId = typeof mutation.payload.shipmentId === "string" ? mutation.payload.shipmentId : undefined;

  return (
    context.jobs.find((job) => job.stopId === stopId) ??
    context.jobs.find((job) => job.shipmentId === shipmentId) ??
    context.jobs.find((job) => job.id === mutation.entityId)
  );
};

const resolveStopForMutation = (mutation: PendingMutation, context: SyncBatchContext) => {
  const stopId = typeof mutation.payload.stopId === "string" ? mutation.payload.stopId : undefined;
  return context.stops.find((stop) => stop.id === stopId) ?? context.stops.find((stop) => stop.id === mutation.entityId);
};

const eventTypeByMutationType: Record<PendingMutation["type"], string> = {
  status_update: "field.stop.status_changed",
  pod_upload: "field.proof.submitted",
  location_update: "field.location.updated",
  exception_submit: "field.exception.reported",
  verification_submit: "field.scan.verified",
};

const buildMutationPayload = (mutation: PendingMutation, context: SyncBatchContext) => {
  if (mutation.type === "pod_upload") {
    const draft = context.podDrafts.find((item) => item.id === mutation.entityId);
    return draft ? { ...draft } : { ...mutation.payload };
  }

  if (mutation.type === "verification_submit") {
    const record = context.scanVerifications.find((item) => item.id === mutation.entityId);
    return record ? { ...record } : { ...mutation.payload };
  }

  if (mutation.type === "location_update") {
    const ping = context.locationPings.find((item) => item.id === mutation.entityId);
    return ping ? { ...ping } : { ...mutation.payload };
  }

  return { ...mutation.payload };
};

export const fieldApi = {
  async login(email: string, password: string) {
    const payload = await apiRequest<unknown>("/api/v1/auth/login", {
      method: "POST",
      body: {
        email,
        password,
      },
    });

    const source = isRecord(payload) ? payload : {};
    const accessToken =
      readString(source, ["accessToken", "access_token", "token"]) ??
      (isRecord(source.session)
        ? readString(source.session, ["accessToken", "access_token", "token"])
        : undefined);
    const userPayload = isRecord(source.user) ? source.user : isRecord(source.session) && isRecord(source.session.user) ? source.session.user : payload;

    if (!accessToken) {
      throw new Error("Login succeeded without an access token.");
    }

    return {
      accessToken,
      tenantSlug: readString(source, ["tenantSlug", "tenant_slug"], "system") ?? "system",
      user: normalizeUser(userPayload),
    };
  },

  async requestEmailLink(email: string) {
    return apiRequest<{ linkToken?: string; tenantSlug?: string }>("/api/v1/auth/email-link/request", {
      method: "POST",
      body: { email },
    });
  },

  async consumeEmailLink(email: string, token?: string) {
    const payload = await apiRequest<unknown>("/api/v1/auth/email-link/consume", {
      method: "POST",
      body: token ? { email, token } : { email },
    });

    const source = isRecord(payload) ? payload : {};
    const accessToken =
      readString(source, ["accessToken", "access_token", "token"]) ??
      (isRecord(source.session)
        ? readString(source.session, ["accessToken", "access_token", "token"])
        : undefined);
    const userPayload = isRecord(source.user) ? source.user : isRecord(source.session) && isRecord(source.session.user) ? source.session.user : payload;

    if (!accessToken) {
      throw new Error("Email-link sign-in succeeded without an access token.");
    }

    return {
      accessToken,
      tenantSlug: readString(source, ["tenantSlug", "tenant_slug"], "system") ?? "system",
      user: normalizeUser(userPayload),
    };
  },

  async getMe(token: string) {
    const payload = await apiRequest<unknown>("/api/v1/auth/me", {
      method: "GET",
      token,
    });

    return normalizeUser(isRecord(payload) && isRecord(payload.user) ? payload.user : payload);
  },

  async logout(token: string) {
    await apiRequest("/api/v1/auth/logout", {
      method: "POST",
      token,
    });
  },

  async fetchAssignedWork(token: string): Promise<AssignedWorkload> {
    const [jobsPayload, routesPayload] = await Promise.all([
      apiRequest<unknown>("/api/v1/field/jobs", { method: "GET", token }),
      apiRequest<unknown>("/api/v1/field/routes", { method: "GET", token }),
    ]);

    const jobs = collectItems(jobsPayload, ["jobs", "items"])
      .map(normalizeJob)
      .filter((item): item is FieldJob => Boolean(item));
    const routes = collectItems(routesPayload, ["routes", "items"])
      .map(normalizeRoute)
      .filter((item): item is FieldRoute => Boolean(item));

    const stopIds = Array.from(new Set(jobs.map((job) => job.stopId).filter((value): value is string => Boolean(value))));
    const stopResponses = await Promise.allSettled(
      stopIds.map(async (stopId) => {
        const relatedJob = jobs.find((job) => job.stopId === stopId);
        const payload = await apiRequest<unknown>(`/api/v1/field/stops/${stopId}`, { method: "GET", token });
        const source = isRecord(payload) && isRecord(payload.stop) ? payload.stop : payload;

        return normalizeStop(source, {
          routeId: relatedJob?.routeId,
          shipmentId: relatedJob?.shipmentId,
          workflowStage: relatedJob?.workflowStage,
          type: relatedJob?.type,
          address: relatedJob?.address,
        });
      }),
    );

    const stopMap = new Map<string, FieldStop>();

    stopResponses.forEach((result) => {
      if (result.status === "fulfilled" && result.value) {
        stopMap.set(result.value.id, result.value);
      }
    });

    jobs.forEach((job) => {
      const fallbackStop = buildFallbackStop(job);
      if (!stopMap.has(fallbackStop.id)) {
        stopMap.set(fallbackStop.id, fallbackStop);
      }
    });

    return {
      jobs,
      routes,
      stops: Array.from(stopMap.values()),
    };
  },

  async syncBatch(token: string, selected: PendingMutation[], context: SyncBatchContext): Promise<SyncBatchResult> {
    const payload = await apiRequest<unknown>("/api/v1/field/sync/batch", {
      method: "POST",
      token,
      body: {
        mutations: selected.map((mutation) => {
          const job = resolveJobForMutation(mutation, context);
          const stop = resolveStopForMutation(mutation, context);

          return {
            mutationId: mutation.id,
            eventId: mutation.id,
            eventType: eventTypeByMutationType[mutation.type],
            type: mutation.type,
            tenantId: context.user.tenantId,
            actorId: context.user.id,
            shipmentId:
              typeof mutation.payload.shipmentId === "string"
                ? mutation.payload.shipmentId
                : stop?.shipmentId ?? job?.shipmentId,
            jobId: job?.id,
            stopId: stop?.id ?? (typeof mutation.payload.stopId === "string" ? mutation.payload.stopId : undefined),
            workflowStage: stop?.workflowStage ?? job?.workflowStage,
            occurredAt: mutation.createdAt,
            idempotencyKey: mutation.idempotencyKey,
            payload: buildMutationPayload(mutation, context),
          };
        }),
      },
    });

    return {
      results: normalizeSyncResults(payload, selected),
    };
  },
};
