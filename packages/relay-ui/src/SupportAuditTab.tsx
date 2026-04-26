"use client";

import { Star } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { fetchFeedback, formatRelayTime } from "./client";
import type { RelayFeedback } from "./types";

const ratingLabels: Record<number, string> = {
  5: "Very satisfied",
  4: "Satisfied",
  3: "Neutral",
  2: "Unsatisfied",
  1: "Not satisfied",
};

function ratingTone(rating: number) {
  if (rating >= 4) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (rating === 3) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-red-200 bg-red-50 text-red-700";
}

function sourceLabel(source: RelayFeedback["source_app"]) {
  return source === "marketing" ? "Widget" : "Tenant portal";
}

export function SupportAuditTab() {
  const query = useQuery({
    queryKey: ["relay-feedback"],
    queryFn: fetchFeedback,
    staleTime: 30_000,
  });

  const items = query.data ?? [];
  const average = items.length ? items.reduce((sum, item) => sum + item.rating, 0) / items.length : 0;

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-[var(--color-text-primary)]">Support Audit</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Closed Relay chat satisfaction and comments.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-[var(--color-border)] bg-white p-4">
          <p className="text-xs font-semibold uppercase text-[var(--color-text-muted)]">Responses</p>
          <p className="mt-2 text-2xl font-bold text-[var(--color-text-primary)]">{items.length}</p>
        </div>
        <div className="rounded-lg border border-[var(--color-border)] bg-white p-4">
          <p className="text-xs font-semibold uppercase text-[var(--color-text-muted)]">Average rating</p>
          <p className="mt-2 text-2xl font-bold text-[var(--color-text-primary)]">
            {items.length ? average.toFixed(1) : "-"}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--color-border)] bg-white p-4">
          <p className="text-xs font-semibold uppercase text-[var(--color-text-muted)]">Low ratings</p>
          <p className="mt-2 text-2xl font-bold text-[var(--color-text-primary)]">
            {items.filter((item) => item.rating <= 2).length}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-white">
        <div className="grid grid-cols-[1.1fr,0.8fr,0.8fr,1.2fr,0.9fr] gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-50)] px-4 py-3 text-xs font-semibold uppercase text-[var(--color-text-muted)]">
          <span>Customer</span>
          <span>Source</span>
          <span>Rating</span>
          <span>Comment</span>
          <span>Submitted</span>
        </div>
        {query.isLoading ? <p className="px-4 py-5 text-sm text-[var(--color-text-muted)]">Loading feedback...</p> : null}
        {!query.isLoading && items.length === 0 ? (
          <p className="px-4 py-5 text-sm text-[var(--color-text-muted)]">No feedback submitted yet.</p>
        ) : null}
        {items.map((item) => (
          <div
            key={item.id}
            className="grid grid-cols-[1.1fr,0.8fr,0.8fr,1.2fr,0.9fr] gap-3 border-b border-[var(--color-border)] px-4 py-3 text-sm last:border-b-0"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-[var(--color-text-primary)]">
                {item.customer_name || item.customer_email || item.tenant_id || "Unknown"}
              </p>
              <p className="mt-0.5 truncate text-xs text-[var(--color-text-muted)]">{item.customer_email || item.tenant_id}</p>
            </div>
            <span className="text-[var(--color-text-muted)]">{sourceLabel(item.source_app)}</span>
            <span className={`inline-flex h-7 w-fit items-center gap-1 rounded-full border px-2 text-xs font-semibold ${ratingTone(item.rating)}`}>
              <Star size={13} fill="currentColor" />
              {ratingLabels[item.rating] ?? item.rating}
            </span>
            <p className="min-w-0 break-words text-[var(--color-text-primary)]">{item.comment || "-"}</p>
            <span className="text-xs text-[var(--color-text-muted)]">{formatRelayTime(item.created_at)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
