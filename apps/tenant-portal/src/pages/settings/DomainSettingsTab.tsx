import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock3, Copy, ExternalLink, Globe2, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useTenantStore } from "@/stores/useTenantStore";

type DomainStatus = {
  status: "NOT_CONFIGURED" | "PENDING_DNS" | "ACTIVE";
  domain?: string | null;
  cname?: {
    host: string;
    value: string;
    type: "CNAME";
  } | null;
};

const DEV_DOMAIN_STORAGE_KEY = "fw_dev_custom_domain";
const CNAME_TARGET = "cname.fauward.com";

function normalizeDomain(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "");
}

function isValidDomain(value: string) {
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value);
}

function statusDisplay(status: DomainStatus["status"]) {
  if (status === "ACTIVE") {
    return {
      label: "Verified",
      icon: CheckCircle2,
      className: "border-emerald-200 bg-emerald-50 text-emerald-700"
    };
  }
  if (status === "PENDING_DNS") {
    return {
      label: "Pending DNS",
      icon: Clock3,
      className: "border-amber-200 bg-amber-50 text-amber-800"
    };
  }
  return {
    label: "Not configured",
    icon: XCircle,
    className: "border-gray-200 bg-gray-50 text-gray-600"
  };
}

export function DomainSettingsTab() {
  const tenant = useTenantStore((state) => state.tenant);
  const hasToken = Boolean(getAccessToken());
  const [customDomain, setCustomDomain] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const devStatus = useMemo<DomainStatus>(() => {
    const storedDomain = localStorage.getItem(DEV_DOMAIN_STORAGE_KEY);
    if (!storedDomain) {
      return { status: "NOT_CONFIGURED", domain: null, cname: null };
    }
    return {
      status: "PENDING_DNS",
      domain: storedDomain,
      cname: { host: storedDomain, value: CNAME_TARGET, type: "CNAME" }
    };
  }, [message]);

  const statusQuery = useQuery({
    queryKey: ["domain-status"],
    queryFn: async () => {
      const response = await api.get<DomainStatus>("/v1/tenant/domain/status");
      return response.data;
    },
    enabled: hasToken,
    retry: 1
  });

  const status = hasToken ? statusQuery.data : devStatus;
  const configuredDomain = status?.domain ?? "";
  const dnsHost = status?.cname?.host ?? (normalizeDomain(customDomain) || "track.yourcompany.com");
  const dnsTarget = status?.cname?.value ?? CNAME_TARGET;
  const displayStatus = statusDisplay(status?.status ?? "NOT_CONFIGURED");
  const StatusIcon = displayStatus.icon;

  useEffect(() => {
    if (configuredDomain && !customDomain) {
      setCustomDomain(configuredDomain);
    }
  }, [configuredDomain, customDomain]);

  const saveMutation = useMutation({
    mutationFn: async (domain: string) => {
      const normalized = normalizeDomain(domain);
      if (!isValidDomain(normalized)) {
        throw new Error("Enter a valid domain such as track.company.com.");
      }

      if (!hasToken) {
        localStorage.setItem(DEV_DOMAIN_STORAGE_KEY, normalized);
        return;
      }

      await api.patch("/v1/tenant/domain", { domain: normalized });
    },
    onSuccess: () => {
      setMessage("Domain saved. Add the DNS record below, then verify it.");
      setError(null);
      statusQuery.refetch();
    },
    onError: (mutationError) => {
      const maybeAxios = mutationError as { response?: { data?: { error?: string } }; message?: string };
      setError(maybeAxios.response?.data?.error ?? maybeAxios.message ?? "Unable to update domain");
      setMessage(null);
    }
  });

  const verifyMutation = useMutation({
    mutationFn: async () => {
      if (!hasToken) {
        setMessage("Dev session: DNS lookup is skipped. Use a real tenant API session to verify live DNS.");
        return;
      }
      await statusQuery.refetch();
    },
    onSuccess: () => {
      if (hasToken) {
        setMessage(statusQuery.data?.status === "ACTIVE" ? "Domain verified." : "DNS is still pending.");
      }
      setError(null);
    },
    onError: () => {
      setError("Unable to verify domain right now.");
      setMessage(null);
    }
  });

  async function copyDnsValue() {
    await navigator.clipboard.writeText(dnsTarget);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Globe2 className="h-5 w-5 text-[var(--tenant-primary)]" />
              <h3 className="text-lg font-semibold text-gray-900">Custom customer domain</h3>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
              Use a branded domain for customer-facing tracking and booking links. Add a CNAME record with your DNS provider,
              then verify the domain here.
            </p>
          </div>
          <span className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold", displayStatus.className)}>
            <StatusIcon size={14} />
            {displayStatus.label}
          </span>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto]">
          <Input
            value={customDomain}
            onChange={(event) => setCustomDomain(event.target.value)}
            placeholder="track.mycompany.com"
          />
          <Button
            type="button"
            onClick={() => saveMutation.mutate(customDomain)}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? "Saving..." : "Save domain"}
          </Button>
        </div>

        {configuredDomain ? (
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-gray-100 px-3 py-1 font-medium text-gray-700">{configuredDomain}</span>
            <a
              href={`https://${configuredDomain}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 font-medium text-gray-700 hover:bg-gray-200"
            >
              Open domain
              <ExternalLink size={13} />
            </a>
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
        <h4 className="text-sm font-semibold text-gray-900">DNS record to add</h4>
        <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="grid grid-cols-3 border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
            <span>Type</span>
            <span>Name / Host</span>
            <span>Value / Target</span>
          </div>
          <div className="grid grid-cols-3 items-center gap-3 px-4 py-3 text-sm text-gray-800">
            <code>CNAME</code>
            <code className="break-all">{dnsHost}</code>
            <div className="flex min-w-0 items-center gap-2">
              <code className="break-all">{dnsTarget}</code>
              <button
                type="button"
                onClick={copyDnsValue}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 hover:bg-gray-50"
                aria-label="Copy CNAME target"
              >
                <Copy size={14} />
              </button>
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          DNS changes can take a few minutes to propagate. Keep your current Fauward domain active until verification succeeds.
        </p>
        {copied ? <p className="mt-2 text-xs font-semibold text-emerald-700">Copied CNAME target.</p> : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => verifyMutation.mutate()}
          disabled={verifyMutation.isPending || status?.status === "NOT_CONFIGURED"}
        >
          {verifyMutation.isPending ? "Checking..." : "Verify domain"}
        </Button>
        <Button asChild variant="secondary">
          <a href={`https://${tenant?.domain ?? "portal.fauward.com"}`} target="_blank" rel="noreferrer">
            Open current portal domain
          </a>
        </Button>
      </div>

      {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p> : null}
    </div>
  );
}
