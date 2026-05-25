import Link from "next/link";

import PaymentReturnConfirmation from "@/components/payments/PaymentReturnConfirmation";
import { createTranslator } from "@/lib/shipmentMessages";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function first(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default function BulkPaymentSuccessPage({ searchParams }: PageProps) {
  const locale = first(searchParams?.locale) ?? "en-GB";
  const t = createTranslator(locale);
  const status = first(searchParams?.redirect_status) ?? first(searchParams?.status) ?? "processing";
  const batchRef = first(searchParams?.batch_ref) ?? first(searchParams?.batchRef);
  const provider = first(searchParams?.provider);
  const reference = first(searchParams?.reference) ?? first(searchParams?.trxref);
  const amountMinor = first(searchParams?.amountMinor);
  const currency = first(searchParams?.currency);
  const normalized = status === "succeeded" || status === "confirmed" ? "confirmed" : status === "failed" ? "failed" : "processing";

  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center px-4 py-10">
      <section className="w-full rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">{t("bulk.title")}</p>
        <h1 className="mt-2 text-2xl font-semibold text-gray-950">
          {normalized === "confirmed" ? t("bulk.created") : normalized === "failed" ? t("payment.failed") : "Bulk payment processing"}
        </h1>
        <p className="mt-3 text-sm text-gray-600">
          {normalized === "confirmed"
            ? "Your batch payment was confirmed."
            : normalized === "failed"
              ? "The payment provider reported a failed batch payment."
              : "The payment provider is still confirming this batch payment."}
        </p>
        {batchRef ? (
          <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <span className="block text-xs text-gray-500">Batch reference</span>
            <span className="mt-1 block font-semibold text-gray-950">{batchRef}</span>
          </div>
        ) : null}
        <PaymentReturnConfirmation
          provider={provider}
          reference={reference}
          amountMinor={amountMinor}
          currency={currency}
          trackingLabel="Tracking references"
        />
        <Link href="/" className="btn-brand mt-6 inline-flex">
          {t("success.done")}
        </Link>
      </section>
    </main>
  );
}
