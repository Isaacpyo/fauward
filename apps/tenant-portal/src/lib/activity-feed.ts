import { api } from "@/lib/api";

export type ActivityEntryType = "shipment" | "return" | "ticket" | "invoice" | "audit";

export type ActivityEntry = {
  id: string;
  type: ActivityEntryType;
  title: string;
  subtitle: string;
  link: string;
  timestamp: string;
  /** Lucide icon name returned by the backend (e.g. "truck", "shield"). */
  icon: string;
  /** Tailwind colour name returned by the backend (e.g. "blue", "emerald"). */
  colour: string;
};

export type ActivityTimeframe = "1h" | "24h" | "7d" | "30d";

/**
 * Hits GET /v1/activity?timeframe=&type= which unions ShipmentEvent +
 * AuditLog + ReturnRequest + TicketMessage + Invoice into a single
 * newest-first feed of ActivityEntry rows (tenant-scoped server-side).
 *
 * Pass `type === "all"` (or omit it) to fetch every source.
 */
export async function fetchActivity(
  timeframe: ActivityTimeframe = "24h",
  type: "all" | ActivityEntryType = "all"
): Promise<ActivityEntry[]> {
  const query = new URLSearchParams();
  query.set("timeframe", timeframe);
  if (type !== "all") query.set("type", type);
  const response = await api.get<{ entries: ActivityEntry[] }>(`/v1/activity?${query.toString()}`);
  return response.data.entries ?? [];
}
