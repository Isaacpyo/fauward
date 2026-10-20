import { useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import type { ActivityFilters, ActivityPage, ActivityRow } from "@/lib/activity";
import { BADGES_KEY } from "@/lib/badges";
import { refreshSession } from "@/lib/console-api";
import { ACTIVITY_SUMMARY_KEY, OVERVIEW_KEY } from "@/lib/overview";

// Live console activity (D7 read side, WP-3.5): one EventSource per tab on GET /activity/stream (cookie session; the
// server filters rows by the caller's permissions). New rows are prepended to every cached feed whose filters they
// match; overview, badges and the activity summary are refetched at most every few seconds.

export type StreamStatus = "connecting" | "live" | "reconnecting";

const StreamContext = createContext<StreamStatus>("connecting");
const RECONNECT_MS = 5_000;
const REFRESH_THROTTLE_MS = 5_000;

type FeedKey = readonly ["activity", string, (ActivityFilters & { tenantId?: string; pillar?: string })?];

function matches(row: ActivityRow, path: string, filters: ActivityFilters & { tenantId?: string; pillar?: string } = {}) {
  if (path !== "/activity" && path !== `/customer360/${encodeURIComponent(row.tenantId ?? "")}/activity`) return false;
  if (filters.tenantId && row.tenantId !== filters.tenantId) return false;
  if (filters.service && row.service !== filters.service) return false;
  if (filters.pillar && !row.service.startsWith(`${filters.pillar}.`)) return false;
  if (filters.severity && row.severity !== filters.severity) return false;
  if (filters.type && row.type !== filters.type) return false;
  return true;
}

/** Prepends the row to the first page of every matching cached feed (skipping rows already present). */
export function applyActivity(queryClient: QueryClient, row: ActivityRow) {
  for (const query of queryClient.getQueryCache().findAll({ queryKey: ["activity"] })) {
    const key = query.queryKey as unknown as FeedKey;
    if (typeof key[1] !== "string" || !matches(row, key[1], key[2])) continue;
    queryClient.setQueryData<InfiniteData<ActivityPage, string | null>>(query.queryKey, (old) => {
      if (!old || old.pages.length === 0) return old;
      if (old.pages.some((page) => page.data.some((item) => item.id === row.id))) return old;
      const [first, ...rest] = old.pages;
      return { ...old, pages: [{ ...first, data: [row, ...first.data] }, ...rest] };
    });
  }
}

export function ActivityStreamProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const lastRefresh = useRef(0);

  useEffect(() => {
    if (typeof EventSource === "undefined") return undefined;
    let source: EventSource | null = null;
    let reconnect: number | undefined;
    let pendingRefresh: number | undefined;
    let stopped = false;

    const refreshNumbers = () => {
      const wait = Math.max(0, lastRefresh.current + REFRESH_THROTTLE_MS - Date.now());
      if (pendingRefresh !== undefined) return;
      pendingRefresh = window.setTimeout(() => {
        pendingRefresh = undefined;
        lastRefresh.current = Date.now();
        for (const key of [OVERVIEW_KEY, BADGES_KEY, ACTIVITY_SUMMARY_KEY]) void queryClient.invalidateQueries({ queryKey: key });
      }, wait);
    };

    const open = () => {
      if (stopped) return;
      source = new EventSource("/api/internal/activity/stream", { withCredentials: true });
      source.addEventListener("ready", () => setStatus("live"));
      source.addEventListener("activity", (event) => {
        try {
          applyActivity(queryClient, JSON.parse((event as MessageEvent<string>).data) as ActivityRow);
          refreshNumbers();
        } catch {
          // A malformed event is skipped; the next refetch of the feed shows the row.
        }
      });
      source.addEventListener("expired", () => restart());
      source.onerror = () => {
        // The browser retries on its own while the stream is CONNECTING; a CLOSED stream (401 after the access token
        // expired) needs a session refresh before reconnecting.
        if (source?.readyState === EventSource.CLOSED) restart();
        else setStatus("reconnecting");
      };
    };

    const restart = () => {
      source?.close();
      source = null;
      setStatus("reconnecting");
      window.clearTimeout(reconnect);
      reconnect = window.setTimeout(() => {
        refreshSession()
          .catch(() => undefined)
          .finally(open);
      }, RECONNECT_MS);
    };

    open();
    return () => {
      stopped = true;
      window.clearTimeout(reconnect);
      window.clearTimeout(pendingRefresh);
      source?.close();
    };
  }, [queryClient]);

  return <StreamContext.Provider value={status}>{children}</StreamContext.Provider>;
}

export function useActivityStreamStatus() {
  return useContext(StreamContext);
}
