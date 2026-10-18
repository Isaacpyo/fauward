import { Bell } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { consoleApi } from "@/lib/console-api";
import type { ConsoleApiError } from "@/lib/console-api-error";

export type StaffNotification = {
  id: string;
  event: string;
  title: string;
  body: string | null;
  link: string | null;
  severity: "INFO" | "ATTENTION" | "CRITICAL";
  tenantId: string | null;
  readAt: string | null;
  createdAt: string;
};

type StaffNotificationPage = { data: StaffNotification[]; unreadCount: number; nextCursor: string | null };

export const STAFF_NOTIFICATIONS_KEY = ["shell", "notifications", "staff"] as const;

const SEVERITY_DOT: Record<StaffNotification["severity"], string> = {
  INFO: "bg-slate-400",
  ATTENTION: "bg-amber-500",
  CRITICAL: "bg-red-600"
};

/** Console bell (D6): the caller's StaffNotification rows, refreshed every 60 s. */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const notifications = useQuery({
    queryKey: STAFF_NOTIFICATIONS_KEY,
    queryFn: async () => (await consoleApi.get<StaffNotificationPage>("/notifications/staff", { params: { limit: 30 } })).data,
    refetchInterval: 60_000
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: STAFF_NOTIFICATIONS_KEY });
  const markRead = useMutation({
    mutationFn: async (id: string) => (await consoleApi.post(`/notifications/staff/${id}/read`)).data,
    onSettled: invalidate
  });
  const markAll = useMutation({
    mutationFn: async () => (await consoleApi.post("/notifications/staff/read-all")).data,
    onSettled: invalidate
  });

  const unread = notifications.data?.unreadCount ?? 0;
  const error = (notifications.error ?? markRead.error ?? markAll.error) as ConsoleApiError | null;

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        onClick={() => setOpen((value) => !value)}
        className="relative grid h-9 w-9 place-items-center rounded-full border border-[var(--color-border)] bg-white hover:bg-[var(--color-surface-50)]"
      >
        <Bell size={16} className="text-[var(--color-text-muted)]" />
        {unread > 0 ? (
          <span data-testid="notification-unread" className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-[18px] text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div role="dialog" aria-label="Notifications" className="absolute right-0 top-11 z-40 w-96 rounded-md border border-[var(--color-border)] bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2">
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">Notifications</p>
            <button
              type="button"
              disabled={unread === 0 || markAll.isPending}
              onClick={() => markAll.mutate()}
              className="text-xs font-semibold text-[var(--fauward-navy)] disabled:cursor-not-allowed disabled:text-[var(--color-text-muted)]"
            >
              Mark all read
            </button>
          </div>
          {error ? <p className="px-3 py-2 text-xs text-red-600">{error.message}</p> : null}
          <div className="max-h-96 overflow-y-auto">
            {notifications.isLoading ? (
              <p className="px-3 py-6 text-center text-xs text-[var(--color-text-muted)]">Loading…</p>
            ) : (notifications.data?.data.length ?? 0) === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-[var(--color-text-muted)]">No notifications yet.</p>
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {notifications.data!.data.map((item) => {
                  const content = (
                    <div className="flex items-start gap-2">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[item.severity]}`} />
                      <div className="min-w-0 flex-1">
                        <p className={`text-xs ${item.readAt ? "text-[var(--color-text-muted)]" : "font-semibold text-[var(--color-text-primary)]"}`}>{item.title}</p>
                        {item.body ? <p className="mt-0.5 line-clamp-2 text-[11px] text-[var(--color-text-muted)]">{item.body}</p> : null}
                        <p className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">{new Date(item.createdAt).toLocaleString()}</p>
                      </div>
                    </div>
                  );
                  const onOpen = () => {
                    if (!item.readAt) markRead.mutate(item.id);
                    setOpen(false);
                  };
                  return (
                    <li key={item.id} className="px-3 py-2 hover:bg-[var(--color-surface-50)]">
                      {item.link ? (
                        <Link to={item.link} onClick={onOpen} className="block">
                          {content}
                        </Link>
                      ) : (
                        <button type="button" onClick={onOpen} className="block w-full text-left">
                          {content}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
