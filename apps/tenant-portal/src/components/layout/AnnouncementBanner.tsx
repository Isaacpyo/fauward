import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";

import { api } from "@/lib/api";
import { getAccessToken, hasDevTestSession } from "@/lib/auth";
import { cn } from "@/lib/utils";

type Announcement = {
  id: string;
  type: "INFO" | "WARNING" | "MAINTENANCE";
  title: string;
  body: string;
  cta?: { label?: string; url?: string } | null;
  dismissible: boolean;
  expiresAt?: string | null;
};

const tone = {
  INFO: "border-blue-200 bg-blue-50 text-blue-900",
  WARNING: "border-amber-200 bg-amber-50 text-amber-950",
  MAINTENANCE: "border-orange-200 bg-orange-50 text-orange-950"
};

function dismissedIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem("fw_dismissed_announcements") ?? "[]") as string[]);
  } catch {
    return new Set<string>();
  }
}

export function AnnouncementBanner() {
  const [dismissed, setDismissed] = useState(() => dismissedIds());
  const enabled = Boolean(getAccessToken()) && !hasDevTestSession();
  const query = useQuery({
    queryKey: ["tenant-announcements"],
    queryFn: async () => (await api.get<{ announcements: Announcement[] }>("/v1/tenants/me/announcements")).data.announcements,
    enabled,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000
  });

  const announcements = useMemo(
    () => (query.data ?? []).filter((item) => !dismissed.has(item.id)),
    [dismissed, query.data]
  );

  if (announcements.length === 0) return null;

  function dismiss(id: string) {
    const next = new Set(dismissed);
    next.add(id);
    localStorage.setItem("fw_dismissed_announcements", JSON.stringify([...next]));
    setDismissed(next);
  }

  return (
    <div className="space-y-1 border-b border-gray-200 bg-white">
      {announcements.map((item) => (
        <div key={item.id} className={cn("flex items-start justify-between gap-3 border-t px-4 py-2 text-sm", tone[item.type])}>
          <div>
            <p className="font-semibold">{item.title}</p>
            <p className="mt-0.5">{item.body}</p>
            {item.cta?.url && item.cta.label ? (
              <a className="mt-1 inline-block font-semibold underline" href={item.cta.url}>
                {item.cta.label}
              </a>
            ) : null}
          </div>
          {item.dismissible ? (
            <button className="rounded p-1 hover:bg-black/5" onClick={() => dismiss(item.id)} aria-label="Dismiss announcement">
              <X size={14} />
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
