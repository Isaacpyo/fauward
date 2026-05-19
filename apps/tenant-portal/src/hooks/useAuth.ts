import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { getAccessToken, getDevTestSession, getDevTestSessionSnapshot } from "@/lib/auth";
import { useAppStore } from "@/stores/useAppStore";
import type { NotificationItem, User } from "@/types/domain";

type AuthPayload = {
  user: User;
  notifications: NotificationItem[];
};

function normalizeUser(value: unknown): User {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid auth payload");
  }
  const raw = value as Partial<User> & {
    sub?: string;
    email?: string;
    role?: User["role"];
    plan?: string;
    mode?: "IMPERSONATION";
    impersonator?: string;
  };
  const plan = String(raw.plan ?? "starter").toLowerCase();
  return {
    ...(raw as User),
    id: raw.id ?? raw.sub ?? "",
    full_name: raw.full_name ?? raw.email ?? "Tenant user",
    email: raw.email ?? "",
    role: raw.role ?? "TENANT_STAFF",
    plan: plan === "pro" || plan === "enterprise" ? plan : "starter",
    impersonated: raw.impersonated ?? raw.mode === "IMPERSONATION",
    mode: raw.mode,
    impersonatorId: raw.impersonatorId ?? raw.impersonator
  };
}

async function fetchAuthContext(): Promise<AuthPayload> {
  const response = await api.get<AuthPayload>("/v1/auth/me");
  const data = response.data as unknown;
  if (
    typeof data !== "object" ||
    data === null ||
    typeof (data as AuthPayload).user !== "object" ||
    (data as AuthPayload).user === null
  ) {
    throw new Error("Invalid auth payload");
  }
  const payload = data as AuthPayload;
  return { ...payload, user: normalizeUser(payload.user) };
}

export function useAuth() {
  const setUser = useAppStore((state) => state.setUser);
  const setNotifications = useAppStore((state) => state.setNotifications);
  const user = useAppStore((state) => state.user);
  const devSessionSnapshot = getDevTestSessionSnapshot();
  const devSession = useMemo(() => getDevTestSession(), [devSessionSnapshot]);

  // Only attempt to fetch auth context when a token is present in storage.
  const hasToken = Boolean(getAccessToken());

  const query = useQuery({
    queryKey: ["auth-context"],
    queryFn: fetchAuthContext,
    staleTime: 45_000,
    retry: 1,
    enabled: hasToken && !devSession
  });

  useEffect(() => {
    if (devSession) {
      setUser(devSession.user);
      setNotifications([]);
      return;
    }

    if (query.data) {
      setUser(query.data.user);
      setNotifications(query.data.notifications ?? []);
    }
  }, [devSession, query.data, setNotifications, setUser]);

  // If auth fetch fails (401 / network error) ensure user is cleared so
  // AuthGuard redirects to /login rather than showing stale state.
  useEffect(() => {
    if (query.isError && !devSession) {
      setUser(null);
      setNotifications([]);
    }
  }, [devSession, query.isError, setNotifications, setUser]);

  return {
    ...query,
    isLoading: devSession ? false : hasToken ? query.isLoading : false,
    user: devSession?.user ?? query.data?.user ?? (hasToken ? user : null),
    notifications: devSession ? [] : query.data?.notifications ?? []
  };
}
