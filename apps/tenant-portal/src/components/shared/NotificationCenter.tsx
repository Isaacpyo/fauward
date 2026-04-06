import * as RadixDropdown from "@radix-ui/react-dropdown-menu";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Bell, MessageSquare, RefreshCw, Wallet } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { api } from "@/lib/api";

type InAppNotification = {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  isRead: boolean;
  createdAt: string;
};

function toRelativeTime(dateIso: string) {
  const date = new Date(dateIso);
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

function iconForType(type: string) {
  if (type.includes("return")) return <RefreshCw size={14} className="text-amber-600" />;
  if (type.includes("ticket")) return <MessageSquare size={14} className="text-emerald-600" />;
  if (type.includes("payment")) return <Wallet size={14} className="text-indigo-600" />;
  if (type.includes("exception")) return <AlertCircle size={14} className="text-rose-600" />;
  return <Bell size={14} className="text-slate-600" />;
}

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

  const notificationsQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: fetchNotifications,
    staleTime: 10_000
  });

  const unreadCountQuery = useQuery({
    queryKey: ["notifications-unread-count"],
    queryFn: fetchUnreadCount,
    refetchInterval: 30_000
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
  const unreadCount = unreadCountQuery.data ?? notifications.filter((item) => !item.isRead).length;

  return (
    <RadixDropdown.Root>
      <RadixDropdown.Trigger asChild>
        <button className="relative inline-flex h-10 w-10 items-center justify-center rounded-md border border-gray-200 bg-white hover:bg-gray-50">
          <Bell size={16} />
          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
          ) : null}
        </button>
      </RadixDropdown.Trigger>

      <RadixDropdown.Portal>
        <RadixDropdown.Content
          align="end"
          sideOffset={8}
          className="z-50 w-[360px] rounded-lg border border-gray-200 bg-white p-2 shadow-sm"
        >
          <div className="mb-1 flex items-center justify-between px-2 py-1.5">
            <p className="text-sm font-semibold text-gray-900">Notifications</p>
            <button
              type="button"
              className="text-xs font-medium text-[var(--tenant-primary)] hover:underline disabled:opacity-50"
              disabled={markAllRead.isPending || unreadCount === 0}
              onClick={() => markAllRead.mutate()}
            >
              Mark all read
            </button>
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-2 py-8 text-center text-sm text-gray-500">No notifications</p>
            ) : (
              notifications.map((notification) => (
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
                  <div className="mt-0.5 shrink-0">{iconForType(notification.type)}</div>
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
        </RadixDropdown.Content>
      </RadixDropdown.Portal>
    </RadixDropdown.Root>
  );
}

