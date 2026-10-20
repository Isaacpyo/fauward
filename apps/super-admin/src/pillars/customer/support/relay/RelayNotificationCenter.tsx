import { useRelayNotifications } from "@fauward/relay-ui";
import { Bell, MessageSquare } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

function toRelativeTime(dateIso: string) {
  const date = new Date(dateIso);
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

export function RelayNotificationCenter() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const relayNotifications = useRelayNotifications({
    mode: "super",
    storageKey: "fw_relay_notifications_read_super",
  });

  function openRelay(id?: string) {
    relayNotifications.markRead(id);
    setOpen(false);
    navigate("/admin/relay");
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--color-border)] bg-white text-[var(--color-text-muted)] hover:bg-[var(--color-surface-50)] hover:text-[var(--color-text-primary)]"
        aria-label="Open notifications"
      >
        <Bell size={16} />
        {relayNotifications.unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500" />
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-11 z-50 w-[360px] rounded-lg border border-[var(--color-border)] bg-white p-2 shadow-lg">
          <div className="mb-1 flex items-center justify-between px-2 py-1.5">
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">Notifications</p>
            <button
              type="button"
              className="text-xs font-medium text-[var(--fauward-navy)] hover:underline disabled:opacity-50"
              disabled={relayNotifications.unreadCount === 0}
              onClick={() => relayNotifications.markRead()}
            >
              Mark all read
            </button>
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {relayNotifications.items.length === 0 ? (
              <p className="px-2 py-8 text-center text-sm text-[var(--color-text-muted)]">
                {relayNotifications.isLoading ? "Loading notifications..." : "No notifications"}
              </p>
            ) : (
              relayNotifications.items.slice(0, 8).map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => openRelay(notification.id)}
                  className="flex w-full gap-3 rounded-md px-2 py-2.5 text-left hover:bg-[var(--color-surface-50)]"
                >
                  <div className="mt-0.5 shrink-0">
                    <MessageSquare size={14} className="text-emerald-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-1 text-sm font-medium text-[var(--color-text-primary)]">{notification.title}</p>
                      {!notification.isRead ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-red-500" /> : null}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-[var(--color-text-muted)]">{notification.body}</p>
                    <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">{toRelativeTime(notification.createdAt)}</p>
                  </div>
                </button>
              ))
            )}
          </div>

          {relayNotifications.isError ? (
            <p className="mt-1 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">Unable to load Relay notifications.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
