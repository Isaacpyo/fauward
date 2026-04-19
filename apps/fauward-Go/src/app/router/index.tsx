import { createBrowserRouter } from "react-router-dom";
import { RequireAuth } from "@/app/guards/RequireAuth";
import { AppShell } from "@/app/shell/AppShell";
import { LoginScreen } from "@/features/auth/LoginScreen";
import { HomeScreen } from "@/features/home/HomeScreen";
import { JobsScreen } from "@/features/jobs/JobsScreen";
import { NotFoundScreen } from "@/features/not-found/NotFoundScreen";
import { PodCaptureScreen } from "@/features/pod/PodCaptureScreen";
import { RouteDetailScreen } from "@/features/routes/RouteDetailScreen";
import { SettingsScreen } from "@/features/settings/SettingsScreen";
import { StopDetailScreen } from "@/features/stops/StopDetailScreen";
import { SupportScreen } from "@/features/support/SupportScreen";
import { SyncStatusScreen } from "@/features/sync/SyncStatusScreen";
import { ScanVerifyScreen } from "@/features/verify/ScanVerifyScreen";
import { LocationScreen } from "@/features/location/LocationScreen";

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginScreen />,
  },
  {
    path: "/",
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      {
        index: true,
        element: <HomeScreen />,
      },
      {
        path: "home",
        element: <HomeScreen />,
      },
      {
        path: "jobs",
        element: <JobsScreen />,
      },
      {
        path: "routes/:routeId",
        element: <RouteDetailScreen />,
      },
      {
        path: "stops/:stopId",
        element: <StopDetailScreen />,
      },
      {
        path: "stops/:stopId/pod",
        element: <PodCaptureScreen />,
      },
      {
        path: "verify",
        element: <ScanVerifyScreen />,
      },
      {
        path: "location",
        element: <LocationScreen />,
      },
      {
        path: "sync",
        element: <SyncStatusScreen />,
      },
      {
        path: "settings",
        element: <SettingsScreen />,
      },
      {
        path: "support",
        element: <SupportScreen />,
      },
      {
        path: "*",
        element: <NotFoundScreen />,
      },
    ],
  },
]);
