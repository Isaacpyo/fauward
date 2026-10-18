import { useInfiniteQuery } from "@tanstack/react-query";

import { consoleApi } from "@/lib/console-api";

// customer.comms — notification delivery log (WP-2.2). Every row is written by the notification worker (D6).

export type DeliveryStatus = "QUEUED" | "SENT" | "FAILED" | "SKIPPED" | "QUOTA_EXCEEDED";

export type DeliveryLogRow = {
  id: string;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  tenantId: string | null;
  tenant: { id: string; name: string; slug: string } | null;
  audience: "TENANT" | "STAFF";
  userId: string | null;
  platformUserId: string | null;
  channel: "EMAIL" | "SMS";
  event: string;
  template: string | null;
  status: DeliveryStatus;
  provider: string | null;
  attempts: number;
  recipient: string | null;
  providerRef: string | null;
  error: string | null;
};

export type DeliveryLogFilters = { tenantId?: string; status?: DeliveryStatus; channel?: "EMAIL" | "SMS" };

type DeliveryLogPage = { logs: DeliveryLogRow[]; redacted: boolean; nextCursor: string | null };

export const COMMS_KEY = ["customer.comms"] as const;

/** `sensitiveReason` switches to the unredacted view (fresh MFA + reason, audited by the API). */
export function useDeliveryLog(filters: DeliveryLogFilters, sensitiveReason: string | null) {
  return useInfiniteQuery({
    queryKey: [...COMMS_KEY, "delivery-log", filters, sensitiveReason],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      (
        await consoleApi.get<DeliveryLogPage>("/comms/delivery-log", {
          params: { ...filters, limit: 50, ...(pageParam ? { cursor: pageParam } : {}), ...(sensitiveReason ? { sensitive: "true", reason: sensitiveReason } : {}) }
        })
      ).data,
    getNextPageParam: (last) => last.nextCursor
  });
}
