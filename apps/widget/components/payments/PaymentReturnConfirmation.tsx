"use client";

import { useEffect, useState } from "react";

type ConfirmationState =
  | { status: "idle" | "pending" }
  | { status: "confirmed"; trackingRefs: string[] }
  | { status: "failed"; message: string };

type PaymentReturnConfirmationProps = {
  provider: string | null;
  reference: string | null;
  amountMinor: string | null;
  currency: string | null;
  trackingLabel: string;
};

export default function PaymentReturnConfirmation({
  provider,
  reference,
  amountMinor,
  currency,
  trackingLabel,
}: PaymentReturnConfirmationProps) {
  const [state, setState] = useState<ConfirmationState>({ status: "idle" });

  useEffect(() => {
    if (provider !== "paystack" || !reference || !amountMinor || !currency) return;
    let active = true;
    setState({ status: "pending" });
    fetch("/api/payment/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "paystack",
        reference,
        amountMinor: Number(amountMinor),
        currency,
      }),
    })
      .then(async (res) => {
        const json = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          status?: string;
          shipments?: Array<{ trackingRef: string }>;
          trackingRef?: string | null;
          error?: string;
        };
        if (!active) return;
        if (!res.ok || !json.success) {
          setState(
            json.status === "pending"
              ? { status: "pending" }
              : { status: "failed", message: json.error ?? "Payment confirmation failed" },
          );
          return;
        }
        const trackingRefs = json.shipments?.map((shipment) => shipment.trackingRef) ?? (json.trackingRef ? [json.trackingRef] : []);
        setState({ status: "confirmed", trackingRefs });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState({ status: "failed", message: error instanceof Error ? error.message : "Payment confirmation failed" });
      });

    return () => {
      active = false;
    };
  }, [amountMinor, currency, provider, reference]);

  if (state.status === "idle") return null;
  if (state.status === "pending") {
    return <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">Confirming Paystack payment...</div>;
  }
  if (state.status === "failed") {
    return <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{state.message}</div>;
  }
  if (state.status !== "confirmed") return null;
  return (
    <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <span className="block text-xs text-gray-500">{trackingLabel}</span>
      <span className="mt-1 block font-semibold text-gray-950">{state.trackingRefs.join(", ")}</span>
    </div>
  );
}
