"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

import BulkPaymentForm from "@/components/payments/BulkPaymentForm";
import { db } from "@/lib/firebaseConfig";
import { getAddressSchema } from "@/lib/shipmentAddress";
import { createTranslator } from "@/lib/shipmentMessages";
import { calculateShipmentPricing, toMinorUnits } from "@/lib/shipmentPricing";
import {
  DEFAULT_TENANT_CONFIG,
  displayCountryName,
  getDialCodeForCountry,
  type CountryOption,
  type CorridorConfig,
  type SupportedLanguage,
  type TenantConfig,
} from "@/lib/shipmentTenantConfig";
import {
  buildWidgetShipmentPayload,
  findCorridor,
  formatPhoneE164,
  isPhoneValidForCountry,
  validateShipmentDraft,
  type CustomsDeclarationInput,
  type CustomsItemInput,
  type GoodsInput,
  type PartyInput,
  type ShipmentDraftInput,
  type WidgetShipmentPayload,
} from "@/lib/shipmentValidation";

type BulkResult =
  | { ok: true; row: number; trackingRef: string }
  | { ok: false; row: number; error: string };

type BulkDraft = ShipmentDraftInput & { _row: number };

type StepKey = "addresses" | "package" | "goods" | "customs" | "phone" | "review" | "payment";

type StripePaymentSession = {
  provider: "stripe";
  clientSecret: string;
  publishableKey: string;
  currency: string;
  amountMinor: number;
};

type PaystackPaymentSession = {
  provider: "paystack";
  accessCode: string;
  reference: string;
  publicKey: string;
  authorizationUrl: string;
  currency: string;
  amountMinor: number;
};

type PaymentSession = StripePaymentSession | PaystackPaymentSession;

type PaymentConfirmation = {
  success?: boolean;
  status?: "success" | "pending" | "failed";
  trackingRef?: string | null;
  shipmentId?: string | null;
  shipments?: Array<{ trackingRef: string; shipmentId: string }>;
  error?: string;
};

const BRAND_STYLE = {
  "--stripe-color-primary": "var(--brand-primary)",
} as CSSProperties;

function emptyParty(country = ""): PartyInput {
  return {
    fullName: "",
    email: "",
    phone: "",
    address1: "",
    address2: "",
    city: "",
    state: "",
    postcode: "",
    country,
  };
}

function emptyCustoms(country = ""): CustomsDeclarationInput {
  return {
    type: "DDU",
    reasonForExport: "",
    items: [emptyCustomsItem(country)],
  };
}

function emptyCustomsItem(country = ""): CustomsItemInput {
  return {
    description: "",
    hsCode: "",
    quantity: 1,
    declaredValue: 0,
    countryOfOrigin: country,
  };
}

function createDraftForCorridor(corridor: CorridorConfig | null): ShipmentDraftInput {
  const origin = corridor?.originCountry ?? "";
  const destination = corridor?.destinationCountry ?? "";
  return {
    corridorId: corridor?.id ?? "",
    sender: emptyParty(origin),
    recipient: { ...emptyParty(destination), contentDescription: "" },
    goods: {
      category: "",
      declaredValue: 0,
      insurance: "NONE",
      notes: "",
    },
    pkg: {
      lengthCm: 0,
      widthCm: 0,
      heightCm: 0,
      weightKg: 0,
    },
    phoneVerified: false,
    customs: emptyCustoms(origin),
  };
}

function sanitizeNumber(value: string): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function postMessageToHost(event: object) {
  if (typeof window !== "undefined") {
    window.parent.postMessage(event, "*");
  }
}

async function postShipment(
  payload: WidgetShipmentPayload,
  widgetToken: string,
): Promise<{ trackingRef: string; shipmentId: string }> {
  const res = await fetch("/api/widget/shipments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${widgetToken}`,
    },
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => ({}))) as { trackingRef?: string; shipmentId?: string; error?: string };
  if (!res.ok || !json.trackingRef || !json.shipmentId) {
    throw new Error(json.error ?? `Shipment API error: ${res.status}`);
  }
  return { trackingRef: json.trackingRef, shipmentId: json.shipmentId };
}

async function fetchTenantConfig(widgetToken: string): Promise<TenantConfig> {
  const res = await fetch("/api/widget/config", {
    headers: { Authorization: `Bearer ${widgetToken}` },
  });
  const json = (await res.json().catch(() => ({}))) as { tenantConfig?: TenantConfig; error?: string };
  if (!res.ok || !json.tenantConfig) {
    throw new Error(json.error ?? "Tenant config unavailable");
  }
  return json.tenantConfig;
}

async function confirmPaystackPayment(
  session: PaystackPaymentSession,
  widgetToken: string | undefined,
): Promise<PaymentConfirmation> {
  const res = await fetch("/api/payment/confirm", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(widgetToken ? { Authorization: `Bearer ${widgetToken}` } : {}),
    },
    body: JSON.stringify({
      provider: "paystack",
      reference: session.reference,
      amountMinor: session.amountMinor,
      currency: session.currency,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as PaymentConfirmation;
  if (!res.ok || !json.success) {
    throw new Error(json.error ?? "Payment could not be confirmed");
  }
  return json;
}

function useMoneyFormatter(locale: string, currency: string) {
  return useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
      }),
    [locale, currency],
  );
}

function useNumberFormatter(locale: string) {
  return useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }), [locale]);
}

export default function CreateShipmentForm({
  embedded = false,
  onCreated,
  onBulkCompleted,
  onTrack,
  tenantSlug,
  widgetToken,
  tenantConfig,
  suppressSuccessView = false,
}: {
  embedded?: boolean;
  onCreated?: (trackingRef: string) => void;
  onBulkCompleted?: (results: BulkResult[]) => void;
  onTrack?: (trackingRef: string) => void;
  tenantSlug?: string;
  widgetToken?: string;
  tenantConfig?: TenantConfig;
  suppressSuccessView?: boolean;
}) {
  const formRef = useRef<HTMLDivElement | null>(null);
  const [config, setConfig] = useState<TenantConfig>(tenantConfig ?? DEFAULT_TENANT_CONFIG);
  const [configError, setConfigError] = useState<string | null>(null);
  const [locale, setLocale] = useState(tenantConfig?.locale ?? DEFAULT_TENANT_CONFIG.locale);
  const language = config.supportedLanguages.find((item) => item.locale === locale) ?? config.supportedLanguages[0];
  const dir = language?.textDirection ?? config.textDirection;
  const t = useMemo(() => createTranslator(locale), [locale]);
  const money = useMoneyFormatter(locale, config.currency);
  const number = useNumberFormatter(locale);
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<ShipmentDraftInput>(() => createDraftForCorridor(config.corridors[0] ?? null));
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ trackingRef: string; shipmentId: string } | null>(null);
  const [paymentSession, setPaymentSession] = useState<PaymentSession | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [bulkRows, setBulkRows] = useState<BulkDraft[]>([]);
  const [bulkErrors, setBulkErrors] = useState<string[]>([]);
  const [bulkStep, setBulkStep] = useState<"upload" | "review" | "phone" | "payment" | "creating" | "complete">("upload");
  const [bulkPhoneVerified, setBulkPhoneVerified] = useState(false);
  const [bulkPaymentSession, setBulkPaymentSession] = useState<PaymentSession | null>(null);
  const [bulkBatchRef, setBulkBatchRef] = useState<string | null>(null);
  const [bulkResults, setBulkResults] = useState<BulkResult[]>([]);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  useEffect(() => {
    if (tenantConfig) {
      setConfig(tenantConfig);
      setLocale(tenantConfig.locale);
      return;
    }
    if (!widgetToken) return;

    let active = true;
    fetchTenantConfig(widgetToken)
      .then((nextConfig) => {
        if (!active) return;
        setConfig(nextConfig);
        setLocale(nextConfig.locale);
        setConfigError(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setConfigError(error instanceof Error ? error.message : "Tenant config unavailable");
      });

    return () => {
      active = false;
    };
  }, [tenantConfig, widgetToken]);

  useEffect(() => {
    const current = findCorridor(config, draft.corridorId);
    if (current) return;
    const next = config.corridors[0] ?? null;
    setDraft(createDraftForCorridor(next));
    setStep(0);
    setPaymentSession(null);
  }, [config, draft.corridorId]);

  const corridor = useMemo(() => findCorridor(config, draft.corridorId), [config, draft.corridorId]);
  const customsRequired = Boolean(corridor?.customsRequired);
  const steps: StepKey[] = customsRequired
    ? ["addresses", "package", "goods", "customs", "phone", "review", "payment"]
    : ["addresses", "package", "goods", "phone", "review", "payment"];
  const activeStep = steps[step] ?? steps[0];
  const pricing = useMemo(
    () => calculateShipmentPricing(draft.pkg, draft.goods.declaredValue, draft.goods.insurance, config),
    [config, draft.goods.declaredValue, draft.goods.insurance, draft.pkg],
  );
  const stripePromise = useMemo(
    () => (config.paymentGateway.publishableKey ? loadStripe(config.paymentGateway.publishableKey) : null),
    [config.paymentGateway.publishableKey],
  );

  useEffect(() => {
    setPaymentSession(null);
    setPaymentError(null);
  }, [draft, config.currency]);

  function scrollTop() {
    window.setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  function selectCorridor(corridorId: string) {
    const nextCorridor = findCorridor(config, corridorId);
    setDraft(createDraftForCorridor(nextCorridor));
    setStep(0);
    setSuccess(null);
    setPaymentSession(null);
  }

  function updateSender(next: PartyInput) {
    setDraft((current) => ({ ...current, sender: next, phoneVerified: false }));
  }

  function updateRecipient(next: PartyInput) {
    setDraft((current) => ({ ...current, recipient: next }));
  }

  function stepValid(stepKey: StepKey): boolean {
    if (!corridor) return false;
    if (stepKey === "addresses") {
      return (
        partyValid(draft.sender) &&
        partyValid(draft.recipient) &&
        (config.paymentGateway.provider !== "PAYSTACK" || validEmail(draft.sender.email)) &&
        draft.sender.country === corridor.originCountry &&
        draft.recipient.country === corridor.destinationCountry
      );
    }
    if (stepKey === "package") {
      return draft.pkg.lengthCm > 0 && draft.pkg.widthCm > 0 && draft.pkg.heightCm > 0 && draft.pkg.weightKg >= 5;
    }
    if (stepKey === "goods") {
      const category = config.allowedCategories.find((item) => item.key === draft.goods.category);
      return Boolean(category && category.status !== "blocked" && draft.goods.declaredValue > 0 && draft.goods.insurance);
    }
    if (stepKey === "customs") {
      if (!customsRequired) return true;
      return (
        draft.customs.reasonForExport.trim().length > 0 &&
        draft.customs.items.length > 0 &&
        draft.customs.items.every(
          (item) =>
            item.description.trim() &&
            item.hsCode.trim() &&
            item.quantity > 0 &&
            item.declaredValue > 0 &&
            item.countryOfOrigin.trim(),
        )
      );
    }
    if (stepKey === "phone") return draft.phoneVerified;
    if (stepKey === "review") return true;
    return Boolean(paymentSession);
  }

  function partyValid(party: PartyInput): boolean {
    if (!party.fullName.trim() || !party.country || !isPhoneValidForCountry(party.phone, party.country)) return false;
    return getAddressSchema(party.country).fields
      .filter((field) => field.required)
      .every((field) => party[field.key].trim().length > 0);
  }

  function next() {
    if (!stepValid(activeStep)) return;
    setStep((current) => Math.min(current + 1, steps.length - 1));
    scrollTop();
  }

  function back() {
    setStep((current) => Math.max(current - 1, 0));
    scrollTop();
  }

  async function createPaymentSession(rows: ShipmentDraftInput[], options: { mode: "single" | "bulk"; batchRef?: string | null }) {
    if (!widgetToken) {
      throw new Error(t("phone.noToken"));
    }
    const amount = toMinorUnits(
      rows.reduce((total, item) => {
        const rowPricing = calculateShipmentPricing(item.pkg, item.goods.declaredValue, item.goods.insurance, config);
        return total + rowPricing.total;
      }, 0),
      config.currency,
    );

    const res = await fetch("/api/payment/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${widgetToken}`,
      },
      body: JSON.stringify({
        amount,
        currency: config.currency,
        shipments: rows,
        mode: options.mode,
        batchRef: options.batchRef ?? null,
        metadata: { tenantSlug: tenantSlug ?? config.tenantSlug },
      }),
    });
    const json = (await res.json().catch(() => ({}))) as PaymentSession & { error?: string };
    if (!res.ok || !json.provider) throw new Error(json.error ?? t("payment.failedInit"));
    return json;
  }

  async function ensureSinglePaymentSession() {
    if (paymentSession || paymentLoading) return;
    if (config.paymentGateway.status !== "ready") {
      setPaymentError(t("payment.failedInit"));
      return;
    }

    setPaymentLoading(true);
    setPaymentError(null);
    try {
      const session = await createPaymentSession([draft], { mode: "single" });
      setPaymentSession(session);
    } catch (error: unknown) {
      setPaymentError(error instanceof Error ? error.message : t("payment.failedInit"));
    } finally {
      setPaymentLoading(false);
    }
  }

  useEffect(() => {
    if (activeStep === "payment") {
      void ensureSinglePaymentSession();
    }
    // Payment initialization intentionally reacts to step entry; draft changes clear paymentSession above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStep, paymentSession]);

  async function createShipmentFromDraft(input: ShipmentDraftInput, options: { batchRef?: string | null } = {}) {
    const validation = validateShipmentDraft(input, config, { requirePhoneVerified: true });
    if (!validation.ok) throw new Error(`${t("validation.required")}: ${validation.issues.join(", ")}`);

    const idempotencyKey = `${options.batchRef ?? "single"}:${validation.data.corridorId}:${Date.now()}:${Math.random()
      .toString(36)
      .slice(2)}`;
    const payload = buildWidgetShipmentPayload(validation.data, config, {
      widgetSessionId: options.batchRef ?? tenantSlug ?? config.tenantSlug,
      idempotencyKey,
    });

    if (widgetToken) {
      const created = await postShipment(payload, widgetToken);
      await fetch("/api/shipments/generate-qr", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${widgetToken}`,
        },
        body: JSON.stringify(created),
      }).catch(() => null);
      return created;
    }

    const localTrackingRef = `LOCAL-${Date.now()}`;
    const docRef = await addDoc(collection(db, "shipments"), {
      ...payload,
      trackingRef: localTrackingRef,
      createdAt: serverTimestamp(),
    });
    return { trackingRef: localTrackingRef, shipmentId: docRef.id };
  }

  async function handleSingleCreated() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const created = await createShipmentFromDraft(draft);
      postMessageToHost({ type: "SHIPMENT_CREATED", trackingRef: created.trackingRef, shipmentId: created.shipmentId });
      onCreated?.(created.trackingRef);
      onTrack?.(created.trackingRef);
      if (!suppressSuccessView) setSuccess(created);
    } catch (error: unknown) {
      setSubmitError(error instanceof Error ? error.message : t("api.genericError"));
      throw error;
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePaystackSingleCreated(session: PaystackPaymentSession) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const confirmed = await confirmPaystackPayment(session, widgetToken);
      const created =
        confirmed.shipments?.[0] ??
        (confirmed.trackingRef && confirmed.shipmentId
          ? { trackingRef: confirmed.trackingRef, shipmentId: confirmed.shipmentId }
          : null);
      if (!created) throw new Error(t("api.genericError"));
      postMessageToHost({ type: "SHIPMENT_CREATED", trackingRef: created.trackingRef, shipmentId: created.shipmentId });
      onCreated?.(created.trackingRef);
      onTrack?.(created.trackingRef);
      if (!suppressSuccessView) setSuccess(created);
    } catch (error: unknown) {
      setSubmitError(error instanceof Error ? error.message : t("api.genericError"));
      throw error;
    } finally {
      setSubmitting(false);
    }
  }

  function resetSingle() {
    setDraft(createDraftForCorridor(config.corridors[0] ?? null));
    setStep(0);
    setSuccess(null);
    setSubmitError(null);
    setPaymentSession(null);
  }

  if (success && !suppressSuccessView) {
    return (
      <div ref={formRef} dir={dir} className={embedded ? "max-w-none p-0" : "mx-auto max-w-3xl p-4 sm:p-6"}>
        <Card title={t("success.title")}>
          <div className="space-y-4">
            <SummaryRow label={t("success.track")} value={success.trackingRef} />
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="btn-outline"
                onClick={() => void navigator.clipboard?.writeText(success.trackingRef)}
              >
                {t("actions.copy")}
              </button>
              <button type="button" className="btn-brand" onClick={resetSingle}>
                {t("success.createAnother")}
              </button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div ref={formRef} dir={dir} className={embedded ? "max-w-none p-0" : "mx-auto max-w-3xl p-4 sm:p-6"} style={BRAND_STYLE}>
      {embedded ? (
        <div className="mb-2 flex justify-end">
          <button type="button" onClick={() => postMessageToHost({ type: "WIDGET_CLOSE" })} className="text-sm text-gray-500 hover:text-gray-700">
            {t("app.close")}
          </button>
        </div>
      ) : null}

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className={embedded ? "text-xl font-semibold text-gray-950" : "text-2xl font-semibold text-gray-950"}>{t("app.title")}</h1>
          <p className="mt-1 text-sm text-gray-600">{t("app.subtitle")}</p>
          {configError ? <p className="mt-2 text-sm text-red-700">{configError}</p> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <LanguageSwitcher
            label={t("language.label")}
            languages={config.supportedLanguages}
            locale={locale}
            onChange={setLocale}
          />
          <SegmentedButton
            items={[
              { key: "single", label: t("mode.single") },
              { key: "bulk", label: t("mode.bulk") },
            ]}
            value={mode}
            onChange={(value) => setMode(value as "single" | "bulk")}
          />
        </div>
      </div>

      {mode === "bulk" ? (
        <BulkFlow
          config={config}
          locale={locale}
          t={t}
          money={money}
          number={number}
          widgetToken={widgetToken}
          tenantSlug={tenantSlug ?? config.tenantSlug}
          bulkRows={bulkRows}
          setBulkRows={setBulkRows}
          bulkErrors={bulkErrors}
          setBulkErrors={setBulkErrors}
          bulkStep={bulkStep}
          setBulkStep={setBulkStep}
          bulkPhoneVerified={bulkPhoneVerified}
          setBulkPhoneVerified={setBulkPhoneVerified}
          bulkPaymentSession={bulkPaymentSession}
          setBulkPaymentSession={setBulkPaymentSession}
          bulkBatchRef={bulkBatchRef}
          setBulkBatchRef={setBulkBatchRef}
          bulkSubmitting={bulkSubmitting}
          setBulkSubmitting={setBulkSubmitting}
          bulkResults={bulkResults}
          setBulkResults={setBulkResults}
          createPaymentSession={createPaymentSession}
          createShipmentFromDraft={createShipmentFromDraft}
          onBulkCompleted={onBulkCompleted}
        />
      ) : (
        <>
          <CorridorPicker
            config={config}
            t={t}
            locale={locale}
            corridor={corridor}
            onChange={selectCorridor}
          />

          <div className="mb-4">
            <Stepper steps={steps} active={step} t={t} onStepClick={(index) => index <= step && setStep(index)} />
          </div>

          {activeStep === "addresses" ? (
            <Card title={t("steps.addresses")}>
              <div className="grid gap-6">
                <PartyForm
                  title={t("party.sender")}
                  party={draft.sender}
                  config={config}
                  locale={locale}
                  t={t}
                  lockedCountry={corridor?.originCountry}
                  onChange={updateSender}
                />
                <div className="h-px bg-gray-200" />
                <PartyForm
                  title={t("party.recipient")}
                  party={draft.recipient}
                  config={config}
                  locale={locale}
                  t={t}
                  lockedCountry={corridor?.destinationCountry}
                  onChange={updateRecipient}
                  showContentDescription
                />
              </div>
            </Card>
          ) : null}

          {activeStep === "package" ? (
            <Card title={t("package.title")}>
              <p className="mb-4 text-sm text-gray-600">{t("package.help")}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <NumberInput label={t("package.length")} value={draft.pkg.lengthCm} onChange={(lengthCm) => setDraft((current) => ({ ...current, pkg: { ...current.pkg, lengthCm } }))} />
                <NumberInput label={t("package.width")} value={draft.pkg.widthCm} onChange={(widthCm) => setDraft((current) => ({ ...current, pkg: { ...current.pkg, widthCm } }))} />
                <NumberInput label={t("package.height")} value={draft.pkg.heightCm} onChange={(heightCm) => setDraft((current) => ({ ...current, pkg: { ...current.pkg, heightCm } }))} />
                <NumberInput label={t("package.weight")} value={draft.pkg.weightKg} min={5} placeholder={t("package.minWeight")} onChange={(weightKg) => setDraft((current) => ({ ...current, pkg: { ...current.pkg, weightKg } }))} />
              </div>
              <div className="mt-4 grid gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 sm:grid-cols-2">
                <SummaryRow label={t("package.chargeable")} value={`${number.format(pricing.chargeableWeight)} kg`} compact />
                <SummaryRow label={t("review.total")} value={money.format(pricing.total)} compact />
              </div>
            </Card>
          ) : null}

          {activeStep === "goods" ? (
            <Card title={t("goods.title")}>
              <GoodsForm
                goods={draft.goods}
                config={config}
                money={money}
                t={t}
                onChange={(goods) => setDraft((current) => ({ ...current, goods }))}
              />
            </Card>
          ) : null}

          {activeStep === "customs" ? (
            <Card title={t("customs.title")}>
              <CustomsForm
                customs={draft.customs}
                config={config}
                locale={locale}
                t={t}
                required={customsRequired}
                onChange={(customs) => setDraft((current) => ({ ...current, customs }))}
              />
            </Card>
          ) : null}

          {activeStep === "phone" ? (
            <Card title={t("phone.title")}>
              {draft.phoneVerified ? (
                <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-800">{t("phone.verified")}</div>
              ) : (
                <PhoneVerification
                  country={draft.sender.country}
                  phone={draft.sender.phone}
                  channel={config.otpChannel}
                  widgetToken={widgetToken}
                  t={t}
                  onPhoneChange={(phone) => setDraft((current) => ({ ...current, sender: { ...current.sender, phone }, phoneVerified: false }))}
                  onVerified={() => setDraft((current) => ({ ...current, phoneVerified: true }))}
                />
              )}
            </Card>
          ) : null}

          {activeStep === "review" ? (
            <Card title={t("review.title")}>
              <Review
                draft={draft}
                corridor={corridor}
                config={config}
                money={money}
                number={number}
                pricing={pricing}
                t={t}
              />
            </Card>
          ) : null}

          {activeStep === "payment" ? (
            <Card title={t("payment.title")}>
              {paymentLoading ? (
                <div className="flex items-center justify-center py-12 text-sm text-gray-600">{t("payment.loading")}</div>
              ) : paymentError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{paymentError}</div>
              ) : paymentSession?.provider === "stripe" && stripePromise ? (
                <Elements stripe={stripePromise} options={{ clientSecret: paymentSession.clientSecret }}>
                  <StripeCheckoutForm
                    amount={pricing.total}
                    money={money}
                    t={t}
                    submitting={submitting}
                    onPaid={handleSingleCreated}
                  />
                </Elements>
              ) : paymentSession?.provider === "paystack" ? (
                <PaystackCheckoutForm
                  session={paymentSession}
                  amountLabel={money.format(pricing.total)}
                  t={t}
                  submitting={submitting}
                  onPaid={() => handlePaystackSingleCreated(paymentSession)}
                />
              ) : (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{t("payment.failedInit")}</div>
              )}
            </Card>
          ) : null}

          {submitError ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{submitError}</div> : null}

          <div className="mt-6 flex items-center justify-between gap-3">
            <button type="button" onClick={back} disabled={step === 0 || submitting} className="btn-outline disabled:opacity-40">
              {t("actions.back")}
            </button>
            {activeStep === "payment" ? null : (
              <button type="button" onClick={next} disabled={!stepValid(activeStep)} className="btn-brand disabled:opacity-40">
                {activeStep === "review" ? t("actions.payment") : t("actions.continue")}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function LanguageSwitcher({
  label,
  languages,
  locale,
  onChange,
}: {
  label: string;
  languages: SupportedLanguage[];
  locale: string;
  onChange: (locale: string) => void;
}) {
  if (languages.length <= 1) return null;
  return (
    <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
      <span>{label}</span>
      <select value={locale} onChange={(event) => onChange(event.target.value)} className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs text-gray-900">
        {languages.map((language) => (
          <option key={language.locale} value={language.locale}>
            {language.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SegmentedButton({
  items,
  value,
  onChange,
}: {
  items: Array<{ key: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onChange(item.key)}
          className={[
            "rounded-md px-3 py-1.5 text-xs font-semibold transition",
            value === item.key ? "bg-[var(--brand-primary)] text-white" : "text-gray-700 hover:bg-white",
          ].join(" ")}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function CorridorPicker({
  config,
  t,
  locale,
  corridor,
  onChange,
}: {
  config: TenantConfig;
  t: (key: string, values?: Record<string, string | number>) => string;
  locale: string;
  corridor: CorridorConfig | null;
  onChange: (corridorId: string) => void;
}) {
  const originCountries = config.enabledCountries;
  const destinationCountries = corridor
    ? config.corridors
        .filter((item) => item.originCountry === corridor.originCountry)
        .map((item) => item.destinationCountry)
    : [];

  if (config.corridors.length === 1 && corridor) {
    return (
      <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
        <span className="font-semibold">{t("corridor.single")}</span> {displayCountryName(corridor.originCountry, locale)} to{" "}
        {displayCountryName(corridor.destinationCountry, locale)}
      </div>
    );
  }

  return (
    <Card title={t("corridor.title")}>
      <div className="grid gap-3 sm:grid-cols-2">
        <CountrySelect
          label={t("corridor.origin")}
          countries={originCountries}
          locale={locale}
          value={corridor?.originCountry ?? ""}
          onChange={(origin) => {
            const next = config.corridors.find((item) => item.originCountry === origin) ?? null;
            if (next) onChange(next.id);
          }}
        />
        <CountrySelect
          label={t("corridor.destination")}
          countries={destinationCountries.map((name) => config.enabledCountries.find((country) => country.name === name)).filter((country): country is CountryOption => Boolean(country))}
          locale={locale}
          value={corridor?.destinationCountry ?? ""}
          onChange={(destination) => {
            const next = config.corridors.find((item) => item.originCountry === corridor?.originCountry && item.destinationCountry === destination) ?? null;
            if (next) onChange(next.id);
          }}
        />
      </div>
    </Card>
  );
}

function Stepper({
  steps,
  active,
  t,
  onStepClick,
}: {
  steps: StepKey[];
  active: number;
  t: (key: string) => string;
  onStepClick: (index: number) => void;
}) {
  return (
    <ol className="grid grid-cols-2 gap-2 rounded-lg border border-gray-200 bg-white p-2 sm:grid-cols-3 lg:grid-cols-7">
      {steps.map((step, index) => {
        const isActive = index === active;
        const done = index < active;
        return (
          <li key={step}>
            <button
              type="button"
              disabled={index > active}
              onClick={() => onStepClick(index)}
              className={[
                "h-full w-full rounded-md border px-2 py-2 text-start text-xs font-semibold transition",
                isActive
                  ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white"
                  : done
                    ? "border-[var(--brand-primary)] bg-white text-[var(--brand-primary)]"
                    : "border-gray-200 bg-gray-50 text-gray-600",
              ].join(" ")}
            >
              {t(`steps.${step}`)}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function PartyForm({
  title,
  party,
  config,
  locale,
  t,
  lockedCountry,
  onChange,
  showContentDescription,
}: {
  title: string;
  party: PartyInput;
  config: TenantConfig;
  locale: string;
  t: (key: string) => string;
  lockedCountry?: string;
  onChange: (party: PartyInput) => void;
  showContentDescription?: boolean;
}) {
  const schema = getAddressSchema(party.country);
  return (
    <section>
      <h3 className="mb-3 text-base font-semibold text-gray-950">{title}</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextInput label={t("party.fullName")} value={party.fullName} onChange={(fullName) => onChange({ ...party, fullName })} required />
        <TextInput label={t("party.email")} type="email" value={party.email} onChange={(email) => onChange({ ...party, email })} />
        <TextInput label={t("party.phone")} type="tel" value={party.phone} onChange={(phone) => onChange({ ...party, phone })} required />
        {lockedCountry ? (
          <TextInput label={t("party.country")} value={displayCountryName(lockedCountry, locale)} onChange={() => null} disabled />
        ) : (
          <CountrySelect
            label={t("party.country")}
            countries={config.enabledCountries}
            locale={locale}
            value={party.country}
            onChange={(country) => onChange({ ...party, country })}
          />
        )}
        {schema.fields.map((field) => (
          <TextInput
            key={field.key}
            label={t(field.labelKey)}
            value={party[field.key]}
            onChange={(value) => onChange({ ...party, [field.key]: value })}
            required={field.required}
          />
        ))}
        {showContentDescription ? (
          <TextArea
            label={t("customs.description")}
            value={party.contentDescription ?? ""}
            onChange={(contentDescription) => onChange({ ...party, contentDescription })}
          />
        ) : null}
      </div>
    </section>
  );
}

function GoodsForm({
  goods,
  config,
  money,
  t,
  onChange,
}: {
  goods: GoodsInput;
  config: TenantConfig;
  money: Intl.NumberFormat;
  t: (key: string, values?: Record<string, string | number>) => string;
  onChange: (goods: GoodsInput) => void;
}) {
  const category = config.allowedCategories.find((item) => item.key === goods.category);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm text-gray-700">{t("goods.category")}</span>
          <select value={goods.category} onChange={(event) => onChange({ ...goods, category: event.target.value })} className="field">
            <option value="">{t("goods.category")}</option>
            {config.allowedCategories.map((item) => (
              <option key={item.key} value={item.key} disabled={item.status === "blocked"}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <NumberInput label={`${t("goods.value")} (${config.currency})`} value={goods.declaredValue} onChange={(declaredValue) => onChange({ ...goods, declaredValue })} />
      </div>
      {category?.status === "restricted" && category.message ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{t("goods.restricted", { message: category.message })}</div>
      ) : null}
      {category?.status === "blocked" && category.message ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{t("goods.blocked", { message: category.message })}</div>
      ) : null}
      <div>
        <span className="mb-2 block text-sm text-gray-700">{t("goods.insurance")}</span>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {config.pricing.insuranceTiers.filter((tier) => tier.enabled).map((tier) => (
            <button
              key={tier.key}
              type="button"
              onClick={() => onChange({ ...goods, insurance: tier.key })}
              className={[
                "rounded-lg border p-3 text-start text-sm transition",
                goods.insurance === tier.key ? "border-[var(--brand-primary)] bg-white" : "border-gray-200 bg-white",
              ].join(" ")}
            >
              <span className="block font-semibold text-gray-950">{tier.label}</span>
              <span className="mt-1 block text-xs text-gray-600">
                {tier.type === "NONE" ? money.format(0) : tier.type === "FLAT_FEE" ? money.format(tier.rate) : `${tier.rate}%`}
              </span>
            </button>
          ))}
        </div>
      </div>
      <TextArea label={t("goods.notes")} value={goods.notes} placeholder={t("goods.notesPlaceholder")} onChange={(notes) => onChange({ ...goods, notes })} />
    </div>
  );
}

function CustomsForm({
  customs,
  config,
  locale,
  t,
  required,
  onChange,
}: {
  customs: CustomsDeclarationInput;
  config: TenantConfig;
  locale: string;
  t: (key: string, values?: Record<string, string | number>) => string;
  required: boolean;
  onChange: (customs: CustomsDeclarationInput) => void;
}) {
  if (!required) {
    return <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">{t("customs.domestic")}</div>;
  }
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
        {t("customs.help", { system: config.customsSystemLabel ?? "Customs" })}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm text-gray-700">{t("customs.type")}</span>
          <select value={customs.type} onChange={(event) => onChange({ ...customs, type: event.target.value as "DDP" | "DDU" })} className="field">
            <option value="DDU">DDU</option>
            <option value="DDP">DDP</option>
          </select>
        </label>
        <TextInput label={t("customs.reason")} value={customs.reasonForExport} onChange={(reasonForExport) => onChange({ ...customs, reasonForExport })} required />
      </div>
      <div className="space-y-3">
        {customs.items.map((item, index) => (
          <div key={index} className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextInput label={t("customs.description")} value={item.description} onChange={(description) => updateCustomsItem(customs, index, { ...item, description }, onChange)} required />
              <TextInput label={t("customs.hsCode")} value={item.hsCode} onChange={(hsCode) => updateCustomsItem(customs, index, { ...item, hsCode }, onChange)} required />
              <NumberInput label={t("customs.quantity")} value={item.quantity} onChange={(quantity) => updateCustomsItem(customs, index, { ...item, quantity }, onChange)} min={1} />
              <NumberInput label={`${t("customs.value")} (${config.currency})`} value={item.declaredValue} onChange={(declaredValue) => updateCustomsItem(customs, index, { ...item, declaredValue }, onChange)} />
              <CountrySelect
                label={t("customs.origin")}
                countries={config.enabledCountries}
                locale={locale}
                value={item.countryOfOrigin}
                onChange={(countryOfOrigin) => updateCustomsItem(customs, index, { ...item, countryOfOrigin }, onChange)}
              />
            </div>
            {customs.items.length > 1 ? (
              <button type="button" className="mt-3 text-sm font-semibold text-red-700" onClick={() => onChange({ ...customs, items: customs.items.filter((_, itemIndex) => itemIndex !== index) })}>
                {t("customs.removeItem")}
              </button>
            ) : null}
          </div>
        ))}
      </div>
      <button type="button" className="btn-outline" onClick={() => onChange({ ...customs, items: [...customs.items, emptyCustomsItem()] })}>
        {t("customs.addItem")}
      </button>
    </div>
  );
}

function updateCustomsItem(
  customs: CustomsDeclarationInput,
  index: number,
  item: CustomsItemInput,
  onChange: (customs: CustomsDeclarationInput) => void,
) {
  onChange({
    ...customs,
    items: customs.items.map((current, itemIndex) => (itemIndex === index ? item : current)),
  });
}

function PhoneVerification({
  country,
  phone,
  channel,
  widgetToken,
  t,
  onPhoneChange,
  onVerified,
}: {
  country: string;
  phone: string;
  channel: string;
  widgetToken?: string;
  t: (key: string, values?: Record<string, string | number>) => string;
  onPhoneChange: (phone: string) => void;
  onVerified: () => void;
}) {
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const phoneE164 = formatPhoneE164(phone, country);

  async function sendOtp() {
    setError(null);
    setMessage(null);
    if (!widgetToken) return setError(t("phone.noToken"));
    if (!phoneE164) return setError(t("phone.invalid", { country }));
    setSending(true);
    try {
      const res = await fetch("/api/widget/phone/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${widgetToken}`,
        },
        body: JSON.stringify({ phone: phoneE164 }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; devCode?: string };
      if (!res.ok) throw new Error(json.error ?? "OTP send failed");
      setSent(true);
      setMessage(json.devCode ? `${t("phone.sent")} Dev code: ${json.devCode}` : t("phone.sent"));
    } catch (sendError: unknown) {
      setError(sendError instanceof Error ? sendError.message : "OTP send failed");
    } finally {
      setSending(false);
    }
  }

  async function verifyOtp() {
    setError(null);
    setMessage(null);
    if (!widgetToken) return setError(t("phone.noToken"));
    if (!phoneE164) return setError(t("phone.invalid", { country }));
    setVerifying(true);
    try {
      const res = await fetch("/api/widget/phone/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${widgetToken}`,
        },
        body: JSON.stringify({ phone: phoneE164, code }),
      });
      const json = (await res.json().catch(() => ({}))) as { verified?: boolean; error?: string };
      if (!res.ok || json.verified !== true) throw new Error(json.error ?? "OTP verification failed");
      setMessage(t("phone.verified"));
      onVerified();
    } catch (verifyError: unknown) {
      setError(verifyError instanceof Error ? verifyError.message : "OTP verification failed");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">{t("phone.channel", { channel })}</div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[120px_1fr]">
        <TextInput label="Code" value={`+${getDialCodeForCountry(country)}`} onChange={() => null} disabled />
        <TextInput label={t("party.phone")} type="tel" value={phone} onChange={onPhoneChange} required />
      </div>
      {message ? <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{message}</div> : null}
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="button" className="btn-brand" disabled={sending || !phoneE164} onClick={sendOtp}>
          {sending ? t("phone.sending") : sent ? t("phone.resend") : t("phone.send")}
        </button>
        <TextInput label={t("phone.code")} value={code} onChange={setCode} />
        <button type="button" className="btn-outline" disabled={verifying || !code.trim()} onClick={verifyOtp}>
          {verifying ? t("phone.verifying") : t("phone.verify")}
        </button>
      </div>
    </div>
  );
}

function Review({
  draft,
  corridor,
  config,
  money,
  number,
  pricing,
  t,
}: {
  draft: ShipmentDraftInput;
  corridor: CorridorConfig | null;
  config: TenantConfig;
  money: Intl.NumberFormat;
  number: Intl.NumberFormat;
  pricing: ReturnType<typeof calculateShipmentPricing>;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  return (
    <div className="space-y-3 text-sm">
      <SummaryRow label={t("review.route")} value={corridor?.route ?? "-"} />
      <SummaryRow label={t("review.sender")} value={`${draft.sender.fullName || "-"}, ${draft.sender.country}`} />
      <SummaryRow label={t("review.recipient")} value={`${draft.recipient.fullName || "-"}, ${draft.recipient.country}`} />
      <SummaryRow label={t("review.goods")} value={`${draft.goods.category || "-"} (${money.format(draft.goods.declaredValue)})`} />
      <SummaryRow label={t("review.weight")} value={`${number.format(pricing.chargeableWeight)} kg`} />
      <div className="rounded-lg border border-gray-200 bg-white p-3">
        <div className="mb-2 flex items-center justify-between font-semibold text-gray-900">
          <span>{t("review.breakdown")}</span>
          <span>{money.format(pricing.total)}</span>
        </div>
        <div className="space-y-1.5 text-xs text-gray-600">
          <PriceRow label={t("review.weightCharge")} value={money.format(pricing.weightCharge)} />
          <PriceRow label={t("review.insurance")} value={money.format(pricing.insuranceFee)} />
          {config.taxRule?.enabled ? (
            <PriceRow label={t("review.tax", { label: config.taxRule.label, rate: config.taxRule.rate })} value={money.format(pricing.taxAmount)} />
          ) : null}
          <div className="h-px bg-gray-200" />
          <PriceRow label={t("review.total")} value={money.format(pricing.total)} strong />
        </div>
      </div>
    </div>
  );
}

function StripeCheckoutForm({
  amount,
  money,
  t,
  submitting,
  onPaid,
}: {
  amount: number;
  money: Intl.NumberFormat;
  t: (key: string, values?: Record<string, string | number>) => string;
  submitting: boolean;
  onPaid: () => Promise<void>;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!stripe || !elements) return;
    setProcessing(true);
    setError(null);
    try {
      const submit = await elements.submit();
      if (submit.error) throw new Error(submit.error.message ?? t("payment.failed"));

      const result = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: `${window.location.origin}/payment/success` },
        redirect: "if_required",
      });
      if (result.error) throw new Error(result.error.message ?? t("payment.failed"));
      await onPaid();
    } catch (paymentError: unknown) {
      setError(paymentError instanceof Error ? paymentError.message : t("payment.failed"));
    } finally {
      setProcessing(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <span className="font-semibold">{t("payment.failed")}</span>
          <p className="mt-1">{error}</p>
        </div>
      ) : null}
      <PaymentElement />
      <button type="submit" disabled={!stripe || processing || submitting} className="btn-brand w-full">
        {processing || submitting ? t("payment.processing") : t("payment.pay", { amount: money.format(amount) })}
      </button>
    </form>
  );
}

function PaystackCheckoutForm({
  session,
  amountLabel,
  t,
  submitting,
  onPaid,
}: {
  session: PaystackPaymentSession;
  amountLabel: string;
  t: (key: string, values?: Record<string, string | number>) => string;
  submitting: boolean;
  onPaid: () => Promise<void>;
}) {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePaystack() {
    setProcessing(true);
    setError(null);
    try {
      const paystackModule = (await import("@paystack/inline-js")) as {
        default: new () => {
          resumeTransaction: (
            accessCode: string,
            callbacks: {
              onSuccess?: (response: { reference: string }) => void;
              onCancel?: () => void;
              onError?: (error: { message?: string }) => void;
            },
          ) => unknown;
        };
      };
      const popup = new paystackModule.default();
      popup.resumeTransaction(session.accessCode, {
        onSuccess: () => {
          void onPaid().catch((paymentError: unknown) => {
            setError(paymentError instanceof Error ? paymentError.message : t("payment.failed"));
          }).finally(() => {
            setProcessing(false);
          });
        },
        onCancel: () => {
          setProcessing(false);
        },
        onError: (paystackError) => {
          setError(paystackError.message ?? t("payment.failed"));
          setProcessing(false);
        },
      });
    } catch (paymentError: unknown) {
      setError(paymentError instanceof Error ? paymentError.message : t("payment.failed"));
      setProcessing(false);
    }
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <span className="font-semibold">{t("payment.failed")}</span>
          <p className="mt-1">{error}</p>
        </div>
      ) : null}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
        <SummaryRow label="Paystack" value={session.reference} compact />
      </div>
      <button type="button" disabled={processing || submitting} className="btn-brand w-full" onClick={() => void handlePaystack()}>
        {processing || submitting ? t("payment.processing") : t("payment.pay", { amount: amountLabel })}
      </button>
      <a href={session.authorizationUrl} className="btn-outline inline-flex w-full justify-center">
        {t("payment.redirect")}
      </a>
    </div>
  );
}

function BulkFlow({
  config,
  locale,
  t,
  money,
  number,
  widgetToken,
  tenantSlug,
  bulkRows,
  setBulkRows,
  bulkErrors,
  setBulkErrors,
  bulkStep,
  setBulkStep,
  bulkPhoneVerified,
  setBulkPhoneVerified,
  bulkPaymentSession,
  setBulkPaymentSession,
  bulkBatchRef,
  setBulkBatchRef,
  bulkSubmitting,
  setBulkSubmitting,
  bulkResults,
  setBulkResults,
  createPaymentSession,
  createShipmentFromDraft,
  onBulkCompleted,
}: {
  config: TenantConfig;
  locale: string;
  t: (key: string, values?: Record<string, string | number>) => string;
  money: Intl.NumberFormat;
  number: Intl.NumberFormat;
  widgetToken?: string;
  tenantSlug?: string | null;
  bulkRows: BulkDraft[];
  setBulkRows: (rows: BulkDraft[]) => void;
  bulkErrors: string[];
  setBulkErrors: (errors: string[]) => void;
  bulkStep: "upload" | "review" | "phone" | "payment" | "creating" | "complete";
  setBulkStep: (step: "upload" | "review" | "phone" | "payment" | "creating" | "complete") => void;
  bulkPhoneVerified: boolean;
  setBulkPhoneVerified: (verified: boolean) => void;
  bulkPaymentSession: PaymentSession | null;
  setBulkPaymentSession: (session: PaymentSession | null) => void;
  bulkBatchRef: string | null;
  setBulkBatchRef: (ref: string | null) => void;
  bulkSubmitting: boolean;
  setBulkSubmitting: (submitting: boolean) => void;
  bulkResults: BulkResult[];
  setBulkResults: (results: BulkResult[]) => void;
  createPaymentSession: (rows: ShipmentDraftInput[], options: { mode: "single" | "bulk"; batchRef?: string | null }) => Promise<PaymentSession>;
  createShipmentFromDraft: (draft: ShipmentDraftInput, options?: { batchRef?: string | null }) => Promise<{ trackingRef: string; shipmentId: string }>;
  onBulkCompleted?: (results: BulkResult[]) => void;
}) {
  const total = bulkRows.reduce((sum, row) => sum + calculateShipmentPricing(row.pkg, row.goods.declaredValue, row.goods.insurance, config).total, 0);
  const stripePublishableKey = bulkPaymentSession?.provider === "stripe" ? bulkPaymentSession.publishableKey : config.paymentGateway.publishableKey;
  const stripePromise = useMemo(() => (stripePublishableKey ? loadStripe(stripePublishableKey) : null), [stripePublishableKey]);

  function templateCsv() {
    const corridor = config.corridors[0];
    const category = config.allowedCategories.find((item) => item.status === "allowed")?.key ?? "documents";
    const header = bulkCsvHeaders().join(",");
    const row = [
      corridor?.originCountry ?? "",
      corridor?.destinationCountry ?? "",
      "Sender Name",
      "sender@example.com",
      `+${getDialCodeForCountry(corridor?.originCountry ?? "United Kingdom")}712345678`,
      "Address line 1",
      "",
      "City",
      "State",
      "Postcode",
      "Recipient Name",
      "recipient@example.com",
      `+${getDialCodeForCountry(corridor?.destinationCountry ?? "United Kingdom")}8012345678`,
      "Address line 1",
      "",
      "City",
      "State",
      "Postcode",
      category,
      "100",
      "NONE",
      "30",
      "20",
      "10",
      "5",
      "Sale",
      "Cotton shirts",
      "610910",
      "1",
      "100",
      corridor?.originCountry ?? "",
      "",
    ].join(",");
    downloadTextFile("fauward-bulk-template.csv", `${header}\n${row}\n`, "text/csv");
  }

  async function prepareBulkPayment() {
    try {
      const batchRef = bulkBatchRef ?? `BULK-${Date.now()}`;
      setBulkBatchRef(batchRef);
      const rows = bulkRows.map(markBulkVerified);
      const session = await createPaymentSession(rows, { mode: "bulk", batchRef });
      setBulkPaymentSession(session);
      setBulkStep("payment");
    } catch (error: unknown) {
      setBulkErrors([error instanceof Error ? error.message : "Payment initialization failed"]);
    }
  }

  async function submitBulk() {
    const batchRef = bulkBatchRef ?? `BULK-${Date.now()}`;
    setBulkBatchRef(batchRef);
    setBulkSubmitting(true);
    setBulkStep("creating");
    const results: BulkResult[] = [];
    for (const row of bulkRows.map(markBulkVerified)) {
      try {
        const created = await createShipmentFromDraft(row, { batchRef });
        results.push({ ok: true, row: row._row, trackingRef: created.trackingRef });
      } catch (error: unknown) {
        results.push({ ok: false, row: row._row, error: error instanceof Error ? error.message : "Failed to create shipment" });
      }
    }
    setBulkResults(results);
    setBulkSubmitting(false);
    setBulkStep("complete");
    postMessageToHost({ type: "BULK_CREATED", batchRef, count: results.filter((result) => result.ok).length });
    onBulkCompleted?.(results);
  }

  async function submitPaystackBulk(session: PaystackPaymentSession) {
    const batchRef = bulkBatchRef ?? session.reference;
    setBulkBatchRef(batchRef);
    setBulkSubmitting(true);
    setBulkStep("creating");
    try {
      const confirmed = await confirmPaystackPayment(session, widgetToken);
      const shipments = confirmed.shipments ?? [];
      const results: BulkResult[] = bulkRows.map((row, index) => {
        const shipment = shipments[index];
        return shipment
          ? { ok: true, row: row._row, trackingRef: shipment.trackingRef }
          : { ok: false, row: row._row, error: "Payment confirmed but shipment was not created" };
      });
      setBulkResults(results);
      postMessageToHost({ type: "BULK_CREATED", batchRef, count: results.filter((result) => result.ok).length });
      onBulkCompleted?.(results);
      setBulkStep("complete");
    } catch (error: unknown) {
      setBulkErrors([error instanceof Error ? error.message : "Payment confirmation failed"]);
      setBulkStep("payment");
    } finally {
      setBulkSubmitting(false);
    }
  }

  return (
    <Card title={t("bulk.title")}>
      <div className="space-y-4 text-sm text-gray-700">
        {bulkStep === "upload" ? (
          <>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">{t("bulk.guide")}</div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-outline" onClick={templateCsv}>
                {t("bulk.download")}
              </button>
              <label className="btn-brand cursor-pointer">
                {t("bulk.upload")}
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    const parsed = parseBulkCsv(await file.text(), config);
                    setBulkRows(parsed.rows);
                    setBulkErrors(parsed.errors);
                    setBulkStep(parsed.rows.length > 0 && parsed.errors.length === 0 ? "review" : "upload");
                    event.target.value = "";
                  }}
                />
              </label>
              <button
                type="button"
                className="btn-outline"
                onClick={() => {
                  setBulkRows([]);
                  setBulkErrors([]);
                  setBulkResults([]);
                  setBulkPaymentSession(null);
                  setBulkPhoneVerified(false);
                }}
              >
                {t("bulk.clear")}
              </button>
            </div>
          </>
        ) : null}

        {bulkErrors.length > 0 ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="mb-2 font-semibold text-red-800">{t("bulk.errors")}</div>
            <ul className="list-disc space-y-1 pl-5 text-red-700">
              {bulkErrors.slice(0, 12).map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {bulkStep === "review" && bulkRows.length > 0 ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-green-800">{t("bulk.valid", { count: bulkRows.length })}</div>
            <div className="grid grid-cols-2 gap-3">
              <SummaryRow label={t("bulk.totalShipments")} value={number.format(bulkRows.length)} compact />
              <SummaryRow label={t("bulk.totalAmount")} value={money.format(total)} compact />
            </div>
            <button type="button" className="btn-brand" onClick={() => setBulkStep("phone")}>
              {t("bulk.continuePhone")}
            </button>
          </div>
        ) : null}

        {bulkStep === "phone" ? (
          <div className="space-y-4">
            {bulkPhoneVerified ? (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-green-800">{t("phone.verified")}</div>
            ) : (
              <PhoneVerification
                country={bulkRows[0]?.sender.country ?? config.enabledCountries[0]?.name ?? "United Kingdom"}
                phone={bulkRows[0]?.sender.phone ?? ""}
                channel={config.otpChannel}
                widgetToken={widgetToken}
                t={t}
                onPhoneChange={(phone) => {
                  if (!bulkRows[0]) return;
                  setBulkRows([{ ...bulkRows[0], sender: { ...bulkRows[0].sender, phone } }, ...bulkRows.slice(1)]);
                }}
                onVerified={() => {
                  setBulkPhoneVerified(true);
                  setBulkRows(bulkRows.map(markBulkVerified));
                }}
              />
            )}
            <button type="button" className="btn-brand disabled:opacity-40" disabled={!bulkPhoneVerified} onClick={() => void prepareBulkPayment()}>
              {t("bulk.continuePayment")}
            </button>
          </div>
        ) : null}

        {bulkStep === "payment" && bulkPaymentSession?.provider === "stripe" && stripePromise ? (
          <Elements stripe={stripePromise} options={{ clientSecret: bulkPaymentSession.clientSecret }}>
            <BulkPaymentForm
              amount={toMinorUnits(total, config.currency)}
              currency={config.currency}
              locale={locale}
              batchRef={bulkBatchRef}
              onSuccess={() => void submitBulk()}
            />
          </Elements>
        ) : null}

        {bulkStep === "payment" && bulkPaymentSession?.provider === "paystack" ? (
          <PaystackCheckoutForm
            session={bulkPaymentSession}
            amountLabel={money.format(total)}
            t={t}
            submitting={bulkSubmitting}
            onPaid={() => submitPaystackBulk(bulkPaymentSession)}
          />
        ) : null}

        {bulkStep === "creating" ? (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-blue-800">{bulkSubmitting ? t("bulk.creating") : t("bulk.created")}</div>
        ) : null}

        {bulkStep === "complete" ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-green-800">{t("bulk.created")}</div>
            {bulkResults.map((result) => (
              <SummaryRow key={`${result.row}-${result.ok ? "ok" : "error"}`} label={`Row ${result.row}`} value={result.ok ? result.trackingRef : result.error} />
            ))}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function markBulkVerified(row: BulkDraft): BulkDraft {
  return { ...row, phoneVerified: true };
}

function bulkCsvHeaders() {
  return [
    "originCountry",
    "destinationCountry",
    "senderFullName",
    "senderEmail",
    "senderPhone",
    "senderAddress1",
    "senderAddress2",
    "senderCity",
    "senderState",
    "senderPostcode",
    "recipientFullName",
    "recipientEmail",
    "recipientPhone",
    "recipientAddress1",
    "recipientAddress2",
    "recipientCity",
    "recipientState",
    "recipientPostcode",
    "category",
    "declaredValue",
    "insurance",
    "lengthCm",
    "widthCm",
    "heightCm",
    "weightKg",
    "customsReason",
    "customsDescription",
    "hsCode",
    "quantity",
    "customsValue",
    "countryOfOrigin",
    "notes",
  ];
}

function parseBulkCsv(text: string, config: TenantConfig): { rows: BulkDraft[]; errors: string[] } {
  const parsed = parseCsv(text);
  const headers = parsed.headers;
  const missing = bulkCsvHeaders().filter((header) => !headers.includes(header));
  if (missing.length > 0) {
    return { rows: [], errors: [`Missing columns: ${missing.join(", ")}`] };
  }
  const index = Object.fromEntries(headers.map((header, i) => [header, i]));
  const rows: BulkDraft[] = [];
  const errors: string[] = [];

  parsed.rows.forEach((rawRow, rowIndex) => {
    const rowNumber = rowIndex + 1;
    const value = (key: string) => String(rawRow[index[key]] ?? "").trim();
    const corridor = config.corridors.find(
      (item) => item.originCountry === value("originCountry") && item.destinationCountry === value("destinationCountry"),
    );
    if (!corridor) {
      errors.push(`Row ${rowNumber}: corridor is not enabled.`);
      return;
    }
    const draft: BulkDraft = {
      _row: rowNumber,
      corridorId: corridor.id,
      sender: {
        ...emptyParty(corridor.originCountry),
        fullName: value("senderFullName"),
        email: value("senderEmail"),
        phone: value("senderPhone"),
        address1: value("senderAddress1"),
        address2: value("senderAddress2"),
        city: value("senderCity"),
        state: value("senderState"),
        postcode: value("senderPostcode"),
      },
      recipient: {
        ...emptyParty(corridor.destinationCountry),
        fullName: value("recipientFullName"),
        email: value("recipientEmail"),
        phone: value("recipientPhone"),
        address1: value("recipientAddress1"),
        address2: value("recipientAddress2"),
        city: value("recipientCity"),
        state: value("recipientState"),
        postcode: value("recipientPostcode"),
      },
      goods: {
        category: value("category"),
        declaredValue: sanitizeNumber(value("declaredValue")),
        insurance: value("insurance") || "NONE",
        notes: value("notes"),
      },
      pkg: {
        lengthCm: sanitizeNumber(value("lengthCm")),
        widthCm: sanitizeNumber(value("widthCm")),
        heightCm: sanitizeNumber(value("heightCm")),
        weightKg: sanitizeNumber(value("weightKg")),
      },
      phoneVerified: false,
      customs: {
        type: "DDU",
        reasonForExport: value("customsReason"),
        items: [
          {
            description: value("customsDescription"),
            hsCode: value("hsCode"),
            quantity: sanitizeNumber(value("quantity")),
            declaredValue: sanitizeNumber(value("customsValue")),
            countryOfOrigin: value("countryOfOrigin") || corridor.originCountry,
          },
        ],
      },
    };
    const validation = validateShipmentDraft(draft, config, { requirePhoneVerified: false });
    if (!validation.ok) {
      errors.push(`Row ${rowNumber}: ${validation.issues.join(", ")}`);
      return;
    }
    rows.push(draft);
  });

  return { rows, errors };
}

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    if (inQuotes) {
      if (char === `"` && normalized[i + 1] === `"`) {
        field += `"`;
        i += 1;
      } else if (char === `"`) {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === `"`) {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      current.push(field);
      field = "";
      continue;
    }
    if (char === "\n") {
      current.push(field);
      if (current.some((item) => item.trim())) rows.push(current);
      current = [];
      field = "";
      continue;
    }
    field += char;
  }
  current.push(field);
  if (current.some((item) => item.trim())) rows.push(current);
  return { headers: (rows[0] ?? []).map((item) => item.trim()), rows: rows.slice(1) };
}

function downloadTextFile(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function CountrySelect({
  label,
  countries,
  locale,
  value,
  onChange,
}: {
  label: string;
  countries: CountryOption[];
  locale: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-gray-700">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="field">
        <option value="">{label}</option>
        {countries.map((country) => (
          <option key={country.iso2} value={country.name}>
            {displayCountryName(country.name, locale)}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextInput({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-gray-700">
        {label}
        {required ? " *" : ""}
      </span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className="field disabled:bg-gray-50 disabled:text-gray-500" />
    </label>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  placeholder = "0",
  min,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  placeholder?: string;
  min?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-gray-700">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        value={value > 0 ? value : ""}
        min={min}
        placeholder={placeholder}
        onChange={(event) => onChange(sanitizeNumber(event.target.value))}
        className="field"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block sm:col-span-2">
      <span className="mb-1 block text-sm text-gray-700">{label}</span>
      <textarea value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="field min-h-[88px]" />
    </label>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
      <h2 className="mb-3 text-lg font-semibold text-gray-950">{title}</h2>
      {children}
    </section>
  );
}

function SummaryRow({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={["flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white", compact ? "p-3" : "p-3"].join(" ")}>
      <span className="text-gray-600">{label}</span>
      <span className="text-end font-semibold text-gray-950">{value}</span>
    </div>
  );
}

function PriceRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={["flex items-center justify-between gap-3", strong ? "font-semibold text-gray-950" : ""].join(" ")}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
