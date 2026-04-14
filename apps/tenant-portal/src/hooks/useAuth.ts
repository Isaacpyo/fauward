import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { useAppStore } from "@/stores/useAppStore";
import type { NotificationItem, User } from "@/types/domain";

type AuthPayload = {
  user: User;
  notifications: NotificationItem[];
};

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
  return data as AuthPayload;
}

export function useAuth() {
  const setUser = useAppStore((state) => state.setUser);
  const setNotifications = useAppStore((state) => state.setNotifications);
  const user = useAppStore((state) => state.user);

  // Only attempt to fetch auth context when a token is present in storage.
  const hasToken = Boolean(getAccessToken());

  const query = useQuery({
    queryKey: ["auth-context"],
    queryFn: fetchAuthContext,
    staleTime: 45_000,
    retry: 1,
    enabled: hasToken
  });

  useEffect(() => {
    if (query.data) {
      setUser(query.data.user);
      setNotifications(query.data.notifications ?? []);
    }
  }, [query.data, setNotifications, setUser]);

  // If auth fetch fails (401 / network error) ensure user is cleared so
  // AuthGuard redirects to /login rather than showing stale state.
  useEffect(() => {
    if (query.isError) {
      setUser(null);
      setNotifications([]);
    }
  }, [query.isError, setNotifications, setUser]);

  return {
    ...query,
    isLoading: hasToken ? query.isLoading : false,
    user: query.data?.user ?? (hasToken ? user : null),
    notifications: query.data?.notifications ?? []
  };
}
