import { afterEach, describe, expect, it } from "vitest";
import { useSyncStore } from "@/store/useSyncStore";

describe("useSyncStore", () => {
  afterEach(() => {
    useSyncStore.getState().reset();
  });

  it("derives online state from browser and manual offline flags", () => {
    useSyncStore.getState().setBrowserOnline(false);

    expect(useSyncStore.getState()).toMatchObject({
      browserOnline: false,
      manualOffline: false,
      isOnline: false,
    });

    useSyncStore.getState().setBrowserOnline(true);
    useSyncStore.getState().toggleManualOffline();

    expect(useSyncStore.getState()).toMatchObject({
      browserOnline: true,
      manualOffline: true,
      isOnline: false,
    });

    useSyncStore.getState().toggleManualOffline();

    expect(useSyncStore.getState()).toMatchObject({
      browserOnline: true,
      manualOffline: false,
      isOnline: true,
    });
  });

  it("tracks sync lifecycle details", () => {
    useSyncStore.getState().startSync(12);

    expect(useSyncStore.getState()).toMatchObject({
      isSyncing: true,
      activeBatchSize: 12,
    });

    useSyncStore.getState().finishSync("2026-04-19T12:00:00.000Z");

    expect(useSyncStore.getState()).toMatchObject({
      isSyncing: false,
      activeBatchSize: 0,
      lastSyncAt: "2026-04-19T12:00:00.000Z",
    });
  });

  it("resets to the initial sync state", () => {
    useSyncStore.getState().setBrowserOnline(false);
    useSyncStore.getState().startSync(5);
    useSyncStore.getState().finishSync("2026-04-19T12:00:00.000Z");

    useSyncStore.getState().reset();

    expect(useSyncStore.getState()).toMatchObject({
      browserOnline: true,
      manualOffline: false,
      isOnline: true,
      isSyncing: false,
      activeBatchSize: 0,
      lastSyncAt: undefined,
    });
  });
});
