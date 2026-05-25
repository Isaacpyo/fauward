import { AlertCircle, Bell, MessageSquare, RefreshCw, ShieldCheck, Wallet } from "lucide-react";

export type NotificationFilterKey =
  | "all"
  | "permission"
  | "return"
  | "ticket"
  | "payment"
  | "exception";

export interface NotificationFilterDef {
  key: NotificationFilterKey;
  label: string;
  /** Returns true when this notification belongs to the bucket. */
  match: (type: string) => boolean;
}

export const notificationFilters: NotificationFilterDef[] = [
  { key: "all", label: "All", match: () => true },
  { key: "permission", label: "Permission", match: (t) => t.includes("permission") },
  { key: "return", label: "Returns", match: (t) => t.includes("return") },
  { key: "ticket", label: "Tickets", match: (t) => t.includes("ticket") },
  { key: "payment", label: "Payments", match: (t) => t.includes("payment") },
  { key: "exception", label: "Exceptions", match: (t) => t.includes("exception") || t.includes("rejected") }
];

export function iconForNotificationType(type: string, size = 14): JSX.Element {
  if (type.includes("permission")) return <ShieldCheck size={size} className="text-blue-600" />;
  if (type.includes("return")) return <RefreshCw size={size} className="text-amber-600" />;
  if (type.includes("ticket")) return <MessageSquare size={size} className="text-emerald-600" />;
  if (type.includes("payment")) return <Wallet size={size} className="text-indigo-600" />;
  if (type.includes("exception") || type.includes("rejected")) {
    return <AlertCircle size={size} className="text-rose-600" />;
  }
  return <Bell size={size} className="text-slate-600" />;
}

export function toRelativeTime(dateIso: string): string {
  const date = new Date(dateIso);
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

export function formatAbsoluteTime(dateIso: string): string {
  return new Date(dateIso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
