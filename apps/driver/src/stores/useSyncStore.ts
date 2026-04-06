import { create } from "zustand";

type SyncStoreState = {
  isSyncing: boolean;
  pendingCount: number;
  failedIds: string[];
  setPendingCount: (count: number) => void;
  startSync: () => void;
  stopSync: () => void;
  setFailures: (ids: string[]) => void;
};

export const useSyncStore = create<SyncStoreState>((set) => ({
  isSyncing: false,
  pendingCount: 0,
  failedIds: [],
  setPendingCount: (pendingCount) => set({ pendingCount }),
  startSync: () => set({ isSyncing: true }),
  stopSync: () => set({ isSyncing: false }),
  setFailures: (failedIds) => set({ failedIds })
}));

