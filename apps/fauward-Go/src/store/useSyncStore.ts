import { create } from "zustand";

type SyncStore = {
  browserOnline: boolean;
  manualOffline: boolean;
  isOnline: boolean;
  isSyncing: boolean;
  activeBatchSize: number;
  lastSyncAt?: string;
  setBrowserOnline: (browserOnline: boolean) => void;
  toggleManualOffline: () => void;
  startSync: (batchSize: number) => void;
  finishSync: (completedAt: string) => void;
  reset: () => void;
};

const deriveIsOnline = (browserOnline: boolean, manualOffline: boolean) => browserOnline && !manualOffline;

export const useSyncStore = create<SyncStore>((set) => ({
  browserOnline: true,
  manualOffline: false,
  isOnline: true,
  isSyncing: false,
  activeBatchSize: 0,
  lastSyncAt: undefined,
  setBrowserOnline: (browserOnline) =>
    set((state) => ({
      browserOnline,
      isOnline: deriveIsOnline(browserOnline, state.manualOffline),
    })),
  toggleManualOffline: () =>
    set((state) => {
      const manualOffline = !state.manualOffline;

      return {
        manualOffline,
        isOnline: deriveIsOnline(state.browserOnline, manualOffline),
      };
    }),
  startSync: (activeBatchSize) => set({ isSyncing: true, activeBatchSize }),
  finishSync: (lastSyncAt) =>
    set({
      isSyncing: false,
      activeBatchSize: 0,
      lastSyncAt,
    }),
  reset: () =>
    set({
      browserOnline: true,
      manualOffline: false,
      isOnline: true,
      isSyncing: false,
      activeBatchSize: 0,
      lastSyncAt: undefined,
    }),
}));

