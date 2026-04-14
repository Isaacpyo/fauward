import { Navigate, Route, Routes } from "react-router-dom";

import { AgentGate } from "@/components/agent/AgentGate";
import { AgentLayout } from "@/components/agent/AgentLayout";
import { agentPath } from "@/lib/agentPaths";
import { ConfirmPage } from "@/pages/ConfirmPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { LoginPage } from "@/pages/LoginPage";
import { ScanPage } from "@/pages/ScanPage";
import { ShipmentPage } from "@/pages/ShipmentPage";
import { ShipmentsPage } from "@/pages/ShipmentsPage";
import { WelcomePage } from "@/pages/WelcomePage";

function ProtectedLayout() {
  return (
    <AgentGate>
      <AgentLayout />
    </AgentGate>
  );
}

function DashboardDefault() {
  return <Navigate to={agentPath("dashboard")} replace />;
}

export function AppRouter() {
  return (
    <Routes>
      <Route path={agentPath()} element={<WelcomePage />} />
      <Route path={agentPath("login")} element={<LoginPage />} />

      <Route element={<ProtectedLayout />}>
        <Route path={agentPath("dashboard")} element={<DashboardPage />} />
        <Route path={agentPath("scan")} element={<ScanPage />} />
        <Route path={agentPath("shipments")} element={<ShipmentsPage />} />
        <Route path={agentPath("shipment/:ref")} element={<ShipmentPage />} />
        <Route path={agentPath("shipment/:ref/confirm")} element={<ConfirmPage />} />
      </Route>

      <Route path="*" element={<DashboardDefault />} />
    </Routes>
  );
}
