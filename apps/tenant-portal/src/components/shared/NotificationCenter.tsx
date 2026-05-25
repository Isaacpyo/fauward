import * as RadixDropdown from "@radix-ui/react-dropdown-menu";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRelayNotifications } from "@fauward/relay-ui";
import { Bell, BellOff, MessageSquare } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { api } from "@/lib/api";
import { getAccessToken, hasDevTestSession } from "@/lib/auth";
import { useAppStore } from "@/stores/useAppStore";
import { useTenantStore } from "@/stores/useTenantStore";
import { iconForNotificationType, toRelativeTime } from "@/lib/notification-display";
import { isNotificationSoundMuted, playNotificationChime, setNotificationSoundMuted } from "@/lib/notification-sound";

const UNREAD_ONLY_STORAGE_KEY = "fw-bell-unread-only";

type InAppNotification = {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  isRead: boolean;
  createdAt: string;
};

async function fetchNotifications() {
  const response = await api.get<{ notifications: InAppNotification[] }>("/v1/notifications?limit=50");
  return response.data.notifications;
}

async function fetchUnreadCount() {
  const response = await api.get<{ count: number }>("/v1/notifications/unread-count");
  return response.data.count;
}

export function NotificationCenter() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tenant = useTenantStore((state) => state.tenant);
  const addToast = useAppStore((state) => state.addToast);
  const isDevSession = hasDevTestSession();
  const canFetchNotifications = Boolean(getAccessToken()) && !isDevSession;
  const relayTenantId = isDevSession ? "tenant_dev" : tenant?.tenant_id;
  const [muted, setMuted] = useState<boolean>(() => isNotificationSoundMuted());
  const [unreadOnly, setUnreadOnly] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(UNREAD_ONLY_STORAGE_KEY) === "1";
  });
  // Tracks IDs we've already alerted on so we only fire toast + sound for
  // genuinely new arrivals, not for every poll or remount.
  const seenIdsRef = useRef<Set<string> | null>(null);

  const notificationsQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: fetchNotifications,
    staleTime: 10_000,
    // Without an active poll the new-arrival detection effect below never sees
    // notifications created while the dashboard is open — toast + chime never fire.
    refetchInterval: 15_000,
    enabled: canFetchNotifications
  });

  const unreadCountQuery = useQuery({
    queryKey: ["notifications-unread-count"],
    queryFn: fetchUnreadCount,
    refetchInterval: 30_000,
    enabled: canFetchNotifications
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/v1/notifications/${id}/read`);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] })
      ]);
    }
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      await api.post("/v1/notifications/read-all");
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] })
      ]);
    }
  });

  const notifications = notificationsQuery.data ?? [];

  // Detect newly-arrived notifications and surface them as toast + chime.
  // First fetch only seeds the baseline so existing items don't all toast at once.
  useEffect(() => {
    if (!notificationsQuery.isSuccess) return;
    if (seenIdsRef.current === null) {
      seenIdsRef.current = new Set(notifications.map((n) => n.id));
      return;
    }
    const fresh = notifications.filter((n) => !seenIdsRef.current!.has(n.id) && !n.isRead);
    if (fresh.length === 0) return;
    fresh.forEach((n) => seenIdsRef.current!.add(n.id));
    // Surface at most 3 toasts per refresh — the store caps anyway, but this
    // keeps a sensible upper bound on chimes too.
    fresh.slice(0, 3).forEach((n) => {
      addToast({
        title: n.title,
        description: n.body ?? undefined,
        variant: n.type.includes("exception") || n.type.includes("rejected") ? "warning" : "default"
      });
    });
    playNotificationChime();
  }, [notifications, notificationsQuery.isSuccess, addToast]);

  const relayNotifications = useRelayNotifications({
    mode: "tenant",
    tenantId: relayTenantId,
    storageKey: `fw_relay_notifications_read_tenant_${relayTenantId ?? "unknown"}`,
    enabled: Boolean(relayTenantId)
  });
  const unreadCount = (unreadCountQuery.data ?? notifications.filter((item) => !item.isRead).length) + relayNotifications.unreadCount;

  // Defensive sort + unread-only filter. Backend already orders desc, but
  // re-sorting locally keeps behaviour stable if the response ever shifts.
  const sortedNotifications = useMemo(
    () => [...notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [notifications]
  );
  const visibleNotifications = unreadOnly
    ? sortedNotifications.filter((n) => !n.isRead)
    : sortedNotifications;

  const persistUnreadOnly = (next: boolean) => {
    setUnreadOnly(next);
    if (typeof window === "undefined") return;
    if (next) window.localStorage.setItem(UNREAD_ONLY_STORAGE_KEY, "1");
    else window.localStorage.removeItem(UNREAD_ONLY_STORAGE_KEY);
  };

  return (
    <RadixDropdown.Root>
      <RadixDropdown.Trigger asChild>
        <button
          className={`relative inline-flex h-10 w-10 items-center justify-center rounded-md border bg-white hover:bg-gray-50 ${
            unreadCount > 0 ? "border-red-300" : "border-gray-200"
          }`}
          aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications"}
        >
          <Bell size={16} className={unreadCount > 0 ? "text-red-600" : "text-gray-700"} />
          {unreadCount > 0 ? (
            <>
              <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
              <span className="pointer-events-none absolute -right-1 -top-1 inline-flex h-4 w-4 animate-ping rounded-full bg-red-400 opacity-75" />
            </>
          ) : null}
        </button>
      </RadixDropdown.Trigger>

      <RadixDropdown.Portal>
        <RadixDropdown.Content
          align="end"
          sideOffset={8}
          className="z-50 w-[360px] rounded-lg border border-gray-200 bg-white p-2 shadow-sm"
        >
          <div className="mb-1 flex items-center justify-between gap-2 px-2 py-1.5">
            <p className="text-sm font-semibold text-gray-900">Notifications</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition ${
                  unreadOnly
                    ? "border-[var(--tenant-primary)] bg-[var(--tenant-primary-soft)] text-[var(--tenant-primary)]"
                    : "border-gray-200 text-gray-500 hover:border-gray-300"
                }`}
                onClick={(event) => {
                  event.preventDefault();
                  persistUnreadOnly(!unreadOnly);
                }}
              >
                Unread only
              </button>
              <button
                type="button"
                className="text-gray-500 hover:text-gray-700"
                title={muted ? "Unmute notification sound" : "Mute notification sound"}
                aria-label={muted ? "Unmute notification sound" : "Mute notification sound"}
                onClick={(event) => {
                  event.preventDefault();
                  const next = !muted;
                  setMuted(next);
                  setNotificationSoundMuted(next);
                  if (!next) playNotificationChime(); // preview when unmuting
                }}
              >
                {muted ? <BellOff size={14} /> : <Bell size={14} />}
              </button>
              <button
                type="button"
                className="text-xs font-medium text-[var(--tenant-primary)] hover:underline disabled:opacity-50"
                disabled={markAllRead.isPending || unreadCount === 0}
                onClick={() => {
                  relayNotifications.markRead();
                  if (canFetchNotifications) {
                    markAllRead.mutate();
                  }
                }}
              >
                Mark all read
              </button>
            </div>
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {relayNotifications.items.length > 0 ? (
              <div className="mb-1 border-b border-gray-100 pb-1">
                {relayNotifications.items.slice(0, 5).map((notification) => (
                  <button
                    key={notification.id}
                    type="button"
                    className="flex w-full gap-3 rounded-md px-2 py-2.5 text-left hover:bg-gray-50"
                    onClick={() => {
                      relayNotifications.markRead(notification.id);
                      navigate("/messaging");
                    }}
                  >
                    <div className="mt-0.5 shrink-0">
                      <MessageSquare size={14} className="text-emerald-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-1 text-sm font-medium text-gray-900">{notification.title}</p>
                        {!notification.isRead ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-red-500" /> : null}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-gray-600">{notification.body}</p>
                      <p className="mt-1 text-[11px] text-gray-500">{toRelativeTime(notification.createdAt)}</p>
                    </div>
                  </button>
                ))}
              </div>
            ) : null}

            {visibleNotifications.length === 0 && relayNotifications.items.length === 0 ? (
              <p className="px-2 py-8 text-center text-sm text-gray-500">
                {unreadOnly && notifications.length > 0 ? "No unread notifications" : "No notifications"}
              </p>
            ) : (
              visibleNotifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  className="flex w-full gap-3 rounded-md px-2 py-2.5 text-left hover:bg-gray-50"
                  onClick={() => {
                    if (!notification.isRead) {
                      markRead.mutate(notification.id);
                    }
                    if (notification.link) {
                      navigate(notification.link);
                    }
                  }}
                >
                  <div className="mt-0.5 shrink-0">{iconForNotificationType(notification.type)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-1 text-sm font-medium text-gray-900">{notification.title}</p>
                      {!notification.isRead ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-500" /> : null}
                    </div>
                    {notification.body ? (
                      <p className="mt-0.5 line-clamp-2 text-xs text-gray-600">{notification.body}</p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-gray-500">{toRelativeTime(notification.createdAt)}</p>
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="mt-1 border-t border-gray-100 pt-1">
            <RadixDropdown.Item asChild>
              <Link
                to="/activity/notifications"
                className="block rounded-md px-2 py-2 text-center text-xs font-medium text-[var(--tenant-primary)] hover:bg-gray-50 hover:underline focus:outline-none"
              >
                View all notifications
              </Link>
            </RadixDropdown.Item>
          </div>
        </RadixDropdown.Content>
      </RadixDropdown.Portal>
    </RadixDropdown.Root>
  );
}
