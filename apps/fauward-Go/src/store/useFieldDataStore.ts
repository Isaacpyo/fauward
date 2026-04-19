import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { appEnv } from "@/lib/config/env";
import { fieldApi } from "@/lib/api/fieldApi";
import { ApiError } from "@/lib/api/http";
import { useAuthStore } from "@/store/useAuthStore";
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
  isHydrating: boolean;
  hydrateError?: string;
  hydrateAssignedWork: () => Promise<void>;
  resetFieldData: () => void;
  advanceStopStatus: (stopId: string, nextStatus: StopStatus) => void;
  savePodDraft: (stopId: string, draft: PodDraftUpdate) => void;
  submitPodForStop: (stopId: string, draft: PodDraftUpdate) => boolean;
  recordScanVerification: (input: ScanVerificationInput) => ScanVerificationRecord | undefined;
  addLocationPing: (input: LocationPingInput) => void;
  syncPendingMutations: () => Promise<void>;
  clearSyncedMutations: () => void;
};

const mapStopStatusToJobStatus = (status: StopStatus): FieldJob["status"] => status;

const normalizeCode = (value: string) => value.replace(/\s+/g, "").toUpperCase();

const emptyFieldData = {
  jobs: [] as FieldJob[],
  routes: [] as FieldRoute[],
  stops: [] as FieldStop[],
  pendingMutations: [] as PendingMutation[],
  podDrafts: [] as PodDraft[],
  scanVerifications: [] as ScanVerificationRecord[],
  locationPings: [] as LocationPing[],
  isHydrating: false,
  hydrateError: undefined,
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message;
  }

  return fallback;
};

const applyPendingMutations = (
  jobs: FieldJob[],
  stops: FieldStop[],
  pendingMutations: PendingMutation[],
) => {
  const pendingByTime = [...pendingMutations]
    .filter((mutation) => mutation.state !== "synced")
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

  let nextJobs = jobs;
  let nextStops = stops;

  for (const mutation of pendingByTime) {
    if (mutation.type !== "status_update" && mutation.type !== "exception_submit" && mutation.type !== "pod_upload") {
      continue;
    }

    const stopId = typeof mutation.payload.stopId === "string" ? mutation.payload.stopId : undefined;
    const nextStatus =
      mutation.type === "pod_upload"
        ? "completed"
        : typeof mutation.payload.status === "string"
          ? (mutation.payload.status as StopStatus)
          : undefined;

    if (!stopId || !nextStatus) {
      continue;
    }

    nextStops = nextStops.map((stop) =>
      stop.id === stopId
        ? {
            ...stop,
            status: nextStatus,
            updatedAt: mutation.createdAt,
          }
        : stop,
    );

    nextJobs = nextJobs.map((job) =>
      job.stopId === stopId
        ? {
            ...job,
            status: mapStopStatusToJobStatus(nextStatus),
            updatedAt: mutation.createdAt,
          }
        : job,
    );
  }

  return {
    jobs: nextJobs,
    stops: nextStops,
  };
};

export const useFieldDataStore = create<FieldDataStore>()(
  persist(
    (set, get) => ({
      ...emptyFieldData,
      hydrateAssignedWork: async () => {
        const accessToken = useAuthStore.getState().accessToken;

        if (!accessToken) {
          return;
        }

        set({
          isHydrating: true,
          hydrateError: undefined,
        });

        try {
          const workload = await fieldApi.fetchAssignedWork(accessToken);
          const reconciled = applyPendingMutations(workload.jobs, workload.stops, get().pendingMutations);

          set((state) => ({
            jobs: reconciled.jobs,
            routes: workload.routes,
            stops: reconciled.stops,
            podDrafts: state.podDrafts,
            pendingMutations: state.pendingMutations,
            scanVerifications: state.scanVerifications,
            locationPings: state.locationPings,
            isHydrating: false,
            hydrateError: undefined,
          }));
        } catch (error) {
          set({
            isHydrating: false,
            hydrateError: getErrorMessage(error, "Unable to load assigned work."),
          });
        }
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
        const syncState = useSyncStore.getState();
        const authState = useAuthStore.getState();

        if (!syncState.isOnline || syncState.isSyncing || !authState.accessToken || !authState.user) {
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

        try {
          const result = await fieldApi.syncBatch(authState.accessToken, selected, {
            user: authState.user,
            jobs: get().jobs,
            routes: get().routes,
            stops: get().stops,
            podDrafts: get().podDrafts,
            scanVerifications: get().scanVerifications,
            locationPings: get().locationPings,
          });

          const syncedIds = result.results
            .filter((item) => item.state === "synced")
            .map((item) => item.mutationId);
          const failedIds = result.results
            .filter((item) => item.state === "failed")
            .map((item) => item.mutationId);

          const syncedPodDraftIds = selected
            .filter((mutation) => mutation.type === "pod_upload" && syncedIds.includes(mutation.id))
            .map((mutation) => mutation.entityId);
          const syncedVerificationIds = selected
            .filter((mutation) => mutation.type === "verification_submit" && syncedIds.includes(mutation.id))
            .map((mutation) => mutation.entityId);
          const syncedLocationIds = selected
            .filter((mutation) => mutation.type === "location_update" && syncedIds.includes(mutation.id))
            .map((mutation) => mutation.entityId);

          set((state) => ({
            pendingMutations: state.pendingMutations.map((mutation) => {
              if (syncedIds.includes(mutation.id)) {
                return { ...mutation, state: "synced", retryCount: mutation.retryCount + 1 };
              }

              if (failedIds.includes(mutation.id)) {
                return { ...mutation, state: "failed", retryCount: mutation.retryCount + 1 };
              }

              return mutation;
            }),
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

          if (syncedIds.length > 0) {
            await get().hydrateAssignedWork();
          }
        } catch (error) {
          set((state) => ({
            pendingMutations: state.pendingMutations.map((mutation) =>
              selectedIds.includes(mutation.id)
                ? { ...mutation, state: "failed", retryCount: mutation.retryCount + 1 }
                : mutation,
            ),
            hydrateError: getErrorMessage(error, "Unable to sync queued updates."),
          }));

          useSyncStore.getState().finishSync(new Date().toISOString());
        }
      },
      clearSyncedMutations: () =>
        set((state) => ({
          pendingMutations: state.pendingMutations.filter((mutation) => mutation.state !== "synced"),
        })),
    }),
    {
      name: "fauward-go-field-data-v4",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
