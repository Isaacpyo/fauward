import { create } from "zustand";
import { persist } from "zustand/middleware";

export type OfflineActionType = "pod_upload" | "failed_delivery" | "status_update";

export type OfflineQueueItem = {
  id: string;
  type: OfflineActionType;
  payload: Record<string, unknown>;
  createdAt: string;
  retries: number;
  failed?: boolean;
};

type OfflineQueueState = {
  queue: OfflineQueueItem[];
  enqueue: (type: OfflineActionType, payload: Record<string, unknown>) => void;
  dequeue: (id: string) => void;
  markFailed: (id: string) => void;
  clearQueue: () => void;
};

export const useOfflineQueue = create<OfflineQueueState>()(
  persist(
    (set) => ({
      queue: [],
      enqueue: (type, payload) =>
        set((state) => ({
          queue: [
            ...state.queue,
            {
              id: crypto.randomUUID(),
              type,
              payload,
              createdAt: new Date().toISOString(),
              retries: 0
            }
          ]
        })),
      dequeue: (id) => set((state) => ({ queue: state.queue.filter((item) => item.id !== id) })),
      markFailed: (id) =>
        set((state) => ({
          queue: state.queue.map((item) =>
            item.id === id ? { ...item, failed: true, retries: item.retries + 1 } : item
          )
        })),
      clearQueue: () => set({ queue: [] })
    }),
    { name: "fauward-driver-offline-queue" }
  )
);

