import { Navigate, useLocation } from "react-router-dom";

import { agentPath } from "@/lib/agentPaths";
import { useAgentAuth } from "@/context/AgentAuthContext";
import { AccessPending } from "@/components/agent/AccessPending";

export function AgentGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { authReady, isAuthenticated, isRoleAllowed, logout, session } = useAgentAuth();

  if (!authReady) {
    return (
      <div className="rounded-xl border border-[var(--border-color)] bg-white p-6 text-center text-sm text-gray-600">
        Preparing workspace...
      </div>
    );
  }

  if (!isAuthenticated) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`${agentPath("login")}?next=${next}`} replace />;
  }

  if (!isRoleAllowed) {
    return <AccessPending email={session?.user.email} onLogout={logout} />;
  }

  return <>{children}</>;
}