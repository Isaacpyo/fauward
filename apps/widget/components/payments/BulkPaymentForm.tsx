"use client";

import { PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { useGlobalLoading } from "@/hooks/useGlobalLoading";

type StripeErrorLike = {
  code?: string;
  message?: string;
};

interface BulkPaymentFormProps {
  amount: number;
  currency: string;
  locale: string;
  batchRef?: string | null;
  onSuccess: () => void;
}

function formatMinorAmount(amount: number, currency: string, locale: string): string {
  const zeroDecimalCurrencies = new Set([
    "BIF",
    "CLP",
    "DJF",
    "GNF",
    "JPY",
    "KMF",
    "KRW",
    "MGA",
    "PYG",
    "RWF",
    "UGX",
    "VND",
    "VUV",
    "XAF",
    "XOF",
    "XPF",
  ]);
  const divisor = zeroDecimalCurrencies.has(currency.toUpperCase()) ? 1 : 100;
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount / divisor);
}

export default function BulkPaymentForm({
  amount,
  currency,
  locale,
  batchRef,
  onSuccess,
}: BulkPaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const errorRef = useRef<HTMLDivElement | null>(null);
  const showGlobalLoading = useGlobalLoading((state) => state.show);
  const hideGlobalLoading = useGlobalLoading((state) => state.hide);

  const formatStripeError = (stripeError: StripeErrorLike): string => {
    const code = stripeError.code;
    let message = stripeError.message;

    if (message) {
      message = message.replace(/\.\s*Your request was in live mode.*$/i, ".");
      message = message.replace(/\s*Your request was in live mode.*$/i, "");
    }

    switch (code) {
      case "card_declined":
        return "Your card was declined.";
      case "insufficient_funds":
        return "Your card has insufficient funds. Please use a different card.";
      case "lost_card":
      case "stolen_card":
        return "This card has been reported as lost or stolen. Please use a different card.";
      case "expired_card":
        return "Your card has expired. Please use a different card.";
      case "incorrect_cvc":
        return "The security code is incorrect. Please check and try again.";
      case "processing_error":
        return "An error occurred while processing your card. Please try again.";
      case "incorrect_number":
        return "The card number is invalid. Please check and try again.";
      case "invalid_expiry_month":
      case "invalid_expiry_year":
        return "The expiry date is invalid. Please check and try again.";
      case "card_velocity_exceeded":
        return "You've exceeded the number of allowed attempts. Please wait and try again.";
      case "email_invalid":
        return "The email address is invalid. Please check and try again.";
      case "invalid_charge_amount":
        return "The payment amount is invalid. Please contact support.";
      default:
        return message || "Payment failed. Please try again or contact support.";
    }
  };

  useEffect(() => {
    if (!error) return;
    const target = errorRef.current;
    if (!target) return;
    const timer = window.setTimeout(() => {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [error]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements) return;

    setLoading(true);
    showGlobalLoading();
    setError(null);

    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setError(formatStripeError(submitError));
        setLoading(false);
        hideGlobalLoading();
        return;
      }

      const returnUrl = batchRef
        ? `${window.location.origin}/payment/bulk-success?batch_ref=${encodeURIComponent(batchRef)}`
        : `${window.location.origin}/payment/bulk-success`;
      const { error: paymentError, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: returnUrl },
        redirect: "if_required",
      });

      if (paymentError) {
        setError(formatStripeError(paymentError));
        setLoading(false);
        hideGlobalLoading();
        return;
      }

      if (paymentIntent?.status === "succeeded") {
        onSuccess();
      } else {
        setError("Payment status unclear. Please contact support.");
        setLoading(false);
        hideGlobalLoading();
      }
    } catch {
      setError("An unexpected error occurred. Please try again or contact support.");
      setLoading(false);
      hideGlobalLoading();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {loading ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-5">
          <div className="flex items-center gap-3 text-sm text-[var(--text-subtle)]">
            <span className="spinner brand-accent-text" />
            Processing your payment...
          </div>
        </div>
      ) : null}

      {error ? (
        <div ref={errorRef} className="notice-error scroll-mt-24">
          <h3 className="mb-1 text-sm font-semibold">Payment failed</h3>
          <p>{error}</p>
        </div>
      ) : null}

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-[var(--text)]">Payment details</h3>
        <div className="brand-focus-panel">
          <PaymentElement />
        </div>
      </div>

      <div className="flex items-start gap-3 py-4">
        <input
          type="checkbox"
          id="bulk-terms"
          checked={agreedToTerms}
          onChange={(event) => setAgreedToTerms(event.target.checked)}
          className="mt-1 h-4 w-4 rounded border-[var(--border)] text-[var(--brand-primary)] focus:ring-[var(--brand-primary)]"
        />
        <label htmlFor="bulk-terms" className="text-sm text-[var(--text-subtle)]">
          I agree to the{" "}
          <a href="/legal" target="_blank" className="brand-accent-text underline">
            Terms and Privacy Policy
          </a>
          .
        </label>
      </div>

      <button
        type="submit"
        disabled={!stripe || loading || !agreedToTerms}
        className="btn-brand w-full"
      >
        {loading ? "Processing..." : `Pay ${formatMinorAmount(amount, currency, locale)}`}
      </button>
    </form>
  );
}
