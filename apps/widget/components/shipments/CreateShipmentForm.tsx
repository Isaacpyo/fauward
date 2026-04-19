/* eslint-disable @typescript-eslint/no-explicit-any */
// Widget-adapted version of the shipment wizard.
// Differences from apps/web version:
//   - No router/window navigation; uses callbacks instead
//   - Submits to /api/widget/shipments (writes to tenant Supabase schema)
//   - Auth handled by widget session token, not Firebase session cookies
//   - postMessage events fired on WIDGET_CLOSE and SHIPMENT_CREATED

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  doc,
  addDoc,
  collection,
  serverTimestamp,
  getDoc,
  setDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebaseConfig";
import { firebaseAuth } from "@/lib/firebaseClient";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
} from "firebase/auth";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  useStripe,
  useElements,
  PaymentElement,
} from "@stripe/react-stripe-js";
import BulkPaymentForm from "@/components/payments/BulkPaymentForm";

// Initialize Stripe
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

// ---------------- Types ----------------

type Direction = "SHIP_TO_AFRICA" | "SHIP_TO_UK";

type Party = {
  fullName: string;
  email?: string;
  phone: string;
  phoneDialCode?: string;
  address1: string;
  address2?: string;
  city: string;
  state?: string;
  postcode?: string;
  country: string;
  [key: string]: any;
};

type InsuranceTier = "NONE" | "BASIC" | "STANDARD" | "PREMIUM";

type GoodsInfo = {
  category: string;
  declaredValueGBP: number;
  notes?: string;
  insurance: InsuranceTier;
};

type PackageInput = {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightKg: number;
};

type WizardData = {
  direction: Direction | null;
  sender: Party;
  recipient: Party;
  goods: GoodsInfo;
  pkg: PackageInput;
  phoneVerified: boolean;
  priceEstimate: number;
};

type BulkRow = {
  _row: number;
  direction: Direction;
  sender: Party;
  recipient: Party;
  goods: GoodsInfo;
  pkg: PackageInput;
  phoneVerified: boolean;
};

type BulkResult =
  | { ok: true; row: number; trackingRef: string }
  | { ok: false; row: number; error: string };

// ---------------- Helpers ----------------

function InfoTooltip({ content }: { content: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="inline-flex items-center justify-center w-4 h-4 text-xs bg-gray-200 text-gray-600 rounded-full hover:bg-gray-300 transition-colors"
      >
        ?
      </button>
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-[999]"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsOpen(false);
            }}
          />
          <div className="absolute left-0 top-6 z-[1000] w-96 max-w-[calc(100vw-2rem)] bg-white border-2 border-gray-300 rounded-xl shadow-2xl p-4 text-xs text-gray-700 whitespace-pre-line max-h-[80vh] overflow-y-auto">
            {content}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsOpen(false);
              }}
              className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function PhoneVerificationOTP({
  phoneDialCode,
  phoneNumber,
  onVerified,
}: {
  phoneDialCode: string;
  phoneNumber: string;
  onVerified: () => void;
}) {
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authForm, setAuthForm] = useState({ email: "", password: "" });
  const [authLoading, setAuthLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const phoneE164 = `+${phoneDialCode}${phoneNumber.replace(/\D/g, "")}`;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      setNeedsAuth(!user);
    });
    return () => unsubscribe();
  }, []);

  async function handleGoogleSignIn() {
    setAuthLoading(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(firebaseAuth, provider);
      setNeedsAuth(false);
      setInfo("Signed in successfully. You can now verify your phone.");
    } catch (e: any) {
      setError(e?.message || "Google sign-in failed.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthLoading(true);
    setError(null);

    try {
      const email = authForm.email.trim();
      const password = authForm.password;

      if (authMode === "signup") {
        await createUserWithEmailAndPassword(firebaseAuth, email, password);
        setInfo("Account created! You can now verify your phone.");
      } else {
        await signInWithEmailAndPassword(firebaseAuth, email, password);
        setInfo("Signed in successfully. You can now verify your phone.");
      }
      setNeedsAuth(false);
    } catch (e: any) {
      setError(e?.message || "Authentication failed.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function sendOtp() {
    setError(null);
    setInfo(null);

    if (!phoneNumber || phoneNumber.replace(/\D/g, "").length < 8) {
      return setError("Please enter a valid phone number.");
    }

    const u = firebaseAuth.currentUser;
    if (!u) {
      setNeedsAuth(true);
      return setError("Please sign in to verify your phone number.");
    }

    setSending(true);
    try {
      const token = await u.getIdToken();
      const res = await fetch("/api/business/phone/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ to: phoneE164.trim() }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to send OTP.");

      setSent(true);
      setInfo("OTP sent. Check your SMS.");
    } catch (e: any) {
      setError(e?.message || "Failed to send OTP.");
    } finally {
      setSending(false);
    }
  }

  async function verifyOtp() {
    setError(null);
    setInfo(null);

    if (!code.trim()) return setError("Enter the code you received.");

    const u = firebaseAuth.currentUser;
    if (!u) {
      setNeedsAuth(true);
      return setError("Please sign in to verify your phone number.");
    }

    setVerifying(true);
    try {
      const token = await u.getIdToken();
      const res = await fetch("/api/business/phone/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ to: phoneE164.trim(), code: code.trim() }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "OTP verification failed.");

      if (json.status !== "approved") {
        setError("Incorrect code. Try again.");
        return;
      }

      setInfo("Phone verified!");
      onVerified();
    } catch (e: any) {
      setError(e?.message || "OTP verification failed.");
    } finally {
      setVerifying(false);
    }
  }

  if (needsAuth) {
    return (
      <div className="space-y-4">
        {info && (
          <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            {info}
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="rounded-xl border border-gray-200 bg-gray-50 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Sign in required
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            Please sign in or create an account to verify your phone number.
          </p>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={authLoading}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm text-sm flex items-center justify-center gap-2 hover:border-[#d80000] hover:ring-2 hover:ring-[#d80000]/20 transition disabled:opacity-50 mb-3"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#EA4335"
                d="M12 10.2v3.9h5.4c-.2 1.2-1.6 3.6-5.4 3.6-3.2 0-5.8-2.7-5.8-6S8.8 5.8 12 5.8c1.8 0 3 .8 3.7 1.4l2.5-2.4C16.8 3.3 14.6 2.5 12 2.5 6.9 2.5 2.8 6.6 2.8 11.7S6.9 20.9 12 20.9c6.3 0 8.7-4.4 8.7-6.7 0-.5-.1-.9-.1-1H12z"
              />
            </svg>
            <span className="font-medium">Continue with Google</span>
          </button>

          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-300" />
            <div className="text-xs uppercase tracking-wide text-gray-500">
              or continue with email
            </div>
            <div className="h-px flex-1 bg-gray-300" />
          </div>

          <form onSubmit={handleEmailAuth} className="space-y-3">
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-1">
                Email
              </label>
              <input
                type="email"
                value={authForm.email}
                onChange={(e) =>
                  setAuthForm((f) => ({ ...f, email: e.target.value }))
                }
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[#d80000]/30"
                required
              />
            </div>

            <div className="relative">
              <label className="block text-sm font-semibold text-gray-900 mb-1">
                Password
              </label>
              <input
                type={showPassword ? "text" : "password"}
                value={authForm.password}
                onChange={(e) =>
                  setAuthForm((f) => ({ ...f, password: e.target.value }))
                }
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[#d80000]/30"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-9 text-xs text-gray-500 underline"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full rounded-xl bg-[#d80000] px-5 py-3 text-sm font-semibold text-white hover:bg-[#b80000] disabled:opacity-60"
            >
              {authLoading
                ? "Please wait..."
                : authMode === "signup"
                ? "Create account"
                : "Sign in"}
            </button>
          </form>

          <p className="text-sm text-gray-600 mt-4 text-center">
            {authMode === "signin" ? (
              <>
                New here?{" "}
                <button
                  type="button"
                  onClick={() => setAuthMode("signup")}
                  className="text-[#d80000] font-semibold underline"
                >
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => setAuthMode("signin")}
                  className="text-[#d80000] font-semibold underline"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {info && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {info}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={sendOtp}
          disabled={sending || !phoneNumber}
          className="inline-flex items-center justify-center rounded-xl bg-[#d80000] px-5 py-3 text-sm font-semibold text-white hover:bg-[#b80000] disabled:opacity-60"
        >
          {sending ? "Sending..." : sent ? "Resend code" : "Send code"}
        </button>

        <div className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600">
          If you don&apos;t receive it, try again in a minute.
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-900 mb-2">
          OTP code
        </label>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="123456"
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[#d80000]/30"
        />
      </div>

      <button
        type="button"
        onClick={verifyOtp}
        disabled={verifying || !code.trim()}
        className="w-full rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-60"
      >
        {verifying ? "Verifying..." : "Verify phone"}
      </button>
    </div>
  );
}

export default function CreateShipmentForm({
  embedded = false,
  onCreated,
  onBulkCompleted,
  onTrack,
  tenantSlug,
}: {
  embedded?: boolean;
  onCreated?: (trackingRef: string) => void;
  onBulkCompleted?: (results: BulkResult[]) => void;
  onTrack?: (trackingRef: string) => void;
  // Widget-specific: tenant context injected from URL params
  tenantSlug?: string;
}) {
  const router = useRouter();
  const bulkTopRef = useRef<HTMLDivElement | null>(null);

  const DIM_DIVISOR = 5000;
  const PER_KG_FEE = 7.0;

  const INSURANCE_RATES: Record<InsuranceTier, { percentage: number; min: number }> = {
    NONE: { percentage: 0, min: 0 },
    BASIC: { percentage: 0.0075, min: 5 },
    STANDARD: { percentage: 0.01, min: 5 },
    PREMIUM: { percentage: 0.02, min: 10 },
  };

  const CATEGORIES = [
    "Clothing",
    "Food (non-perishable)",
    "Electronics",
    "Documents",
    "Cosmetics",
    "Household",
    "Other",
  ];

  const UK_COUNTRIES = ["United Kingdom"];

  const AFRICAN_COUNTRIES = [
    "Nigeria",
    "Ghana",
    "Kenya",
    "South Africa",
    "Egypt",
    "Tanzania",
    "Uganda",
    "Ethiopia",
    "Morocco",
    "Senegal",
    "Rwanda",
    "Zambia",
    "Zimbabwe",
  ];

  const STEPS = [
    "Direction",
    "Item Details",
    "Get Quote",
    "Phone",
    "Review",
    "Payment",
  ] as const;

  const CSV_HEADERS = [
    "direction",
    "senderFullName",
    "senderEmail",
    "senderPhone",
    "senderAddress1",
    "senderAddress2",
    "senderCity",
    "senderState",
    "senderPostcode",
    "senderCountry",
    "recipientFullName",
    "recipientEmail",
    "recipientPhone",
    "recipientAddress1",
    "recipientAddress2",
    "recipientCity",
    "recipientState",
    "recipientPostcode",
    "recipientCountry",
    "category",
    "declaredValueGBP",
    "insurance",
    "lengthCm",
    "widthCm",
    "heightCm",
    "weightKg",
    "notes",
  ] as const;

  function resetForDirection(nextDir: Direction) {
    setStep(0);

    setData((d) => ({
      ...d,
      direction: nextDir,
      phoneVerified: false,
      sender: {
        ...d.sender,
        country:
          nextDir === "SHIP_TO_AFRICA"
            ? "United Kingdom"
            : d.sender.country || "Nigeria",
      },
      recipient: {
        ...d.recipient,
        country:
          nextDir === "SHIP_TO_AFRICA"
            ? d.recipient.country || "Nigeria"
            : "United Kingdom",
      },
    }));
  }

  function safeNum(v: any, fallback = 0) {
    const n = typeof v === "number" ? v : parseFloat(String(v ?? "").trim());
    return Number.isFinite(n) ? n : fallback;
  }

  function normStr(v: any) {
    return String(v ?? "").trim();
  }

  function routeLabel(fromCountry: string, toCountry: string) {
    const f = (fromCountry || "").trim();
    const t = (toCountry || "").trim();
    if (!f || !t) return "—";
    return `${f} → ${t}`;
  }

  function removeUndefined(obj: any): any {
    if (obj === null || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map(removeUndefined);

    const clean: any = {};
    for (const key in obj) {
      if (obj[key] !== undefined) {
        clean[key] = typeof obj[key] === "object" ? removeUndefined(obj[key]) : obj[key];
      }
    }
    return clean;
  }

  function makeTrackingRef() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
    return `TC-${y}${m}${day}-${rand}`;
  }

  function calcChargeableWeight(pkg: PackageInput) {
    const volKg = (pkg.lengthCm * pkg.widthCm * pkg.heightCm) / DIM_DIVISOR;
    return Math.max(pkg.weightKg, volKg);
  }

  function calcInsuranceFee(declaredValue: number, tier: InsuranceTier): number {
    const rate = INSURANCE_RATES[tier];
    if (!rate || rate.percentage === 0) return 0;
    const calculated = declaredValue * rate.percentage;
    return Math.max(calculated, rate.min);
  }

  function calcEstimate(cw: number, declaredValue: number, insurance: InsuranceTier) {
    const weightFee = cw * PER_KG_FEE;
    const insuranceFee = calcInsuranceFee(declaredValue, insurance);
    return weightFee + insuranceFee;
  }

  function parseCsv(text: string): { headers: string[]; rows: string[][] } {
    const rows: string[][] = [];
    let cur: string[] = [];
    let field = "";
    let inQuotes = false;

    const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    for (let i = 0; i < s.length; i++) {
      const ch = s[i];

      if (inQuotes) {
        if (ch === `"` && s[i + 1] === `"`) {
          field += `"`;
          i++;
        } else if (ch === `"`) {
          inQuotes = false;
        } else {
          field += ch;
        }
        continue;
      }

      if (ch === `"`) {
        inQuotes = true;
        continue;
      }

      if (ch === ",") {
        cur.push(field);
        field = "";
        continue;
      }

      if (ch === "\n") {
        cur.push(field);
        field = "";
        if (cur.some((x) => String(x).trim() !== "")) rows.push(cur);
        cur = [];
        continue;
      }

      field += ch;
    }

    cur.push(field);
    if (cur.some((x) => String(x).trim() !== "")) rows.push(cur);

    const headers = (rows[0] || []).map((h) => String(h ?? "").trim());
    const dataRows = rows.slice(1);

    return { headers, rows: dataRows };
  }

  function downloadTextFile(filename: string, text: string, mime = "text/plain") {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function validateInsurance(v: string): InsuranceTier | null {
    const x = v.trim().toUpperCase();
    if (x === "NONE" || x === "BASIC" || x === "STANDARD" || x === "PREMIUM")
      return x as InsuranceTier;
    return null;
  }

  function validateDirection(v: string): Direction | null {
    const x = v.trim().toUpperCase();
    if (x === "SHIP_TO_AFRICA" || x === "SHIP_TO_UK") return x as Direction;
    return null;
  }

  // Widget: notify parent page of events via postMessage
  function notifyParent(event: object) {
    if (typeof window !== "undefined") {
      window.parent.postMessage(event, "*");
    }
  }

  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);

  const [data, setData] = useState<WizardData>({
    direction: null,
    sender: {
      fullName: "",
      email: "",
      phone: "",
      address1: "",
      address2: "",
      city: "",
      state: "",
      postcode: "",
      country: "",
    },
    recipient: {
      fullName: "",
      email: "",
      phone: "",
      address1: "",
      address2: "",
      city: "",
      state: "",
      postcode: "",
      country: "",
      contentDescription: "",
    },
    goods: {
      category: "",
      declaredValueGBP: 0,
      notes: "",
      insurance: "NONE",
    },
    pkg: {
      lengthCm: 0,
      widthCm: 0,
      heightCm: 0,
      weightKg: 0,
    },
    phoneVerified: false,
    priceEstimate: 0,
  });

  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState<any>(null);

  const formContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(firebaseAuth, (u) => {
      setAuthUser(u || null);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const [authGateOpen, setAuthGateOpen] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");

  const pendingAfterAuthRef = useRef<
    null | { kind: "single" } | { kind: "bulk" }
  >(null);

  async function ensureUser(uid: string, email: string | null) {
    const ref = doc(db, "users", uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(
        ref,
        {
          email,
          role: "customer",
          status: "active",
          permissions: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
  }

  const chargeableWeight = useMemo(() => {
    return calcChargeableWeight(data.pkg);
  }, [data.pkg]);

  const estimate = useMemo(() => {
    return calcEstimate(chargeableWeight, data.goods.declaredValueGBP, data.goods.insurance);
  }, [chargeableWeight, data.goods.declaredValueGBP, data.goods.insurance]);

  useEffect(() => {
    setData((d) => ({
      ...d,
      priceEstimate: Number.isFinite(estimate)
        ? Number(estimate.toFixed(2))
        : 0,
    }));
  }, [estimate]);

  useEffect(() => {
    if (step === 5 && !clientSecret && data.priceEstimate > 0) {
      setPaymentLoading(true);
      const amount = Math.round(data.priceEstimate * 100);

      fetch("/api/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          currency: "gbp",
          metadata: {
            direction: data.direction,
            route: routeLabel(data.sender.country, data.recipient.country),
            tenantSlug,
          },
        }),
      })
        .then((res) => res.json())
        .then((result) => {
          if (result.clientSecret) {
            setClientSecret(result.clientSecret);
          } else {
            console.error("[PAYMENT_INTENT_ERROR]", result.error);
          }
        })
        .catch((err) => {
          console.error("[PAYMENT_INTENT_ERROR]", err);
        })
        .finally(() => {
          setPaymentLoading(false);
        });
    }
  }, [step, clientSecret, data.priceEstimate, data.direction, data.sender.country, data.recipient.country, tenantSlug]);

  function currentStepValid(s: number) {
    switch (s) {
      case 0: {
        if (!data.direction) return false;

        const sender = data.sender;
        const recipient = data.recipient;

        const senderValid = !!(
          sender.fullName &&
          sender.phone &&
          sender.address1 &&
          sender.city &&
          sender.country
        );

        const recipientValid = !!(
          recipient.fullName &&
          recipient.phone &&
          recipient.address1 &&
          recipient.city &&
          recipient.country
        );

        return senderValid && recipientValid;
      }
      case 1:
        return (
          data.pkg.lengthCm > 0 &&
          data.pkg.widthCm > 0 &&
          data.pkg.heightCm > 0 &&
          data.pkg.weightKg >= 5
        );
      case 2:
        return (
          !!data.goods.category &&
          data.goods.declaredValueGBP > 0 &&
          !!data.goods.insurance
        );
      case 3:
        return data.phoneVerified;
      case 4:
        return true;
      case 5:
        return !!clientSecret;
      default:
        return false;
    }
  }

  function next() {
    if (!currentStepValid(step)) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    setTimeout(() => {
      formContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }

  function back() {
    setStep((s) => Math.max(s - 1, 0));
    setTimeout(() => {
      formContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }

  // Widget: submit to Supabase via /api/widget/shipments instead of Firestore directly
  async function submitSingle() {
    if (!currentStepValid(5)) return;
    if (!authReady) return;

    if (!authUser) {
      setAuthEmail(data.sender.email || "");
      setAuthPassword("");
      setAuthMode(data.sender.email ? "signup" : "signin");
      pendingAfterAuthRef.current = { kind: "single" };
      setAuthGateOpen(true);
      return;
    }

    setSubmitting(true);
    try {
      await ensureUser(authUser.uid, authUser.email);

      const trackingRef = makeTrackingRef();
      const route = routeLabel(data.sender.country, data.recipient.country);
      const cw = calcChargeableWeight(data.pkg);

      const shipmentData = removeUndefined({
        trackingRef,
        direction: data.direction,
        route,
        status: "PENDING",
        sender: data.sender,
        recipient: data.recipient,
        goods: data.goods,
        pkg: data.pkg,
        phoneVerified: data.phoneVerified,
        priceEstimate: data.priceEstimate,
        chargeableWeight: Number(cw.toFixed(2)),
        assignedAgent: null,
        source: "widget",
        tenantSlug,
        createdByUid: authUser.uid,
        createdByEmail: authUser.email,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // TODO Phase 3: replace with POST /api/widget/shipments to write to tenant Supabase schema
      const shipmentDoc = await addDoc(collection(db, "shipments"), shipmentData);

      fetch("/api/shipments/generate-qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackingRef, shipmentId: shipmentDoc.id }),
      }).catch(() => {});

      // Fire postMessage event to parent page
      notifyParent({ type: "SHIPMENT_CREATED", trackingRef, shipmentId: shipmentDoc.id });

      onCreated?.(trackingRef);
      onTrack?.(trackingRef);
    } catch (e: any) {
      alert(e?.message || "Failed to create consignment");
      setSubmitting(false);
    }
  }

  const [bulkText, setBulkText] = useState<string>("");
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([]);
  const [bulkErrors, setBulkErrors] = useState<string[]>([]);
  const [bulkParsing, setBulkParsing] = useState(false);

  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkResults, setBulkResults] = useState<BulkResult[] | null>(null);

  const [bulkStep, setBulkStep] = useState<"upload" | "review" | "phone" | "payment" | "creating">("upload");
  const [bulkTotalAmount, setBulkTotalAmount] = useState(0);
  const [bulkPhoneVerified, setBulkPhoneVerified] = useState(false);
  const [bulkClientSecret, setBulkClientSecret] = useState<string | null>(null);
  const [bulkBatchRef, setBulkBatchRef] = useState<string | null>(null);
  const [bulkPhoneDialCode, setBulkPhoneDialCode] = useState("+44");
  const [bulkPhoneNumber, setBulkPhoneNumber] = useState("");

  function calculateBulkTotal(rows: BulkRow[]): number {
    return rows.reduce((total, row) => {
      const cw = calcChargeableWeight(row.pkg);
      const est = calcEstimate(cw, row.goods.declaredValueGBP, row.goods.insurance);
      return total + est;
    }, 0);
  }

  function parseBulkCsvText(text: string) {
    setBulkParsing(true);
    setBulkErrors([]);
    setBulkRows([]);
    setBulkResults(null);
    setBulkStep("upload");

    try {
      const { headers, rows } = parseCsv(text);

      const missing = CSV_HEADERS.filter((h) => !headers.includes(h));
      if (missing.length) {
        setBulkErrors([
          `CSV header mismatch. Missing columns: ${missing.join(", ")}`,
          `Expected header: ${CSV_HEADERS.join(", ")}`,
        ]);
        return;
      }

      const index: Record<string, number> = {};
      headers.forEach((h, i) => (index[h] = i));

      const out: BulkRow[] = [];
      const errs: string[] = [];

      for (let i = 0; i < rows.length; i++) {
        const rowNum = i + 1;
        const r = rows[i];

        const dir = validateDirection(normStr(r[index["direction"]]));
        if (!dir) {
          errs.push(`Row ${rowNum}: invalid direction (use SHIP_TO_AFRICA or SHIP_TO_UK).`);
          continue;
        }

        const insuranceRaw = normStr(r[index["insurance"]]);
        const ins = validateInsurance(insuranceRaw);
        if (!ins) {
          errs.push(`Row ${rowNum}: invalid insurance (${insuranceRaw}). Use NONE/BASIC/STANDARD/PREMIUM.`);
          continue;
        }

        const pkg: PackageInput = {
          lengthCm: safeNum(r[index["lengthCm"]], 0),
          widthCm: safeNum(r[index["widthCm"]], 0),
          heightCm: safeNum(r[index["heightCm"]], 0),
          weightKg: safeNum(r[index["weightKg"]], 0),
        };

        if (!(pkg.lengthCm > 0 && pkg.widthCm > 0 && pkg.heightCm > 0 && pkg.weightKg >= 5)) {
          errs.push(`Row ${rowNum}: package dimensions must be > 0, weight must be >= 5kg.`);
          continue;
        }

        const sender: Party = {
          fullName: normStr(r[index["senderFullName"]]),
          email: normStr(r[index["senderEmail"]]) || undefined,
          phone: normStr(r[index["senderPhone"]]),
          address1: normStr(r[index["senderAddress1"]]),
          address2: normStr(r[index["senderAddress2"]]) || undefined,
          city: normStr(r[index["senderCity"]]),
          state: normStr(r[index["senderState"]]) || undefined,
          postcode: normStr(r[index["senderPostcode"]]) || undefined,
          country: normStr(r[index["senderCountry"]]),
        };

        const recipient: Party = {
          fullName: normStr(r[index["recipientFullName"]]),
          email: normStr(r[index["recipientEmail"]]) || undefined,
          phone: normStr(r[index["recipientPhone"]]),
          address1: normStr(r[index["recipientAddress1"]]),
          address2: normStr(r[index["recipientAddress2"]]) || undefined,
          city: normStr(r[index["recipientCity"]]),
          state: normStr(r[index["recipientState"]]) || undefined,
          postcode: normStr(r[index["recipientPostcode"]]) || undefined,
          country: normStr(r[index["recipientCountry"]]),
          contentDescription: "",
        };

        if (!sender.fullName || !sender.phone || !sender.address1 || !sender.city || !sender.country) {
          errs.push(`Row ${rowNum}: sender required fields missing (fullName, phone, address1, city, country).`);
          continue;
        }
        if (!recipient.fullName || !recipient.phone || !recipient.address1 || !recipient.city || !recipient.country) {
          errs.push(`Row ${rowNum}: recipient required fields missing (fullName, phone, address1, city, country).`);
          continue;
        }

        const goods: GoodsInfo = {
          category: normStr(r[index["category"]]),
          declaredValueGBP: safeNum(r[index["declaredValueGBP"]], 0),
          insurance: ins,
          notes: normStr(r[index["notes"]]) || undefined,
        };

        if (!goods.category) {
          errs.push(`Row ${rowNum}: goods category is required.`);
          continue;
        }

        out.push({ _row: rowNum, direction: dir, sender, recipient, goods, pkg, phoneVerified: true });
      }

      if (errs.length) setBulkErrors(errs);
      setBulkRows(out);
    } finally {
      setBulkParsing(false);
    }
  }

  async function submitBulk() {
    if (!authReady) return;

    if (!bulkRows.length) {
      setBulkErrors(["No valid rows to submit. Upload a CSV first."]);
      return;
    }

    if (!authUser) {
      setAuthEmail("");
      setAuthPassword("");
      setAuthMode("signin");
      pendingAfterAuthRef.current = { kind: "bulk" };
      setAuthGateOpen(true);
      return;
    }

    setBulkSubmitting(true);
    setBulkResults(null);
    setBulkErrors([]);

    try {
      await ensureUser(authUser.uid, authUser.email);

      const results: BulkResult[] = [];
      const batchRef = bulkBatchRef ?? `BULK-${Date.now()}`;
      const trackingRefs: string[] = [];

      for (const row of bulkRows) {
        try {
          const trackingRef = makeTrackingRef();
          const route = routeLabel(row.sender.country, row.recipient.country);
          const cw = calcChargeableWeight(row.pkg);
          const est = calcEstimate(cw, row.goods.declaredValueGBP, row.goods.insurance);

          const shipmentData = removeUndefined({
            trackingRef,
            direction: row.direction,
            route,
            status: "PENDING",
            sender: row.sender,
            recipient: row.recipient,
            goods: row.goods,
            pkg: row.pkg,
            phoneVerified: row.phoneVerified,
            priceEstimate: Number(est.toFixed(2)),
            chargeableWeight: Number(cw.toFixed(2)),
            assignedAgent: null,
            batchRef,
            importSource: "BULK",
            source: "widget",
            tenantSlug,
            createdByUid: authUser.uid,
            createdByEmail: authUser.email,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          // TODO Phase 3: replace with POST /api/widget/shipments
          await addDoc(collection(db, "shipments"), shipmentData);
          trackingRefs.push(trackingRef);

          results.push({ ok: true, row: row._row, trackingRef });
        } catch (e: any) {
          results.push({ ok: false, row: row._row, error: e?.message || "Failed to create shipment" });
        }
      }

      if (trackingRefs.length > 0) {
        await setDoc(doc(db, "bulkRefMap", batchRef), {
          batchRef,
          trackingRefs,
          createdByUid: authUser.uid,
          createdByEmail: authUser.email,
          createdAt: serverTimestamp(),
        });
      }

      setBulkResults(results);
      onBulkCompleted?.(results);

      notifyParent({ type: "BULK_CREATED", batchRef, count: trackingRefs.length });

      router.push(`/payment/bulk-success?batch_ref=${encodeURIComponent(batchRef)}`);
    } finally {
      setBulkSubmitting(false);
    }
  }

  async function handleGoogleAuth() {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const res = await signInWithPopup(firebaseAuth, new GoogleAuthProvider());
      await ensureUser(res.user.uid, res.user.email);
      setAuthGateOpen(false);

      const pending = pendingAfterAuthRef.current;
      pendingAfterAuthRef.current = null;

      if (pending?.kind === "bulk") {
        await submitBulk();
      } else {
        await submitSingle();
      }
    } catch (e: any) {
      setAuthError(e?.message || "Google sign-in failed");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleEmailAuth() {
    if (!authEmail || !authPassword) {
      setAuthError("Email and password required");
      return;
    }

    setAuthBusy(true);
    setAuthError(null);
    try {
      const res =
        authMode === "signin"
          ? await signInWithEmailAndPassword(firebaseAuth, authEmail, authPassword)
          : await createUserWithEmailAndPassword(firebaseAuth, authEmail, authPassword);

      await ensureUser(res.user.uid, res.user.email);
      setAuthGateOpen(false);

      const pending = pendingAfterAuthRef.current;
      pendingAfterAuthRef.current = null;

      if (pending?.kind === "bulk") {
        await submitBulk();
      } else {
        await submitSingle();
      }
    } catch (e: any) {
      setAuthError(e?.message || "Authentication failed");
    } finally {
      setAuthBusy(false);
    }
  }

  const hasDirection = !!data.direction;

  const senderLabel =
    data.direction === "SHIP_TO_AFRICA" ? "Sender (UK)" : "Sender (Africa)";
  const recipientLabel =
    data.direction === "SHIP_TO_AFRICA"
      ? "Recipient (Africa)"
      : "Recipient (UK)";

  return (
    <div
      ref={formContainerRef}
      className={embedded ? "max-w-none p-0" : "mx-auto max-w-3xl p-4 sm:p-6"}
    >
      {/* Widget close button */}
      {embedded && (
        <div className="flex justify-end mb-2">
          <button
            type="button"
            onClick={() => notifyParent({ type: "WIDGET_CLOSE" })}
            className="text-gray-400 hover:text-gray-600 text-sm"
          >
            ✕ Close
          </button>
        </div>
      )}

      <div className="flex items-start justify-between gap-2 sm:gap-3 mb-4">
        <div className="flex-shrink min-w-0">
          <h1 className={embedded ? "text-base sm:text-xl font-semibold" : "text-lg sm:text-2xl lg:text-3xl font-semibold"}>
            Create Consignment
          </h1>
          <p className="text-xs sm:text-sm text-gray-600 mt-1 hidden sm:block">
            Single shipment wizard or bulk booking via CSV.
          </p>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          {hasDirection ? (
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span className="text-xs font-semibold text-gray-600 hidden sm:inline">
                Direction:
              </span>

              <button
                type="button"
                onClick={() => resetForDirection("SHIP_TO_AFRICA")}
                className={[
                  "rounded-lg border px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold transition",
                  data.direction === "SHIP_TO_AFRICA"
                    ? "bg-[#d80000] text-white border-[#d80000]"
                    : "bg-white hover:bg-gray-50 border-gray-300 text-gray-900",
                ].join(" ")}
              >
                UK → Africa
              </button>

              <button
                type="button"
                onClick={() => resetForDirection("SHIP_TO_UK")}
                className={[
                  "rounded-lg border px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold transition",
                  data.direction === "SHIP_TO_UK"
                    ? "bg-[#d80000] text-white border-[#d80000]"
                    : "bg-white hover:bg-gray-50 border-gray-300 text-gray-900",
                ].join(" ")}
              >
                Africa → UK
              </button>

              <button
                type="button"
                onClick={() => {
                  setStep(0);
                  setMode("single");
                  setData((d) => ({ ...d, direction: null, phoneVerified: false }));
                }}
                className="rounded-lg border border-gray-300 bg-white px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Clear
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setMode("single")}
                className={[
                  "rounded-lg border px-2 sm:px-3 py-1.5 sm:py-2 text-xs whitespace-nowrap leading-tight",
                  mode === "single" ? "bg-[#d80000] text-white border-[#d80000]" : "bg-white hover:bg-gray-50",
                ].join(" ")}
              >
                Single
              </button>

              <button
                type="button"
                onClick={() => setMode("bulk")}
                className={[
                  "rounded-lg border px-2 sm:px-3 py-1.5 sm:py-2 text-xs whitespace-nowrap leading-tight",
                  mode === "bulk" ? "bg-[#d80000] text-white border-[#d80000]" : "bg-white hover:bg-gray-50",
                ].join(" ")}
              >
                Bulk (CSV)
              </button>
            </>
          )}
        </div>
      </div>

      {mode === "bulk" ? (
        <div ref={bulkTopRef}>
          <Card title={bulkStep === "payment" || bulkStep === "creating" ? "" : "Bulk Booking (CSV upload)"}>
            <div className="text-sm text-gray-700 space-y-4">
              {(bulkStep === "upload" || bulkStep === "review" || bulkStep === "phone") && (
                <>
                  <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-white via-gray-50 to-white p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-[#b80000] font-semibold">
                          Bulk booking guide
                        </div>
                        <div className="text-sm font-semibold text-gray-900 mt-1">
                          Four quick steps
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-4">
                      {["Download template", "Fill details", "Upload CSV", "Review and create"].map((step, index) => (
                        <div key={step} className="rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
                          <div className="flex items-center gap-2">
                            <div className="h-6 w-6 rounded-full bg-[#d80000] text-white flex items-center justify-center text-xs font-semibold">
                              {index + 1}
                            </div>
                            <div className="text-xs font-medium text-gray-800">{step}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={() => {
                        const csv = CSV_HEADERS.join(",") + "\n" +
                          'SHIP_TO_AFRICA,John Doe,john@example.com,+447123456789,123 High Street,,London,,SW1A 1AA,United Kingdom,Jane Smith,jane@example.com,+2348012345678,456 Main Avenue,,Lagos,,100001,Nigeria,Documents,100,BASIC,30,20,10,5';
                        downloadTextFile("bulk-template.csv", csv, "text/csv");
                      }}
                    >
                      Download Template
                    </button>

                    <label className="btn-brand cursor-pointer">
                      Upload CSV
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        className="hidden"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          const text = await f.text();
                          setBulkText(text);
                          parseBulkCsvText(text);
                          e.target.value = "";
                        }}
                      />
                    </label>

                    {(bulkRows.length > 0 || bulkErrors.length > 0) && (
                      <button
                        type="button"
                        className="btn-outline text-gray-600"
                        onClick={() => {
                          setBulkRows([]);
                          setBulkErrors([]);
                          setBulkResults(null);
                          setBulkText("");
                        }}
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  {bulkErrors.length > 0 && (
                    <div className="mt-2 rounded-xl border border-red-200 bg-red-50 p-4">
                      <div className="text-sm font-semibold text-red-700 mb-2">Fix these issues</div>
                      <ul className="list-disc pl-5 text-sm text-red-700 space-y-1">
                        {bulkErrors.slice(0, 12).map((x, i) => (
                          <li key={i}>{x}</li>
                        ))}
                      </ul>
                      {bulkErrors.length > 12 && (
                        <div className="text-xs text-red-700 mt-2">…and {bulkErrors.length - 12} more.</div>
                      )}
                    </div>
                  )}
                </>
              )}

              {bulkRows.length > 0 && bulkStep === "upload" && (
                <div className="mt-4 space-y-4">
                  <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                    <div className="text-sm font-semibold text-green-800">CSV validated successfully</div>
                    <div className="text-xs text-green-700 mt-1">
                      {bulkRows.length} valid {bulkRows.length === 1 ? 'shipment' : 'shipments'} ready
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        const total = calculateBulkTotal(bulkRows);
                        setBulkTotalAmount(total);
                        if (bulkRows[0]) {
                          setBulkPhoneDialCode(bulkRows[0].sender.phoneDialCode || "44");
                          setBulkPhoneNumber("");
                        }
                        setBulkStep("review");
                      }}
                      className="btn-brand"
                    >
                      Continue to Review →
                    </button>
                  </div>
                </div>
              )}

              {bulkStep === "review" && bulkRows.length > 0 && (
                <div className="mt-4 space-y-4">
                  <div className="rounded-xl border border-gray-200 bg-white p-6">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">Review Bulk Shipments</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                      <div className="rounded-lg border bg-gray-50 p-3">
                        <div className="text-xs text-gray-600 mb-1">Total Shipments</div>
                        <div className="text-2xl font-bold text-gray-900">{bulkRows.length}</div>
                      </div>
                      <div className="rounded-lg border bg-gray-50 p-3">
                        <div className="text-xs text-gray-600 mb-1">Total Amount</div>
                        <div className="text-2xl font-bold text-[#d80000]">£{bulkTotalAmount.toFixed(2)}</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <button type="button" onClick={() => setBulkStep("upload")} className="btn-outline">
                      ← Back
                    </button>
                    <button type="button" onClick={() => setBulkStep("phone")} className="btn-brand">
                      Continue to Phone Verification →
                    </button>
                  </div>
                </div>
              )}

              {bulkStep === "phone" && bulkRows.length > 0 && (
                <div className="mt-4 space-y-4">
                  <div className="rounded-xl border border-gray-200 bg-white p-6">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">Phone Verification</h3>

                    {!bulkPhoneVerified ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Dial Code</label>
                            <select
                              value={bulkPhoneDialCode}
                              onChange={(e) => setBulkPhoneDialCode(e.target.value)}
                              className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm"
                            >
                              <option value="234">+234 (Nigeria)</option>
                              <option value="233">+233 (Ghana)</option>
                              <option value="44">+44 (United Kingdom)</option>
                              <option value="1">+1 (US/Canada)</option>
                            </select>
                          </div>
                          <div className="col-span-2">
                            <label className="block text-xs font-medium text-gray-700 mb-1">Phone Number</label>
                            <input
                              type="tel"
                              value={bulkPhoneNumber}
                              onChange={(e) => setBulkPhoneNumber(e.target.value)}
                              className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm"
                              placeholder="7312345678"
                            />
                          </div>
                        </div>

                        <PhoneVerificationOTP
                          phoneDialCode={bulkPhoneDialCode}
                          phoneNumber={bulkPhoneNumber}
                          onVerified={() => setBulkPhoneVerified(true)}
                        />
                      </div>
                    ) : (
                      <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                        <div className="text-sm font-semibold text-green-800">Phone Verified</div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <button type="button" onClick={() => setBulkStep("review")} className="btn-outline">
                      ← Back
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await fetch("/api/create-payment-intent", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ amount: Math.round(bulkTotalAmount * 100) }),
                        });
                        const data = await res.json();
                        if (data.clientSecret) {
                          setBulkBatchRef(`BULK-${Date.now()}`);
                          setBulkClientSecret(data.clientSecret);
                          setBulkStep("payment");
                        }
                      }}
                      disabled={!bulkPhoneVerified}
                      className="btn-brand disabled:opacity-40"
                    >
                      Continue to Payment →
                    </button>
                  </div>
                </div>
              )}

              {bulkStep === "payment" && bulkClientSecret && (
                <div className="mt-4">
                  <Elements stripe={stripePromise} options={{ clientSecret: bulkClientSecret }}>
                    <BulkPaymentForm
                      clientSecret={bulkClientSecret}
                      amount={Math.round(bulkTotalAmount * 100)}
                      batchRef={bulkBatchRef}
                      onSuccess={() => {
                        setBulkStep("creating");
                        submitBulk();
                      }}
                    />
                  </Elements>
                </div>
              )}

              {bulkStep === "creating" && bulkSubmitting && (
                <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-6">
                  <div className="text-lg font-bold text-blue-900">Creating Shipments...</div>
                  <div className="text-sm text-blue-700 mt-1">Please wait. Do not close this window.</div>
                </div>
              )}
            </div>
          </Card>
        </div>
      ) : (
        <>
          {!hasDirection && (
            <Card title="Where are you shipping?">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <BigTab
                  active={data.direction === "SHIP_TO_AFRICA"}
                  onClick={() => resetForDirection("SHIP_TO_AFRICA")}
                  title="Ship to Africa"
                  subtitle="Send from the UK to an African destination"
                />
                <BigTab
                  active={data.direction === "SHIP_TO_UK"}
                  onClick={() => resetForDirection("SHIP_TO_UK")}
                  title="Ship to the UK"
                  subtitle="Send from Africa to the UK"
                />
              </div>
            </Card>
          )}

          {hasDirection && (
            <div className="mb-4">
              <UnifiedStepper steps={[...STEPS]} activeIndex={step} onStepClick={(i) => setStep(i)} />
            </div>
          )}

          <div className="grid gap-4">
            {hasDirection && step === 0 && (
              <Card title="Sender & Recipient">
                {data.direction === "SHIP_TO_AFRICA" ? (
                  <>
                    <div className="pb-4">
                      <h3 className="text-base font-semibold mb-2">{senderLabel}</h3>
                      <PartyForm
                        value={data.sender}
                        direction={data.direction!}
                        side="sender"
                        onChange={(v) => setData((d) => ({ ...d, sender: v }))}
                      />
                    </div>
                    <div className="h-px bg-gray-200 my-4" />
                    <div className="pt-4">
                      <h3 className="text-base font-semibold mb-2">{recipientLabel}</h3>
                      <PartyForm
                        value={data.recipient}
                        direction={data.direction}
                        side="recipient"
                        onChange={(v) => setData((d) => ({ ...d, recipient: v }))}
                        showContentDescription
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="pb-4">
                      <h3 className="text-base font-semibold mb-2">{recipientLabel}</h3>
                      <PartyForm
                        value={data.recipient}
                        direction={data.direction!}
                        side="recipient"
                        onChange={(v) => setData((d) => ({ ...d, recipient: v }))}
                        showContentDescription
                      />
                    </div>
                    <div className="h-px bg-gray-200 my-4" />
                    <div className="pt-4">
                      <h3 className="text-base font-semibold mb-2">{senderLabel}</h3>
                      <PartyForm
                        value={data.sender}
                        direction={data.direction!}
                        side="sender"
                        onChange={(v) => setData((d) => ({ ...d, sender: v }))}
                      />
                    </div>
                  </>
                )}
              </Card>
            )}

            {hasDirection && step === 1 && (
              <Card title="Package Dimensions & Weight">
                <p className="text-gray-700 mb-4">
                  Enter package dimensions (cm) and weight (kg). We compare actual vs volumetric (L×W×H ÷ {DIM_DIVISOR}).
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <NumberInput label="Length (cm)" value={data.pkg.lengthCm} onChange={(n) => setData((d) => ({ ...d, pkg: { ...d.pkg, lengthCm: n } }))} />
                  <NumberInput label="Width (cm)" value={data.pkg.widthCm} onChange={(n) => setData((d) => ({ ...d, pkg: { ...d.pkg, widthCm: n } }))} />
                  <NumberInput label="Height (cm)" value={data.pkg.heightCm} onChange={(n) => setData((d) => ({ ...d, pkg: { ...d.pkg, heightCm: n } }))} />
                  <NumberInput label="Weight (kg)" value={data.pkg.weightKg} placeholder="Min: 5kg" min={5} onChange={(n) => setData((d) => ({ ...d, pkg: { ...d.pkg, weightKg: n } }))} />
                </div>

                <div className="mt-4 rounded-2xl border bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-gray-600">Chargeable Weight</div>
                      <div className="text-xl font-semibold">{chargeableWeight.toFixed(2)} kg</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-600">Estimated Total</div>
                      <div className="text-2xl font-bold">£{estimate > 0 ? estimate.toFixed(2) : "0.00"}</div>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {hasDirection && step === 2 && (
              <Card title="Category of Goods & Insurance">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Select
                    label="Category of Goods"
                    value={data.goods.category}
                    onChange={(v) => setData((d) => ({ ...d, goods: { ...d.goods, category: v } }))}
                    options={["", ...CATEGORIES]}
                  />
                  <div>
                    <label className="block">
                      <div className="text-sm mb-1 text-gray-700 flex items-center gap-1">
                        Declared Value (GBP)
                        <InfoTooltip content="The total value of goods you're shipping. Accurate value must be declared." />
                      </div>
                      <input
                        inputMode="decimal"
                        type="number"
                        value={data.goods.declaredValueGBP > 0 ? data.goods.declaredValueGBP : ""}
                        placeholder="0"
                        onChange={(e) => setData((d) => ({ ...d, goods: { ...d.goods, declaredValueGBP: parseFloat(e.target.value || "0") } }))}
                        className="field"
                      />
                    </label>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-sm mb-2 text-gray-700">Insurance Options</div>
                  <InsuranceTabs
                    value={data.goods.insurance}
                    onChange={(v) => setData((d) => ({ ...d, goods: { ...d.goods, insurance: v } }))}
                  />
                </div>

                <Textarea
                  label="Notes (optional)"
                  placeholder="Any special handling notes?"
                  value={data.goods.notes || ""}
                  onChange={(v) => setData((d) => ({ ...d, goods: { ...d.goods, notes: v } }))}
                />
              </Card>
            )}

            {hasDirection && step === 3 && (
              <Card title="Phone Number Verification">
                {!data.phoneVerified ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-2">
                        Sender Phone (reconfirm)
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <select
                          value={data.sender.phoneDialCode || "44"}
                          onChange={(e) => setData((d) => ({ ...d, sender: { ...d.sender, phoneDialCode: e.target.value } }))}
                          className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[#d80000]/30"
                        >
                          <option value="234">+234 (Nigeria)</option>
                          <option value="233">+233 (Ghana)</option>
                          <option value="44">+44 (United Kingdom)</option>
                          <option value="1">+1 (US/Canada)</option>
                        </select>
                        <input
                          value={data.sender.phone}
                          onChange={(e) => setData((d) => ({ ...d, sender: { ...d.sender, phone: e.target.value.replace(/\D/g, "") } }))}
                          placeholder="7123456789"
                          className="sm:col-span-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[#d80000]/30"
                        />
                      </div>
                    </div>
                    <PhoneVerificationOTP
                      phoneDialCode={data.sender.phoneDialCode || "44"}
                      phoneNumber={data.sender.phone}
                      onVerified={() => setData((d) => ({ ...d, phoneVerified: true }))}
                    />
                  </div>
                ) : (
                  <div className="rounded-xl border bg-green-50 border-green-200 p-3 text-green-800 text-sm">
                    Phone verified.
                  </div>
                )}
              </Card>
            )}

            {hasDirection && step === 4 && (
              <Card title="Review & Submit">
                <div className="space-y-3 text-sm">
                  <SummaryRow label="Direction" value={data.direction === "SHIP_TO_AFRICA" ? "UK → Africa" : "Africa → UK"} />
                  <SummaryRow label="Sender" value={`${data.sender.fullName || "-"}, ${data.sender.country}`} />
                  <SummaryRow label="Recipient" value={`${data.recipient.fullName || "-"}, ${data.recipient.country}`} />
                  <SummaryRow label="Goods" value={`${data.goods.category || "-"} (£${data.goods.declaredValueGBP})`} />
                  <SummaryRow label="Insurance" value={data.goods.insurance} />
                  <SummaryRow label="Chargeable Weight" value={`${chargeableWeight.toFixed(2)} kg`} />

                  <div className="rounded-xl border p-3 bg-white">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-gray-600 font-medium">Amount Breakdown</div>
                      <div className="font-semibold">£{estimate.toFixed(2)}</div>
                    </div>
                    <div className="space-y-1.5 text-xs text-gray-600">
                      <div className="flex justify-between">
                        <span>Per kg ({chargeableWeight.toFixed(2)} kg × £{PER_KG_FEE})</span>
                        <span>£{(chargeableWeight * PER_KG_FEE).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Insurance ({data.goods.insurance})</span>
                        <span>£{calcInsuranceFee(data.goods.declaredValueGBP, data.goods.insurance).toFixed(2)}</span>
                      </div>
                      <div className="h-px bg-gray-200 my-1" />
                      <div className="flex justify-between font-semibold text-gray-900">
                        <span>Total</span>
                        <span>£{estimate.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {hasDirection && step === 5 && (
              <Card title="Secure Payment">
                {paymentLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#d80000]"></div>
                  </div>
                ) : clientSecret ? (
                  <StripePaymentForm
                    clientSecret={clientSecret}
                    onSuccess={(trackingRef) => {
                      notifyParent({ type: "SHIPMENT_CREATED", trackingRef });
                      onCreated?.(trackingRef);
                      onTrack?.(trackingRef);
                    }}
                    amount={Math.round(data.priceEstimate * 100)}
                    onCreateShipment={async () => {
                      if (!authUser) throw new Error("Not authenticated");

                      await ensureUser(authUser.uid, authUser.email);

                      const trackingRef = makeTrackingRef();
                      const route = routeLabel(data.sender.country, data.recipient.country);
                      const cw = calcChargeableWeight(data.pkg);

                      const shipmentData = removeUndefined({
                        trackingRef,
                        direction: data.direction,
                        route,
                        status: "PENDING",
                        sender: data.sender,
                        recipient: data.recipient,
                        goods: data.goods,
                        pkg: data.pkg,
                        phoneVerified: data.phoneVerified,
                        priceEstimate: data.priceEstimate,
                        chargeableWeight: Number(cw.toFixed(2)),
                        assignedAgent: null,
                        source: "widget",
                        tenantSlug,
                        createdByUid: authUser.uid,
                        createdByEmail: authUser.email,
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                      });

                      // TODO Phase 3: replace with POST /api/widget/shipments
                      const shipmentDoc = await addDoc(collection(db, "shipments"), shipmentData);

                      fetch("/api/shipments/generate-qr", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ trackingRef, shipmentId: shipmentDoc.id }),
                      }).catch(() => {});

                      return trackingRef;
                    }}
                  />
                ) : (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-red-700">
                    Failed to initialize payment. Please try again.
                  </div>
                )}
              </Card>
            )}
          </div>

          {hasDirection && (
            <div className="mt-6 flex items-center justify-between">
              <button
                type="button"
                onClick={back}
                disabled={step === 0}
                className="btn-outline disabled:opacity-40"
              >
                Back
              </button>
              <div className="flex items-center gap-3">
                {step < STEPS.length - 1 ? (
                  <button
                    type="button"
                    onClick={next}
                    disabled={!currentStepValid(step)}
                    className="btn-brand disabled:opacity-40"
                  >
                    {step === 4 ? "Proceed to Payment" : "Continue"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={submitSingle}
                    disabled={submitting}
                    className="btn-brand"
                  >
                    {submitting ? "Processing..." : "Pay"}
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {authGateOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold mb-2">Sign in to continue</h3>
            <p className="text-sm text-gray-600 mb-4">
              You must be signed in to submit shipments.
            </p>

            <div className="flex items-center gap-2 mb-3">
              <button
                type="button"
                className={["rounded-lg border px-3 py-2 text-sm", authMode === "signin" ? "bg-gray-100" : "bg-white"].join(" ")}
                onClick={() => setAuthMode("signin")}
              >
                Sign in
              </button>
              <button
                type="button"
                className={["rounded-lg border px-3 py-2 text-sm", authMode === "signup" ? "bg-gray-100" : "bg-white"].join(" ")}
                onClick={() => setAuthMode("signup")}
              >
                Create account
              </button>
            </div>

            <button onClick={handleGoogleAuth} disabled={authBusy} className="w-full rounded-lg border px-4 py-2 mb-3">
              Continue with Google
            </button>

            <input className="field mb-2" placeholder="Email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} />
            <input className="field mb-2" type="password" placeholder="Password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} />

            {authError && <div className="text-sm text-red-600 mb-2">{authError}</div>}

            <button onClick={handleEmailAuth} disabled={authBusy} className="w-full rounded-lg bg-[#d80000] text-white py-2">
              {authMode === "signup" ? "Create account & continue" : "Sign in & continue"}
            </button>

            <button
              type="button"
              onClick={() => { pendingAfterAuthRef.current = null; setAuthGateOpen(false); }}
              className="mt-3 w-full text-sm text-gray-600 underline"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- Reusable UI ----------------

function StripePaymentForm({
  clientSecret,
  onSuccess,
  amount,
  onCreateShipment,
}: {
  clientSecret: string;
  onSuccess: (trackingRef: string) => void;
  amount: number;
  onCreateShipment: () => Promise<string>;
}) {
  const options = {
    clientSecret,
    appearance: { theme: 'stripe' as const, variables: { colorPrimary: '#d80000' } },
  };

  return (
    <Elements stripe={stripePromise} options={options}>
      <StripeCheckoutFormInner onSuccess={onSuccess} amount={amount} onCreateShipment={onCreateShipment} />
    </Elements>
  );
}

function StripeCheckoutFormInner({
  onSuccess,
  amount,
  onCreateShipment,
}: {
  onSuccess: (trackingRef: string) => void;
  amount: number;
  onCreateShipment: () => Promise<string>;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const sanitizeErrorMessage = (message: string | undefined): string => {
    if (!message) return "Payment failed";
    let cleaned = message.replace(/\.\s*Your request was in live mode.*$/i, '.');
    cleaned = cleaned.replace(/\s*Your request was in live mode.*$/i, '');
    return cleaned;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);
    setError(null);

    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setError(sanitizeErrorMessage(submitError.message) || "Validation failed");
        setProcessing(false);
        return;
      }

      const { error: paymentError } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: `${window.location.origin}/payment/success` },
        redirect: "if_required",
      });

      if (paymentError) {
        setError(sanitizeErrorMessage(paymentError.message) || "Payment failed");
        setProcessing(false);
        return;
      }

      const trackingRef = await onCreateShipment();
      onSuccess(trackingRef);
    } catch (err: any) {
      console.error("[PAYMENT_ERROR]", err);
      setError(err?.message || "An unexpected error occurred");
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-xl border-2 border-red-200 bg-red-50 p-3">
          <h3 className="text-sm font-semibold text-red-800">Payment Failed</h3>
          <p className="text-sm text-red-700 mt-1">{error}</p>
        </div>
      )}

      <PaymentElement />

      <button
        type="submit"
        disabled={!stripe || processing}
        className="w-full bg-[#d80000] text-white py-3 rounded-xl font-semibold hover:bg-[#b80000] transition disabled:opacity-60"
      >
        {processing ? "Processing..." : `Pay £${(amount / 100).toFixed(2)}`}
      </button>
    </form>
  );
}

function UnifiedStepper({ steps, activeIndex, onStepClick }: { steps: string[]; activeIndex: number; onStepClick?: (i: number) => void }) {
  return (
    <div className="rounded-2xl border bg-white p-2 shadow-sm">
      <ol className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {steps.map((label, i) => {
          const done = i < activeIndex;
          const active = i === activeIndex;
          return (
            <li key={i}>
              <button
                type="button"
                disabled={i > activeIndex}
                onClick={() => onStepClick?.(i)}
                className={[
                  "w-full rounded-xl border px-2 py-2 text-left transition-colors font-medium text-xs sm:text-sm",
                  active ? "bg-[#d80000] text-white border-[#d80000]" : done ? "bg-[#d80000]/10 border-[#d80000]/30 text-[#d80000]" : "bg-gray-50 hover:bg-gray-100 border-gray-200",
                ].join(" ")}
              >
                <div className="flex items-center gap-1.5">
                  <span className={["h-2 w-2 rounded-full flex-shrink-0", active || done ? "bg-white" : "bg-gray-300"].join(" ")} />
                  <span className="whitespace-nowrap overflow-hidden text-ellipsis">{label}</span>
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-white p-4 sm:p-6 shadow-sm">
      {title ? <h2 className="text-lg font-semibold mb-3">{title}</h2> : null}
      {children}
    </div>
  );
}

function BigTab({ active, title, subtitle, onClick }: { active: boolean; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={["rounded-2xl border p-4 text-left transition", active ? "border-[#d80000] bg-[#d80000]/5" : "hover:bg-gray-50"].join(" ")}
    >
      <div className="font-semibold">{title}</div>
      <div className="text-sm text-gray-600 mt-1">{subtitle}</div>
    </button>
  );
}

function PartyForm({ value, onChange, direction, side, showContentDescription }: { value: Party; onChange: (v: Party) => void; direction: Direction; side: "sender" | "recipient"; showContentDescription?: boolean }) {
  const getCountryOptions = (): string[] => {
    const UK = ["United Kingdom"];
    const AFRICA = ["Nigeria", "Ghana", "Kenya", "South Africa", "Egypt", "Tanzania", "Uganda", "Ethiopia", "Morocco", "Senegal", "Rwanda", "Zambia", "Zimbabwe"];
    if (direction === "SHIP_TO_AFRICA") return side === "sender" ? UK : AFRICA;
    return side === "sender" ? AFRICA : UK;
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Input label="Full name" value={value.fullName} onChange={(v) => onChange({ ...value, fullName: v })} />
      <Input label="Email" value={value.email || ""} onChange={(v) => onChange({ ...value, email: v })} />
      <Input label="Phone" value={value.phone} onChange={(v) => onChange({ ...value, phone: v })} />
      <Input label="Address 1" value={value.address1} onChange={(v) => onChange({ ...value, address1: v })} />
      <Input label="Address 2" value={value.address2 || ""} onChange={(v) => onChange({ ...value, address2: v })} />
      <Input label="City" value={value.city} onChange={(v) => onChange({ ...value, city: v })} />
      <Input label="State/Region" value={value.state || ""} onChange={(v) => onChange({ ...value, state: v })} />
      <Input label="Postcode" value={value.postcode || ""} onChange={(v) => onChange({ ...value, postcode: v })} />
      <Select label="Country" value={value.country} onChange={(v) => onChange({ ...value, country: v })} options={["", ...getCountryOptions()]} />
      {showContentDescription && side === "recipient" && (
        <Textarea label="Content description (optional)" placeholder="e.g. clothes, shoes, documents..." value={String(value.contentDescription || "")} onChange={(v) => onChange({ ...value, contentDescription: v })} />
      )}
    </div>
  );
}

function InsuranceTabs({ value, onChange }: { value: InsuranceTier; onChange: (v: InsuranceTier) => void }) {
  const options = [
    { tier: "NONE" as InsuranceTier, title: "No Coverage", rate: "£0", coverage: "None" },
    { tier: "BASIC" as InsuranceTier, title: "Basic", rate: "0.75%", coverage: "Up to 50% of declared value" },
    { tier: "STANDARD" as InsuranceTier, title: "Standard", rate: "1%", coverage: "Up to 100% of declared value", recommended: true },
    { tier: "PREMIUM" as InsuranceTier, title: "Premium", rate: "2%", coverage: "Up to 150% of declared value" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {options.map((option) => (
        <button
          type="button"
          key={option.tier}
          onClick={() => onChange(option.tier)}
          className={["rounded-xl border-2 p-3 text-center transition-all relative", value === option.tier ? "border-[#d80000] ring-2 ring-[#d80000]/20 bg-[#d80000]/5" : "border-gray-200 bg-white"].join(" ")}
        >
          {option.recommended && (
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-green-600 text-white text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap">
              ⭐ Recommended
            </div>
          )}
          <div className="font-bold text-gray-900 text-sm mb-1">{option.title}</div>
          <div className="text-lg font-bold text-[#4a1d96] mb-1">{option.rate}</div>
          <div className="text-xs text-gray-600">{option.coverage}</div>
        </button>
      ))}
    </div>
  );
}

function Input({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <label className="block">
      <div className="text-sm mb-1 text-gray-700">{label}</div>
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="field" />
    </label>
  );
}

function NumberInput({ label, value, onChange, placeholder = "0", min }: { label: string; value: number; onChange: (n: number) => void; placeholder?: string; min?: number }) {
  return (
    <label className="block">
      <div className="text-sm mb-1 text-gray-700">{label}</div>
      <input inputMode="decimal" type="number" value={value > 0 ? value : ""} placeholder={placeholder} min={min} onChange={(e) => onChange(parseFloat(e.target.value || "0"))} className="field" />
    </label>
  );
}

function Textarea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block sm:col-span-2">
      <div className="text-sm mb-1 text-gray-700">{label}</div>
      <textarea value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="field min-h-[90px]" />
    </label>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <label className="block">
      <div className="text-sm mb-1 text-gray-700">{label}</div>
      <div className="relative">
        <select value={value} onChange={(e) => onChange(e.target.value)} className="field appearance-none pr-10">
          {options.map((o, idx) => (
            <option key={idx} value={o} disabled={idx === 0 && o === ""}>{idx === 0 && o === "" ? "Select..." : o}</option>
          ))}
        </select>
        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400">▾</span>
      </div>
    </label>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border p-3 bg-white">
      <div className="text-gray-600">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
