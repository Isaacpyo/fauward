import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { appEnv } from "@/lib/config/env";
import { createSeededFieldData } from "@/features/jobs/demoFieldData";
import { useSyncStore } from "@/store/useSyncStore";
import type {
  FieldJob,
  FieldRoute,
  FieldStop,
  LocationPing,
  PendingMutation,
  PodDraft,
  ScanVerificationRecord,
  StopStatus,
  VerificationTarget,
} from "@/types/field";

type PodDraftUpdate = Pick<
  PodDraft,
  "otpCode" | "recipientName" | "signatureRef" | "photoRefs" | "notes" | "lat" | "lng"
> & {
  state?: PodDraft["state"];
};

type ScanVerificationInput = {
  stopId?: string;
  target: VerificationTarget;
  scannedValue: string;
  codeType: "qr" | "barcode";
};

type LocationPingInput = Pick<LocationPing, "lat" | "lng" | "accuracy" | "source" | "stopId">;

type FieldDataStore = {
  jobs: FieldJob[];
  routes: FieldRoute[];
  stops: FieldStop[];
  pendingMutations: PendingMutation[];
  podDrafts: PodDraft[];
  scanVerifications: ScanVerificationRecord[];
  locationPings: LocationPing[];
  seedDemoData: () => void;
  resetFieldData: () => void;
  advanceStopStatus: (stopId: string, nextStatus: StopStatus) => void;
  savePodDraft: (stopId: string, draft: PodDraftUpdate) => void;
  submitPodForStop: (stopId: string, draft: PodDraftUpdate) => boolean;
  recordScanVerification: (input: ScanVerificationInput) => ScanVerificationRecord | undefined;
  addLocationPing: (input: LocationPingInput) => void;
  syncPendingMutations: () => Promise<void>;
  clearSyncedMutations: () => void;
};

const mapStopStatusToJobStatus = (status: StopStatus): FieldJob["status"] => {
  return status;
};

const pause = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const normalizeCode = (value: string) => value.replace(/\s+/g, "").toUpperCase();

const emptyFieldData = {
  jobs: [] as FieldJob[],
  routes: [] as FieldRoute[],
  stops: [] as FieldStop[],
  pendingMutations: [] as PendingMutation[],
  podDrafts: [] as PodDraft[],
  scanVerifications: [] as ScanVerificationRecord[],
  locationPings: [] as LocationPing[],
};

export const useFieldDataStore = create<FieldDataStore>()(
  persist(
    (set, get) => ({
      ...emptyFieldData,
      seedDemoData: () => {
        if (get().jobs.length > 0) {
          return;
        }

        set(createSeededFieldData());
      },
      resetFieldData: () => set(emptyFieldData),
      advanceStopStatus: (stopId, nextStatus) => {
        const existingStop = get().stops.find((stop) => stop.id === stopId);

        if (!existingStop) {
          return;
        }

        const timestamp = new Date().toISOString();
        const mutationType =
          nextStatus === "failed" || nextStatus === "exception" ? "exception_submit" : "status_update";

        set((state) => ({
          stops: state.stops.map((stop) =>
            stop.id === stopId ? { ...stop, status: nextStatus, updatedAt: timestamp } : stop,
          ),
          jobs: state.jobs.map((job) =>
            job.stopId === stopId
              ? {
                  ...job,
                  status: mapStopStatusToJobStatus(nextStatus),
                  updatedAt: timestamp,
                }
              : job,
          ),
          pendingMutations: [
            {
              id: crypto.randomUUID(),
              type: mutationType,
              entityId: stopId,
              payload: {
                stopId,
                shipmentId: existingStop.shipmentId,
                status: nextStatus,
              },
              createdAt: timestamp,
              retryCount: 0,
              idempotencyKey: crypto.randomUUID(),
              state: "pending",
            },
            ...state.pendingMutations,
          ],
        }));
      },
      savePodDraft: (stopId, draft) => {
        const stop = get().stops.find((item) => item.id === stopId);

        if (!stop) {
          return;
        }

        const existingDraft = get().podDrafts.find((item) => item.stopId === stopId);
        const timestamp = new Date().toISOString();

        set((state) => ({
          podDrafts: existingDraft
            ? state.podDrafts.map((item) =>
                item.id === existingDraft.id
                  ? {
                      ...item,
                      ...draft,
                      photoRefs: draft.photoRefs ?? item.photoRefs ?? [],
                      state: draft.state ?? item.state,
                    }
                  : item,
              )
            : [
                {
                  id: crypto.randomUUID(),
                  shipmentId: stop.shipmentId,
                  stopId,
                  deliveredAt: undefined,
                  photoRefs: draft.photoRefs ?? [],
                  state: draft.state ?? "draft",
                  ...draft,
                },
                ...state.podDrafts,
              ],
          pendingMutations: state.pendingMutations,
          jobs: state.jobs,
          routes: state.routes,
          stops: state.stops,
          scanVerifications: state.scanVerifications,
          locationPings: state.locationPings,
        }));

        set((state) => ({
          podDrafts: state.podDrafts.map((item) =>
            item.stopId === stopId
              ? {
                  ...item,
                  notes: draft.notes ?? item.notes,
                  deliveredAt: item.deliveredAt ?? timestamp,
                }
              : item,
          ),
        }));
      },
      submitPodForStop: (stopId, draft) => {
        const stop = get().stops.find((item) => item.id === stopId);
        const relatedJob = get().jobs.find((job) => job.stopId === stopId);

        if (!stop || !stop.podRequirements || !relatedJob) {
          return false;
        }

        const timestamp = new Date().toISOString();
        const existingDraft = get().podDrafts.find((item) => item.stopId === stopId);
        const draftId = existingDraft?.id ?? crypto.randomUUID();

        set((state) => ({
          stops: state.stops.map((item) =>
            item.id === stopId ? { ...item, status: "completed", updatedAt: timestamp } : item,
          ),
          jobs: state.jobs.map((job) =>
            job.stopId === stopId ? { ...job, status: "completed", updatedAt: timestamp } : job,
          ),
          podDrafts: state.podDrafts.some((item) => item.id === draftId)
            ? state.podDrafts.map((item) =>
                item.id === draftId
                  ? {
                      ...item,
                      ...draft,
                      photoRefs: draft.photoRefs ?? item.photoRefs ?? [],
                      deliveredAt: timestamp,
                      state: "ready",
                    }
                  : item,
              )
            : [
                {
                  id: draftId,
                  shipmentId: relatedJob.shipmentId,
                  stopId,
                  deliveredAt: timestamp,
                  photoRefs: draft.photoRefs ?? [],
                  state: "ready",
                  ...draft,
                },
                ...state.podDrafts,
              ],
          pendingMutations: [
            {
              id: crypto.randomUUID(),
              type: "pod_upload",
              entityId: draftId,
              payload: {
                stopId,
                shipmentId: relatedJob.shipmentId,
                recipientName: draft.recipientName ?? "",
                otpCode: draft.otpCode ?? "",
                photoCount: draft.photoRefs?.length ?? 0,
                hasSignature: Boolean(draft.signatureRef),
              },
              createdAt: timestamp,
              retryCount: 0,
              idempotencyKey: crypto.randomUUID(),
              state: "pending",
            },
            {
              id: crypto.randomUUID(),
              type: "status_update",
              entityId: stopId,
              payload: {
                stopId,
                shipmentId: relatedJob.shipmentId,
                status: "completed",
              },
              createdAt: timestamp,
              retryCount: 0,
              idempotencyKey: crypto.randomUUID(),
              state: "pending",
            },
            ...state.pendingMutations,
          ],
        }));

        return true;
      },
      recordScanVerification: (input) => {
        const stop = input.stopId ? get().stops.find((item) => item.id === input.stopId) : undefined;
        const expectedCode = stop?.verificationCodes.find((item) => item.target === input.target);
        const record: ScanVerificationRecord = {
          id: crypto.randomUUID(),
          shipmentId: stop?.shipmentId,
          stopId: input.stopId,
          target: input.target,
          expectedValue: expectedCode?.value,
          codeType: input.codeType,
          scannedValue: input.scannedValue,
          result: expectedCode
            ? normalizeCode(expectedCode.value) === normalizeCode(input.scannedValue)
              ? "matched"
              : "mismatch"
            : "unknown",
          createdAt: new Date().toISOString(),
          synced: false,
        };

        set((state) => ({
          scanVerifications: [record, ...state.scanVerifications],
          pendingMutations: [
            {
              id: crypto.randomUUID(),
              type: "verification_submit",
              entityId: record.id,
              payload: {
                stopId: input.stopId,
                target: input.target,
                scannedValue: input.scannedValue,
                result: record.result,
              },
              createdAt: record.createdAt,
              retryCount: 0,
              idempotencyKey: crypto.randomUUID(),
              state: "pending",
            },
            ...state.pendingMutations,
          ],
        }));

        return record;
      },
      addLocationPing: (input) => {
        const ping: LocationPing = {
          id: crypto.randomUUID(),
          lat: input.lat,
          lng: input.lng,
          accuracy: input.accuracy,
          source: input.source,
          stopId: input.stopId,
          createdAt: new Date().toISOString(),
          synced: false,
        };

        set((state) => ({
          locationPings: [ping, ...state.locationPings],
          pendingMutations: [
            {
              id: crypto.randomUUID(),
              type: "location_update",
              entityId: ping.id,
              payload: {
                stopId: input.stopId,
                lat: input.lat,
                lng: input.lng,
                accuracy: input.accuracy,
              },
              createdAt: ping.createdAt,
              retryCount: 0,
              idempotencyKey: crypto.randomUUID(),
              state: "pending",
            },
            ...state.pendingMutations,
          ],
        }));
      },
      syncPendingMutations: async () => {
        if (!useSyncStore.getState().isOnline || useSyncStore.getState().isSyncing) {
          return;
        }

        const queue = get().pendingMutations.filter((mutation) => mutation.state !== "synced");
        const selected = queue.slice(0, appEnv.syncBatchSize);
        const selectedIds = selected.map((mutation) => mutation.id);

        if (selectedIds.length === 0) {
          return;
        }

        useSyncStore.getState().startSync(selectedIds.length);

        set((state) => ({
          pendingMutations: state.pendingMutations.map((mutation) =>
            selectedIds.includes(mutation.id) ? { ...mutation, state: "syncing" } : mutation,
          ),
        }));

        await pause(900);

        const syncedPodDraftIds = selected
          .filter((mutation) => mutation.type === "pod_upload")
          .map((mutation) => mutation.entityId);
        const syncedVerificationIds = selected
          .filter((mutation) => mutation.type === "verification_submit")
          .map((mutation) => mutation.entityId);
        const syncedLocationIds = selected
          .filter((mutation) => mutation.type === "location_update")
          .map((mutation) => mutation.entityId);

        set((state) => ({
          pendingMutations: state.pendingMutations.map((mutation) =>
            selectedIds.includes(mutation.id)
              ? { ...mutation, state: "synced", retryCount: mutation.retryCount + 1 }
              : mutation,
          ),
          podDrafts: state.podDrafts.map((draft) =>
            syncedPodDraftIds.includes(draft.id) ? { ...draft, state: "uploaded" } : draft,
          ),
          scanVerifications: state.scanVerifications.map((record) =>
            syncedVerificationIds.includes(record.id) ? { ...record, synced: true } : record,
          ),
          locationPings: state.locationPings.map((ping) =>
            syncedLocationIds.includes(ping.id) ? { ...ping, synced: true } : ping,
          ),
        }));

        useSyncStore.getState().finishSync(new Date().toISOString());
      },
      clearSyncedMutations: () =>
        set((state) => ({
          pendingMutations: state.pendingMutations.filter((mutation) => mutation.state !== "synced"),
        })),
    }),
    {
      name: "fauward-go-field-data-v3",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
