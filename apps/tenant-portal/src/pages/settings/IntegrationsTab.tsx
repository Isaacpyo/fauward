import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { Tabs, TabsContent } from "@/components/ui/Tabs";
import { Textarea } from "@/components/ui/Textarea";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { useAppStore } from "@/stores/useAppStore";
import { useTenantStore } from "@/stores/useTenantStore";

type PaymentProvider = "STRIPE" | "PAYSTACK" | "FLUTTERWAVE" | "BANK_TRANSFER" | "COD";
type PaymentRegion = "africa" | "europe" | "northAmerica" | "global";

type ProviderConfig = {
  enabled: boolean;
  accountId?: string;
  publicKey?: string;
  publishableKey?: string;
  secretKey?: string;
  webhookSecret?: string;
  encryptionKey?: string;
  merchantEmail?: string;
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  sortCode?: string;
  iban?: string;
  instructions?: string;
  remittanceWindowDays?: number;
  currency?: string;
};

type PaymentIntegrations = {
  activeProvider: PaymentProvider;
  providers: Record<PaymentProvider, ProviderConfig>;
};

type TenantSettingsResponse = {
  settings?: {
    paymentGateway?: PaymentProvider | null;
    paymentGatewayKey?: string | null;
  } | null;
};

const LOCAL_STORAGE_KEY = "fw_payment_integrations_draft";

const providerLabels: Record<PaymentProvider, string> = {
  STRIPE: "Stripe",
  PAYSTACK: "Paystack",
  FLUTTERWAVE: "Flutterwave",
  BANK_TRANSFER: "Bank transfer / manual",
  COD: "Cash on delivery"
};

const providerDescriptions: Record<PaymentProvider, string> = {
  STRIPE: "Tenant-owned Stripe account and API credentials for customer card payments.",
  PAYSTACK: "Tenant Paystack credentials for card, bank, transfer, and mobile money payments.",
  FLUTTERWAVE: "Tenant Flutterwave credentials for regional collections and gateway switching.",
  BANK_TRANSFER: "Offline settlement details for invoice-based or manual customer remittance.",
  COD: "COD collection rules and remittance instructions for operations and finance."
};

const regionProviderMap: Record<PaymentRegion, PaymentProvider[]> = {
  africa: ["PAYSTACK", "FLUTTERWAVE", "BANK_TRANSFER", "COD"],
  europe: ["STRIPE", "BANK_TRANSFER"],
  northAmerica: ["STRIPE", "BANK_TRANSFER"],
  global: ["STRIPE", "PAYSTACK", "FLUTTERWAVE", "BANK_TRANSFER", "COD"]
};

function inferPaymentRegion(input: { region?: string | null; currency?: string | null; locale?: string | null }): PaymentRegion {
  const region = input.region?.toLowerCase() ?? "";
  const currency = input.currency?.toUpperCase() ?? "";
  const locale = input.locale?.toLowerCase() ?? "";

  if (
    region.includes("africa") ||
    ["NGN", "GHS", "KES", "ZAR", "UGX", "TZS", "RWF", "XOF", "XAF"].includes(currency) ||
    locale.includes("-ng") ||
    locale.includes("-gh") ||
    locale.includes("-ke") ||
    locale.includes("-za")
  ) {
    return "africa";
  }

  if (
    region.includes("europe") ||
    region.includes("uk") ||
    ["GBP", "EUR", "CHF", "SEK", "NOK", "DKK"].includes(currency)
  ) {
    return "europe";
  }

  if (region.includes("america") || ["USD", "CAD"].includes(currency) || locale.includes("-us") || locale.includes("-ca")) {
    return "northAmerica";
  }

  return "global";
}

function regionLabel(region: PaymentRegion) {
  if (region === "africa") return "Africa";
  if (region === "europe") return "Europe";
  if (region === "northAmerica") return "North America";
  return "Global";
}

const defaultIntegrations: PaymentIntegrations = {
  activeProvider: "STRIPE",
  providers: {
    STRIPE: {
      enabled: false,
      accountId: "",
      publishableKey: "",
      secretKey: "",
      webhookSecret: ""
    },
    PAYSTACK: {
      enabled: false,
      publicKey: "",
      secretKey: "",
      merchantEmail: ""
    },
    FLUTTERWAVE: {
      enabled: false,
      publicKey: "",
      secretKey: "",
      encryptionKey: ""
    },
    BANK_TRANSFER: {
      enabled: false,
      bankName: "",
      accountName: "",
      accountNumber: "",
      sortCode: "",
      iban: "",
      instructions: ""
    },
    COD: {
      enabled: false,
      remittanceWindowDays: 3,
      instructions: ""
    }
  }
};

function parseStoredIntegrations(
  paymentGateway: PaymentProvider | null | undefined,
  paymentGatewayKey: string | null | undefined
): PaymentIntegrations {
  if (!paymentGatewayKey) {
    return {
      ...defaultIntegrations,
      activeProvider: paymentGateway ?? defaultIntegrations.activeProvider
    };
  }

  try {
    const parsed = JSON.parse(paymentGatewayKey) as Partial<PaymentIntegrations>;
    return {
      activeProvider: parsed.activeProvider ?? paymentGateway ?? defaultIntegrations.activeProvider,
      providers: {
        ...defaultIntegrations.providers,
        ...(parsed.providers ?? {})
      }
    };
  } catch {
    return {
      ...defaultIntegrations,
      activeProvider: paymentGateway ?? "STRIPE",
      providers: {
        ...defaultIntegrations.providers,
        STRIPE: {
          ...defaultIntegrations.providers.STRIPE,
          enabled: Boolean(paymentGatewayKey),
          secretKey: paymentGatewayKey
        }
      }
    };
  }
}

function readLocalDraft() {
  if (typeof window === "undefined") {
    return defaultIntegrations;
  }

  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return defaultIntegrations;
    const parsed = JSON.parse(raw) as PaymentIntegrations;
    return {
      activeProvider: parsed.activeProvider ?? defaultIntegrations.activeProvider,
      providers: {
        ...defaultIntegrations.providers,
        ...(parsed.providers ?? {})
      }
    };
  } catch {
    return defaultIntegrations;
  }
}

function writeLocalDraft(integrations: PaymentIntegrations) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(integrations));
}

function ProviderSection({
  title,
  description,
  enabled,
  onEnabledChange,
  children
}: {
  title: string;
  description: string;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-base font-semibold text-gray-900">{title}</h4>
          <p className="mt-1 text-sm text-gray-600">{description}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={enabled ? "success" : "neutral"}>{enabled ? "Enabled" : "Disabled"}</Badge>
          <Switch checked={enabled} onCheckedChange={onEnabledChange} />
        </div>
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export function IntegrationsTab() {
  const addToast = useAppStore((state) => state.addToast);
  const tenant = useTenantStore((state) => state.tenant);
  const [subTab, setSubTab] = useState("payments");
  const [integrations, setIntegrations] = useState<PaymentIntegrations>(() => readLocalDraft());
  const hasToken = Boolean(getAccessToken());
  const paymentRegion = inferPaymentRegion({
    region: tenant?.region,
    currency: tenant?.currency,
    locale: tenant?.locale
  });
  const regionalProviders = regionProviderMap[paymentRegion];
  const secondaryProviders = (Object.keys(defaultIntegrations.providers) as PaymentProvider[]).filter(
    (provider) => !regionalProviders.includes(provider)
  );

  const tenantQuery = useQuery({
    queryKey: ["tenant-settings-payment-integrations"],
    queryFn: async () => (await api.get<TenantSettingsResponse>("/v1/tenant/me")).data,
    enabled: hasToken,
    retry: false
  });

  useEffect(() => {
    if (!tenantQuery.data?.settings) {
      return;
    }

    setIntegrations(
      parseStoredIntegrations(
        tenantQuery.data.settings.paymentGateway,
        tenantQuery.data.settings.paymentGatewayKey
      )
    );
  }, [tenantQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async (payload: PaymentIntegrations) => {
      if (!hasToken) {
        writeLocalDraft(payload);
        return;
      }

      await api.patch("/v1/tenant/settings", {
        paymentGateway: payload.activeProvider,
        paymentIntegrations: payload
      });
    },
    onSuccess: () => {
      writeLocalDraft(integrations);
      addToast({
        title: "Payment integrations saved",
        description: hasToken
          ? "Tenant payment collection settings were updated."
          : "Saved locally for this demo session.",
        variant: "success"
      });
    },
    onError: (error) => {
      const maybeAxios = error as { response?: { data?: { error?: string } }; message?: string };
      addToast({
        title: "Could not save payment integrations",
        description: maybeAxios.response?.data?.error ?? maybeAxios.message ?? "Try again.",
        variant: "error"
      });
    }
  });

  const connectedProviders = useMemo(
    () => Object.entries(integrations.providers).filter(([, config]) => config.enabled).length,
    [integrations.providers]
  );

  function updateProvider(provider: PaymentProvider, patch: Partial<ProviderConfig>) {
    setIntegrations((current) => ({
      ...current,
      providers: {
        ...current.providers,
        [provider]: {
          ...current.providers[provider],
          ...patch
        }
      }
    }));
  }

  function renderProviderFields(provider: PaymentProvider) {
    const config = integrations.providers[provider];

    if (provider === "STRIPE") {
      return (
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            value={config.accountId ?? ""}
            onChange={(event) => updateProvider(provider, { accountId: event.target.value })}
            placeholder="Connected account ID"
          />
          <Input
            value={config.publishableKey ?? ""}
            onChange={(event) => updateProvider(provider, { publishableKey: event.target.value })}
            placeholder="Publishable key"
          />
          <Input
            value={config.secretKey ?? ""}
            onChange={(event) => updateProvider(provider, { secretKey: event.target.value })}
            placeholder="Secret key"
          />
          <Input
            value={config.webhookSecret ?? ""}
            onChange={(event) => updateProvider(provider, { webhookSecret: event.target.value })}
            placeholder="Webhook secret"
          />
        </div>
      );
    }

    if (provider === "PAYSTACK") {
      return (
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            value={config.publicKey ?? ""}
            onChange={(event) => updateProvider(provider, { publicKey: event.target.value })}
            placeholder="Public key"
          />
          <Input
            value={config.secretKey ?? ""}
            onChange={(event) => updateProvider(provider, { secretKey: event.target.value })}
            placeholder="Secret key"
          />
          <Input
            value={config.merchantEmail ?? ""}
            onChange={(event) => updateProvider(provider, { merchantEmail: event.target.value })}
            placeholder="Merchant email"
          />
        </div>
      );
    }

    if (provider === "FLUTTERWAVE") {
      return (
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            value={config.publicKey ?? ""}
            onChange={(event) => updateProvider(provider, { publicKey: event.target.value })}
            placeholder="Public key"
          />
          <Input
            value={config.secretKey ?? ""}
            onChange={(event) => updateProvider(provider, { secretKey: event.target.value })}
            placeholder="Secret key"
          />
          <Input
            value={config.encryptionKey ?? ""}
            onChange={(event) => updateProvider(provider, { encryptionKey: event.target.value })}
            placeholder="Encryption key"
          />
        </div>
      );
    }

    if (provider === "BANK_TRANSFER") {
      return (
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              value={config.bankName ?? ""}
              onChange={(event) => updateProvider(provider, { bankName: event.target.value })}
              placeholder="Bank name"
            />
            <Input
              value={config.accountName ?? ""}
              onChange={(event) => updateProvider(provider, { accountName: event.target.value })}
              placeholder="Account name"
            />
            <Input
              value={config.accountNumber ?? ""}
              onChange={(event) => updateProvider(provider, { accountNumber: event.target.value })}
              placeholder="Account number"
            />
            <Input
              value={config.sortCode ?? ""}
              onChange={(event) => updateProvider(provider, { sortCode: event.target.value })}
              placeholder="Sort code / routing number"
            />
            <Input
              value={config.iban ?? ""}
              onChange={(event) => updateProvider(provider, { iban: event.target.value })}
              placeholder="IBAN / SWIFT"
            />
          </div>
          <Textarea
            value={config.instructions ?? ""}
            onChange={(event) => updateProvider(provider, { instructions: event.target.value })}
            placeholder="Customer payment instructions shown on checkout or invoices"
          />
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <Input
          type="number"
          value={String(config.remittanceWindowDays ?? 3)}
          onChange={(event) => updateProvider(provider, { remittanceWindowDays: Number(event.target.value || 0) })}
          placeholder="Remittance window in days"
        />
        <Textarea
          value={config.instructions ?? ""}
          onChange={(event) => updateProvider(provider, { instructions: event.target.value })}
          placeholder="Instructions for field operators and finance on COD settlement handling"
        />
      </div>
    );
  }

  function renderProviderSection(provider: PaymentProvider) {
    return (
      <ProviderSection
        key={provider}
        title={providerLabels[provider]}
        description={providerDescriptions[provider]}
        enabled={integrations.providers[provider].enabled}
        onEnabledChange={(enabled) => updateProvider(provider, { enabled })}
      >
        {renderProviderFields(provider)}
      </ProviderSection>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-blue-900">Tenant payment integrations</h3>
            <p className="mt-1 text-sm text-blue-800">
              This is the tenant&apos;s own connected gateway setup for collecting money from their customers. It is separate from Fauward subscription billing.
            </p>
          </div>
          <Badge variant="primary">{connectedProviders} provider{connectedProviders === 1 ? "" : "s"} enabled</Badge>
        </div>
      </div>

      <Tabs
        value={subTab}
        onValueChange={setSubTab}
        items={[{ value: "payments", label: "Payments" }]}
      >
        <TabsContent value="payments" className="space-y-5">
          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <h4 className="text-base font-semibold text-gray-900">Default customer payment method</h4>
            <p className="mt-1 text-sm text-gray-600">
              Choose which enabled provider should be treated as the default collection channel.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant="info">{regionLabel(paymentRegion)} payment options</Badge>
              <span className="text-xs text-gray-500">
                Based on {tenant?.currency ?? "workspace currency"} and {tenant?.region ?? tenant?.locale ?? "tenant locale"}.
              </span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {[...regionalProviders, ...secondaryProviders].map((provider) => (
                <button
                  key={provider}
                  type="button"
                  onClick={() => setIntegrations((current) => ({ ...current, activeProvider: provider }))}
                  className={`rounded-xl border px-4 py-3 text-left transition ${
                    integrations.activeProvider === provider
                      ? "border-[var(--tenant-primary)] bg-[var(--tenant-primary)]/5"
                      : "border-gray-200 bg-gray-50 hover:border-gray-300"
                  }`}
                >
                  <p className="text-sm font-semibold text-gray-900">{provider.replaceAll("_", " ")}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {integrations.providers[provider].enabled ? "Enabled" : "Not enabled"}
                  </p>
                </button>
              ))}
            </div>
          </section>

          <div className="space-y-5">
            <div>
              <h4 className="mb-3 text-sm font-semibold text-gray-900">{regionLabel(paymentRegion)} providers</h4>
              <div className="space-y-5">{regionalProviders.map((provider) => renderProviderSection(provider))}</div>
            </div>
            {secondaryProviders.length > 0 ? (
              <div>
                <h4 className="mb-3 text-sm font-semibold text-gray-900">Other available providers</h4>
                <div className="space-y-5">{secondaryProviders.map((provider) => renderProviderSection(provider))}</div>
              </div>
            ) : null}
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setIntegrations(defaultIntegrations)}
            >
              Reset
            </Button>
            <Button
              onClick={() => saveMutation.mutate(integrations)}
              loading={saveMutation.isPending}
            >
              Save payment integrations
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
