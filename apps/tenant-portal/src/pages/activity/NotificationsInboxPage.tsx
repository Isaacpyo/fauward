import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageShell } from "@/layouts/PageShell";
import { api } from "@/lib/api";
import {
  formatAbsoluteTime,
  iconForNotificationType,
  notificationFilters,
  toRelativeTime,
  type NotificationFilterKey,
} from "@/lib/notification-display";

type InAppNotification = {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  isRead: boolean;
  createdAt: string;
};

const PAGE_SIZE = 50;
// Backend caps `limit` at 100 (see notifications.routes.ts). Cursor pagination
// is a follow-up if we ever need to scroll further back than that.
const MAX_LIMIT = 100;

export function NotificationsInboxPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [activeFilter, setActiveFilter] = useState<NotificationFilterKey>("all");

  const listQuery = useQuery({
    queryKey: ["notifications", "inbox", limit],
    queryFn: async () => {
      const res = await api.get<{ notifications: InAppNotification[] }>(
        `/v1/notifications?limit=${limit}`
      );
      return res.data.notifications ?? [];
    },
    refetchInterval: 30_000,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/v1/notifications/${id}/read`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      await api.post("/v1/notifications/read-all");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
    },
  });

  const notifications = listQuery.data ?? [];

  const filtered = useMemo(() => {
    const def = notificationFilters.find((f) => f.key === activeFilter) ?? notificationFilters[0];
    let rows = notifications.filter((n) => def.match(n.type));
    if (unreadOnly) rows = rows.filter((n) => !n.isRead);
    return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [notifications, activeFilter, unreadOnly]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const canLoadMore = notifications.length >= limit && limit < MAX_LIMIT;

  const handleRowClick = (n: InAppNotification) => {
    if (!n.isRead) markRead.mutate(n.id);
    if (n.link) navigate(n.link);
  };

  return (
    <PageShell
      title="Notifications"
      description="Everything that landed in your inbox."
      breadcrumb={[
        { label: "Activity", to: "/activity" },
        { label: "Notifications" },
      ]}
      state={listQuery.isLoading ? "loading" : "ready"}
      onRetry={() => void listQuery.refetch()}
      actions={
        <Button
          variant="secondary"
          size="sm"
          disabled={markAllRead.isPending || unreadCount === 0}
          onClick={() => markAllRead.mutate()}
        >
          {markAllRead.isPending ? "Marking…" : "Mark all read"}
        </Button>
      }
    >
      <div className="space-y-4">
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            {notificationFilters.map((filter) => {
              const active = filter.key === activeFilter;
              return (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setActiveFilter(filter.key)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                    active
                      ? "border-[var(--tenant-primary)] bg-[var(--tenant-primary-soft)] text-[var(--tenant-primary)]"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {filter.label}
                </button>
              );
            })}
            <div className="ml-auto flex items-center gap-2 text-xs text-gray-600">
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300"
                  checked={unreadOnly}
                  onChange={(event) => setUnreadOnly(event.target.checked)}
                />
                Unread only
              </label>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
          {filtered.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Inbox}
                title={
                  unreadOnly && notifications.length > 0
                    ? "No unread notifications"
                    : "No notifications"
                }
                description={
                  activeFilter === "all"
                    ? "Notifications about permission requests, returns, tickets, payments, and exceptions will appear here."
                    : "Try a different filter or clear the unread-only toggle."
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filtered.map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    onClick={() => handleRowClick(notification)}
                    className={`flex w-full gap-4 px-4 py-3 text-left transition hover:bg-gray-50 ${
                      notification.isRead ? "" : "bg-blue-50/40"
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">{iconForNotificationType(notification.type, 18)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className={`text-sm ${notification.isRead ? "text-gray-700" : "font-semibold text-gray-900"}`}>
                          {notification.title}
                        </p>
                        {!notification.isRead ? (
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-500" aria-label="Unread" />
                        ) : null}
                      </div>
                      {notification.body ? (
                        <p className="mt-1 text-sm text-gray-600">{notification.body}</p>
                      ) : null}
                      <p
                        className="mt-1 text-[11px] text-gray-500"
                        title={formatAbsoluteTime(notification.createdAt)}
                      >
                        {toRelativeTime(notification.createdAt)}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {canLoadMore ? (
          <div className="flex justify-center">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setLimit((value) => Math.min(value + PAGE_SIZE, MAX_LIMIT))}
              disabled={listQuery.isFetching}
            >
              {listQuery.isFetching ? "Loading…" : "Load more"}
            </Button>
          </div>
        ) : null}
      </div>
    </PageShell>
  );
}
