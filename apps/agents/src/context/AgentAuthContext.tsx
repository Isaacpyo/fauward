import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { ApiError, apiRequest, publicRequest } from "@/lib/api";
import { buildSession, clearSession, isAgentRoleAllowed, loadSession, saveSession, type AgentSession } from "@/lib/session";

type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  tenantSlug: string;
  tenantId: string;
};

type AgentAuthContextValue = {
  session: AgentSession | null;
  authReady: boolean;
  isAuthenticated: boolean;
  isRoleAllowed: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
};

const AgentAuthContext = createContext<AgentAuthContextValue | null>(null);

export function AgentAuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AgentSession | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const existing = loadSession();
    setSession(existing);
    setAuthReady(true);

    if (!existing) return;

    apiRequest<{ user?: unknown }>("/auth/me")
      .then(() => undefined)
      .catch(() => {
        clearSession();
        setSession(null);
      });
  }, []);

  async function login(email: string, password: string) {
    const payload = await publicRequest<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });

    const next = buildSession(payload);
    if (!next) {
      throw new ApiError("Invalid auth payload", 500);
    }

    saveSession(next);
    setSession(next);
  }

  function logout() {
    clearSession();
    setSession(null);
  }

  async function refreshProfile() {
    if (!session) return;

    try {
      await apiRequest<{ user?: unknown }>("/auth/me");
      const latest = loadSession();
      setSession(latest);
    } catch {
      clearSession();
      setSession(null);
    }
  }

  const value = useMemo<AgentAuthContextValue>(
    () => ({
      session,
      authReady,
      isAuthenticated: Boolean(session),
      isRoleAllowed: Boolean(session?.user?.role && isAgentRoleAllowed(session.user.role)),
      login,
      logout,
      refreshProfile
    }),
    [session, authReady]
  );

  return <AgentAuthContext.Provider value={value}>{children}</AgentAuthContext.Provider>;
}

export function useAgentAuth() {
  const value = useContext(AgentAuthContext);
  if (!value) throw new Error("useAgentAuth must be used within AgentAuthProvider");
  return value;
}