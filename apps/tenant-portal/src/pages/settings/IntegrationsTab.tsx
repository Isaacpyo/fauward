import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ErrorState } from "@/components/shared/ErrorState";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { Textarea } from "@/components/ui/Textarea";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";
import { useTenantStore } from "@/stores/useTenantStore";

// L11 (WP-2.12): the tenant's own payment gateways (collecting from its customers; separate from Fauward billing).
// Everything is saved through the API, secrets encrypted server-side; nothing is kept in the browser (S12). Secrets are
// write-only: the API reports "set / not set" and an empty field keeps the saved value.

type PaymentProvider = "STRIPE" | "PAYSTACK" | "FLUTTERWAVE" | "BANK_TRANSFER" | "COD";
type PaymentRegion = "africa" | "europe" | "northAmerica" | "global";
type GatewayStatus = "UNVERIFIED" | "VERIFIED" | "FAILED" | "DISABLED";

export type TenantGateway = {
  provider: PaymentProvider;
  configured: boolean;
  enabled: boolean;
  mode: "TEST" | "LIVE" | null;
  publicKey: string | null;
  config: Record<string, string | number | undefined>;
  secretKeySet: boolean;
  webhookSecretSet: boolean;
  encryptionKeySet: boolean;
  testable: boolean;
  status: GatewayStatus;
  lastVerifiedAt: string | null;
  lastError: string | null;
  updatedAt: string | null;
};
type GatewayList = { activeProvider: PaymentProvider | null; gateways: TenantGateway[] };

const KEY = ["tenant", "payment-gateways"];

const providerLabels: Record<PaymentProvider, string> = {
  STRIPE: "Stripe",
  PAYSTACK: "Paystack",
  FLUTTERWAVE: "Flutterwave",
  BANK_TRANSFER: "Bank transfer / manual",
  COD: "Cash on delivery"
};

const providerDescriptions: Record<PaymentProvider, string> = {
  STRIPE: "Your own Stripe account for customer card payments.",
  PAYSTACK: "Your Paystack account for card, bank, transfer and mobile money payments.",
  FLUTTERWAVE: "Your Flutterwave account for regional collections.",
  BANK_TRANSFER: "Offline settlement details for invoice-based or manual customer remittance.",
  COD: "Cash-on-delivery collection rules and remittance instructions for operations and finance."
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
  if (region.includes("africa") || ["NGN", "GHS", "KES", "ZAR", "UGX", "TZS", "RWF", "XOF", "XAF"].includes(currency) || ["-ng", "-gh", "-ke", "-za"].some((suffix) => locale.includes(suffix))) return "africa";
  if (region.includes("europe") || region.includes("uk") || ["GBP", "EUR", "CHF", "SEK", "NOK", "DKK"].includes(currency)) return "europe";
  if (region.includes("america") || ["USD", "CAD"].includes(currency) || locale.includes("-us") || locale.includes("-ca")) return "northAmerica";
  return "global";
}

const STATUS_BADGE: Record<GatewayStatus, { label: string; variant: "success" | "danger" | "warning" | "neutral" }> = {
  VERIFIED: { label: "Verified", variant: "success" },
  FAILED: { label: "Test failed", variant: "danger" },
  UNVERIFIED: { label: "Not tested", variant: "warning" },
  DISABLED: { label: "Disabled", variant: "neutral" }
};

type SecretField = "secretKey" | "webhookSecret" | "encryptionKey";
const SECRET_FIELDS: Record<PaymentProvider, Array<{ field: SecretField; label: string; setKey: "secretKeySet" | "webhookSecretSet" | "encryptionKeySet" }>> = {
  STRIPE: [
    { field: "secretKey", label: "Secret key", setKey: "secretKeySet" },
    { field: "webhookSecret", label: "Webhook signing secret", setKey: "webhookSecretSet" }
  ],
  PAYSTACK: [{ field: "secretKey", label: "Secret key", setKey: "secretKeySet" }],
  FLUTTERWAVE: [
    { field: "secretKey", label: "Secret key", setKey: "secretKeySet" },
    { field: "encryptionKey", label: "Encryption key", setKey: "encryptionKeySet" }
  ],
  BANK_TRANSFER: [],
  COD: []
};
const PUBLIC_KEY_LABEL: Partial<Record<PaymentProvider, string>> = { STRIPE: "Publishable key", PAYSTACK: "Public key", FLUTTERWAVE: "Public key" };
const CONFIG_FIELDS: Record<PaymentProvider, Array<{ key: string; label: string; multiline?: boolean; numeric?: boolean }>> = {
  STRIPE: [{ key: "accountId", label: "Connected account ID" }],
  PAYSTACK: [{ key: "merchantEmail", label: "Merchant email" }],
  FLUTTERWAVE: [],
  BANK_TRANSFER: [
    { key: "bankName", label: "Bank name" },
    { key: "accountName", label: "Account name" },
    { key: "accountNumber", label: "Account number" },
    { key: "sortCode", label: "Sort code / routing number" },
    { key: "iban", label: "IBAN / SWIFT" },
    { key: "instructions", label: "Customer payment instructions", multiline: true }
  ],
  COD: [
    { key: "remittanceWindowDays", label: "Remittance window (days)", numeric: true },
    { key: "instructions", label: "Instructions for field operators and finance", multiline: true }
  ]
};

type Draft = { enabled: boolean; publicKey: string; config: Record<string, string>; secrets: Partial<Record<SecretField, string>>; removed: SecretField[] };

function draftOf(gateway: TenantGateway): Draft {
  const config: Record<string, string> = {};
  for (const field of CONFIG_FIELDS[gateway.provider]) config[field.key] = gateway.config[field.key] === undefined ? "" : String(gateway.config[field.key]);
  return { enabled: gateway.enabled, publicKey: gateway.publicKey ?? "", config, secrets: {}, removed: [] };
}

function payloadOf(gateway: TenantGateway, draft: Draft) {
  const config: Record<string, string | number> = {};
  for (const field of CONFIG_FIELDS[gateway.provider]) {
    const value = draft.config[field.key]?.trim() ?? "";
    if (value === "") continue;
    config[field.key] = field.numeric ? Number(value) : value;
  }
  const body: Record<string, unknown> = { enabled: draft.enabled, config };
  if (PUBLIC_KEY_LABEL[gateway.provider] && draft.publicKey !== (gateway.publicKey ?? "")) body.publicKey = draft.publicKey.trim();
  for (const { field } of SECRET_FIELDS[gateway.provider]) {
    if (draft.removed.includes(field)) body[field] = "";
    else if (draft.secrets[field]?.trim()) body[field] = draft.secrets[field]!.trim();
  }
  return body;
}

function GatewayCard({ gateway, isDefault }: { gateway: TenantGateway; isDefault: boolean }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => draftOf(gateway));
  useEffect(() => setDraft(draftOf(gateway)), [gateway]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: KEY });
  const save = useMutation({
    mutationFn: async () => (await api.put<TenantGateway>(`/v1/tenant/payment-gateways/${gateway.provider}`, payloadOf(gateway, draft))).data,
    onSuccess: refresh
  });
  const test = useMutation({
    mutationFn: async () => (await api.post<TenantGateway>(`/v1/tenant/payment-gateways/${gateway.provider}/test`)).data,
    onSuccess: refresh
  });
  const status = STATUS_BADGE[gateway.status];
  const label = providerLabels[gateway.provider];

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4" data-testid={`gateway-${gateway.provider}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-base font-semibold text-gray-900">
            {label}
            {isDefault ? <span className="ml-2 text-xs font-medium text-gray-500">(default)</span> : null}
          </h4>
          <p className="mt-1 text-sm text-gray-600">{providerDescriptions[gateway.provider]}</p>
        </div>
        <div className="flex items-center gap-3">
          {gateway.configured ? <Badge variant={status.variant}>{status.label}</Badge> : <Badge variant="neutral">Not set up</Badge>}
          {gateway.mode && gateway.testable ? <Badge variant="info">{gateway.mode === "TEST" ? "Test mode" : "Live mode"}</Badge> : null}
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <Switch checked={draft.enabled} onCheckedChange={(enabled) => setDraft((current) => ({ ...current, enabled }))} />
            Enabled
          </label>
        </div>
      </div>
      {gateway.lastError ? <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{gateway.lastError}</p> : null}
      {gateway.lastVerifiedAt && gateway.status === "VERIFIED" ? <p className="mt-2 text-xs text-gray-500">Verified {new Date(gateway.lastVerifiedAt).toLocaleString()}</p> : null}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {PUBLIC_KEY_LABEL[gateway.provider] ? (
          <Input aria-label={`${label} ${PUBLIC_KEY_LABEL[gateway.provider]}`} placeholder={PUBLIC_KEY_LABEL[gateway.provider]} value={draft.publicKey} onChange={(event) => setDraft((current) => ({ ...current, publicKey: event.target.value }))} />
        ) : null}
        {SECRET_FIELDS[gateway.provider].map(({ field, label: fieldLabel, setKey }) => {
          const isSet = gateway[setKey] && !draft.removed.includes(field);
          return (
            <div key={field} className="flex items-center gap-2">
              <Input
                type="password"
                autoComplete="off"
                aria-label={`${label} ${fieldLabel}`}
                placeholder={isSet ? `${fieldLabel}: saved (leave blank to keep)` : fieldLabel}
                value={draft.secrets[field] ?? ""}
                onChange={(event) => setDraft((current) => ({ ...current, secrets: { ...current.secrets, [field]: event.target.value }, removed: current.removed.filter((item) => item !== field) }))}
              />
              {isSet ? (
                <Button variant="secondary" onClick={() => setDraft((current) => ({ ...current, removed: [...current.removed, field], secrets: { ...current.secrets, [field]: "" } }))}>
                  Remove
                </Button>
              ) : null}
            </div>
          );
        })}
        {CONFIG_FIELDS[gateway.provider].map((field) =>
          field.multiline ? (
            <Textarea key={field.key} aria-label={`${label} ${field.label}`} placeholder={field.label} className="md:col-span-2" value={draft.config[field.key] ?? ""} onChange={(event) => setDraft((current) => ({ ...current, config: { ...current.config, [field.key]: event.target.value } }))} />
          ) : (
            <Input key={field.key} type={field.numeric ? "number" : "text"} aria-label={`${label} ${field.label}`} placeholder={field.label} value={draft.config[field.key] ?? ""} onChange={(event) => setDraft((current) => ({ ...current, config: { ...current.config, [field.key]: event.target.value } }))} />
          )
        )}
      </div>
      {save.isError ? <p className="mt-2 text-sm text-red-700">{apiErrorMessage(save.error, `${label} could not be saved.`)}</p> : null}
      {test.isError ? <p className="mt-2 text-sm text-red-700">{apiErrorMessage(test.error, "The connection test could not run.")}</p> : null}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {gateway.testable ? (
          <Button variant="secondary" onClick={() => test.mutate()} loading={test.isPending} disabled={test.isPending || !gateway.secretKeySet || !gateway.enabled} title={gateway.secretKeySet ? undefined : "Save a secret key first"}>
            Test connection
          </Button>
        ) : null}
        <Button onClick={() => save.mutate()} loading={save.isPending} disabled={save.isPending}>
          Save {label}
        </Button>
      </div>
    </section>
  );
}

export function IntegrationsTab() {
  const tenant = useTenantStore((state) => state.tenant);
  const queryClient = useQueryClient();
  const gateways = useQuery({ queryKey: KEY, queryFn: async () => (await api.get<GatewayList>("/v1/tenant/payment-gateways")).data });
  const setDefault = useMutation({
    mutationFn: async (activeProvider: PaymentProvider) => (await api.patch<GatewayList>("/v1/tenant/payment-gateways", { activeProvider })).data,
    onSuccess: (data) => queryClient.setQueryData(KEY, data)
  });
  const paymentRegion = inferPaymentRegion({ region: tenant?.region, currency: tenant?.currency, locale: tenant?.locale });
  const regional = regionProviderMap[paymentRegion];
  const rows = gateways.data?.gateways ?? [];
  const ordered = [...rows.filter((row) => regional.includes(row.provider)), ...rows.filter((row) => !regional.includes(row.provider))];
  const enabled = rows.filter((row) => row.enabled);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
        <h3 className="text-base font-semibold text-blue-900">Payment integrations</h3>
        <p className="mt-1 text-sm text-blue-800">Your own gateways for collecting money from your customers. This is separate from your Fauward subscription. Keys are stored encrypted and are never shown again.</p>
      </div>
      {gateways.isError ? <ErrorState title="Payment integrations could not be loaded" description={apiErrorMessage(gateways.error, "The integrations service returned an error.")} onRetry={() => void gateways.refetch()} /> : null}
      {gateways.isLoading ? <p className="text-sm text-gray-500">Loading payment integrations…</p> : null}
      {gateways.data ? (
        <>
          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <h4 className="text-base font-semibold text-gray-900">Default customer payment method</h4>
            {enabled.length === 0 ? <p className="mt-1 text-sm text-gray-600">Enable and save a provider below to choose a default.</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {enabled.map((row) => (
                <Button key={row.provider} variant={gateways.data.activeProvider === row.provider ? "primary" : "secondary"} onClick={() => setDefault.mutate(row.provider)} disabled={setDefault.isPending || gateways.data.activeProvider === row.provider}>
                  {providerLabels[row.provider]}
                </Button>
              ))}
            </div>
            {setDefault.isError ? <p className="mt-2 text-sm text-red-700">{apiErrorMessage(setDefault.error, "The default could not be changed.")}</p> : null}
          </section>
          <div className="space-y-5">
            {ordered.map((row) => (
              <GatewayCard key={row.provider} gateway={row} isDefault={gateways.data.activeProvider === row.provider} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
