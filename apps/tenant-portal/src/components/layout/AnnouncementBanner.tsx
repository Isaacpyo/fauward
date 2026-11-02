import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";

import { api } from "@/lib/api";
import { getAccessToken, hasDevTestSession } from "@/lib/auth";
import { cn } from "@/lib/utils";

// Fauward announcements (L8, WP-2.14). Receipts go to the API — viewed once per announcement, dismissed, CTA clicked —
// so Fauward sees who read what and a dismissal follows the user to every device. Edits and archives show within a
// minute (refetch every 60 s).

type Announcement = {
  id: string;
  type: "INFO" | "WARNING" | "MAINTENANCE" | "INCIDENT";
  title: string;
  body: string;
  cta?: { label?: string; url?: string } | null;
  dismissible: boolean;
  expiresAt?: string | null;
};

type ReceiptAction = "VIEWED" | "DISMISSED" | "CTA_CLICKED";

const tone = {
  INFO: "border-blue-200 bg-blue-50 text-blue-900",
  WARNING: "border-amber-200 bg-amber-50 text-amber-950",
  MAINTENANCE: "border-orange-200 bg-orange-50 text-orange-950",
  // Public updates of a Fauward incident (platform.incidents, WP-4.2); the announcement expires when it is resolved.
  INCIDENT: "border-red-200 bg-red-50 text-red-950"
};

const ANNOUNCEMENTS_KEY = ["tenant-announcements"];

function sendReceipt(id: string, action: ReceiptAction) {
  return api.post(`/v1/tenants/me/announcements/${encodeURIComponent(id)}/receipt`, { action });
}

export function AnnouncementBanner() {
  const enabled = Boolean(getAccessToken()) && !hasDevTestSession();
  const [hidden, setHidden] = useState<string[]>([]);
  const viewed = useRef(new Set<string>());
  const query = useQuery({
    queryKey: ANNOUNCEMENTS_KEY,
    queryFn: async () => (await api.get<{ announcements: Announcement[] }>("/v1/tenants/me/announcements")).data.announcements,
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000
  });
  const announcements = (query.data ?? []).filter((item) => !hidden.includes(item.id));

  useEffect(() => {
    for (const item of announcements) {
      if (viewed.current.has(item.id)) continue;
      viewed.current.add(item.id);
      // A lost receipt only under-counts views; it never blocks the banner.
      sendReceipt(item.id, "VIEWED").catch(() => viewed.current.delete(item.id));
    }
  }, [announcements]);

  if (announcements.length === 0) return null;

  function dismiss(id: string) {
    setHidden((current) => [...current, id]);
    sendReceipt(id, "DISMISSED").catch(() => setHidden((current) => current.filter((item) => item !== id)));
  }

  return (
    <div className="space-y-1 border-b border-gray-200 bg-white" data-testid="announcement-banner">
      {announcements.map((item) => (
        <div key={item.id} data-announcement-type={item.type} role={item.type === "INCIDENT" ? "alert" : undefined} className={cn("flex items-start justify-between gap-3 border-t px-4 py-2 text-sm", tone[item.type] ?? tone.INFO)}>
          <div>
            <p className="font-semibold">{item.title}</p>
            <p className="mt-0.5">{item.body}</p>
            {item.cta?.url && item.cta.label ? (
              <a
                className="mt-1 inline-block font-semibold underline"
                href={item.cta.url}
                target="_blank"
                rel="noreferrer"
                onClick={() => {
                  sendReceipt(item.id, "CTA_CLICKED").catch(() => undefined);
                }}
              >
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
