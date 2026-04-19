import { useEffect, type ComponentProps } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { appEnv } from "@/lib/config/env";
import { useAuthStore } from "@/store/useAuthStore";
import { useFieldDataStore } from "@/store/useFieldDataStore";
import { useSyncStore } from "@/store/useSyncStore";

type AppProvidersProps = {
  router: ComponentProps<typeof RouterProvider>["router"];
};

const queryClient = new QueryClient();

export const AppProviders = ({ router }: AppProvidersProps) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const seedDemoData = useFieldDataStore((state) => state.seedDemoData);
  const syncPendingMutations = useFieldDataStore((state) => state.syncPendingMutations);
  const pendingCount = useFieldDataStore(
    (state) => state.pendingMutations.filter((mutation) => mutation.state !== "synced").length,
  );
  const setBrowserOnline = useSyncStore((state) => state.setBrowserOnline);
  const isOnline = useSyncStore((state) => state.isOnline);
  const isSyncing = useSyncStore((state) => state.isSyncing);

  useEffect(() => {
    if (isAuthenticated) {
      seedDemoData();
    }
  }, [isAuthenticated, seedDemoData]);

  useEffect(() => {
    const syncConnectivity = () => setBrowserOnline(window.navigator.onLine);

    syncConnectivity();
    window.addEventListener("online", syncConnectivity);
    window.addEventListener("offline", syncConnectivity);

    return () => {
      window.removeEventListener("online", syncConnectivity);
      window.removeEventListener("offline", syncConnectivity);
    };
  }, [setBrowserOnline]);

  useEffect(() => {
    if (!appEnv.enableBackgroundSync || !isAuthenticated || !isOnline || isSyncing || pendingCount === 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      void syncPendingMutations();
    }, 1200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isAuthenticated, isOnline, isSyncing, pendingCount, syncPendingMutations]);

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
};

