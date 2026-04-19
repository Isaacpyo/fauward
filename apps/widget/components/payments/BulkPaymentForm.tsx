"use client";

import { useStripe, useElements, PaymentElement } from "@stripe/react-stripe-js";
import { useEffect, useRef, useState } from "react";
import { useGlobalLoading } from "@/hooks/useGlobalLoading";

interface BulkPaymentFormProps {
  clientSecret: string;
  amount: number; // in pence
  batchRef?: string | null;
  onSuccess: () => void;
}

export default function BulkPaymentForm({
  clientSecret,
  amount,
  batchRef,
  onSuccess,
}: BulkPaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const errorRef = useRef<HTMLDivElement | null>(null);
  const showGlobalLoading = useGlobalLoading((s) => s.show);
  const hideGlobalLoading = useGlobalLoading((s) => s.hide);

  if (process.env.NODE_ENV === "development") {
    console.log("[BulkPaymentForm] clientSecret:", clientSecret ? "✓ Present" : "✗ Missing");
    console.log("[BulkPaymentForm] stripe:", stripe ? "✓ Ready" : "✗ Not Ready");
  }

  const formatStripeError = (error: any): string => {
    const code = error.code;
    let message = error.message;

    if (message) {
      message = message.replace(/\.\s*Your request was in live mode.*$/i, '.');
      message = message.replace(/\s*Your request was in live mode.*$/i, '');
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
        return "The security code (CVC) is incorrect. Please check and try again.";
      case "processing_error":
        return "An error occurred while processing your card. Please try again.";
      case "incorrect_number":
        return "The card number is invalid. Please check and try again.";
      case "invalid_expiry_month":
      case "invalid_expiry_year":
        return "The expiry date is invalid. Please check and try again.";
      case "card_velocity_exceeded":
        return "You've exceeded the number of allowed attempts. Please wait a moment and try again.";
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
        confirmParams: {
          return_url: returnUrl,
        },
        redirect: "if_required",
      });

      if (paymentError) {
        setError(formatStripeError(paymentError));
        setLoading(false);
        hideGlobalLoading();
        return;
      }

      if (paymentIntent?.status === "succeeded") {
        console.log("[BULK_PAYMENT] Payment succeeded, calling onSuccess()");
        onSuccess();
      } else {
        setError("Payment status unclear. Please contact support.");
        setLoading(false);
        hideGlobalLoading();
      }
    } catch (err: any) {
      console.error("[BULK_PAYMENT_ERROR]", err);
      setError("An unexpected error occurred. Please try again or contact support.");
      setLoading(false);
      hideGlobalLoading();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {loading && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center gap-3 text-sm text-gray-700">
            <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-[#d80000]" />
            Processing your payment...
          </div>
        </div>
      )}
      {error && (
        <div
          ref={errorRef}
          className="rounded-xl border-2 border-red-200 bg-red-50 p-4 scroll-mt-24"
        >
          <div className="flex gap-3">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-600" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-red-800 mb-1">Payment Failed</h3>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">Payment Details</h3>
        <div className="rounded-lg border border-gray-300 bg-white px-3 py-3 focus-within:ring-2 focus-within:ring-[#d80000] focus-within:border-[#d80000]">
          <PaymentElement />
        </div>
      </div>

      <div className="flex items-start gap-3 py-4">
        <input
          type="checkbox"
          id="bulk-terms"
          checked={agreedToTerms}
          onChange={(e) => setAgreedToTerms(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-gray-300 text-[#d80000] focus:ring-[#d80000]"
        />
        <label htmlFor="bulk-terms" className="text-sm text-gray-700">
          I agree to the{" "}
          <a
            href="/legal"
            target="_blank"
            className="text-[#d80000] underline hover:text-[#b80000]"
          >
            Terms & Privacy Policy
          </a>
          .
        </label>
      </div>

      <button
        type="submit"
        disabled={!stripe || loading || !agreedToTerms}
        className="w-full bg-[#d80000] text-white py-3.5 rounded-lg font-semibold hover:bg-[#b80000] transition disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
      >
        {loading ? "Processing..." : `Pay £${(amount / 100).toFixed(2)}`}
      </button>
    </form>
  );
}
