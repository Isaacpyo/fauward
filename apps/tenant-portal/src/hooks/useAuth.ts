import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { useAppStore } from "@/stores/useAppStore";
import type { NotificationItem, User } from "@/types/domain";

type AuthPayload = {
  user: User;
  notifications: NotificationItem[];
};

const fallbackUser: User = {
  id: "u_demo",
  full_name: "Alex Johnson",
  email: "alex@demo-logistics.com",
  role: "TENANT_ADMIN",
  plan: "pro",
  impersonated: false
};

const fallbackNotifications: NotificationItem[] = [
  {
    id: "n-1",
    title: "Shipment SLA warning",
    body: "4 shipments are approaching SLA threshold.",
    read: false,
    created_at: new Date().toISOString(),
    href: "/shipments"
  },
  {
    id: "n-2",
    title: "Invoice paid",
    body: "Invoice INV-1055 was marked as paid.",
    read: true,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    href: "/finance/INV-1055"
  }
];

async function fetchAuthContext(): Promise<AuthPayload> {
  const response = await api.get<AuthPayload>("/auth/me");
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

  const query = useQuery({
    queryKey: ["auth-context"],
    queryFn: fetchAuthContext,
    staleTime: 45_000,
    retry: 1
  });

  useEffect(() => {
    if (query.data) {
      setUser(query.data.user);
      setNotifications(query.data.notifications);
      return;
    }

    if (query.isError && !user) {
      setUser(fallbackUser);
      setNotifications(fallbackNotifications);
    }
  }, [query.data, query.isError, setNotifications, setUser, user]);

  useEffect(() => {
    if (!query.isLoading || query.data || user) {
      return;
    }

    const timer = window.setTimeout(() => {
      setUser(fallbackUser);
      setNotifications(fallbackNotifications);
    }, 1500);

    return () => window.clearTimeout(timer);
  }, [query.data, query.isLoading, setNotifications, setUser, user]);

  return {
    ...query,
    user: query.data?.user ?? user,
    notifications: query.data?.notifications ?? fallbackNotifications
  };
}
