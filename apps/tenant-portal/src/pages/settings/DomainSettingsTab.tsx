import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type DomainStatus = {
  customDomain?: string | null;
  verified?: boolean;
  cnameTarget?: string;
};

export function DomainSettingsTab() {
  const [customDomain, setCustomDomain] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: ["domain-status"],
    queryFn: async () => {
      const response = await api.get<DomainStatus>("/v1/tenant/domain/status");
      return response.data;
    },
    retry: 1
  });

  const saveMutation = useMutation({
    mutationFn: async (domain: string) => {
      await api.patch("/v1/tenant/domain", { customDomain: domain });
    },
    onSuccess: () => {
      setMessage("Domain updated. Complete DNS verification to activate it.");
      setError(null);
      statusQuery.refetch();
    },
    onError: (mutationError) => {
      const maybeAxios = mutationError as { response?: { data?: { error?: string } }; message?: string };
      setError(maybeAxios.response?.data?.error ?? maybeAxios.message ?? "Unable to update domain");
      setMessage(null);
    }
  });

  const status = statusQuery.data;
  const tenantSlug = status?.cnameTarget?.split(".")[0] ?? "your-tenant";

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Connect a custom domain for tracking and customer-facing pages.
      </p>

      <Input
        value={customDomain || status?.customDomain || ""}
        onChange={(event) => setCustomDomain(event.target.value)}
        placeholder="track.mycompany.com"
      />

      <Button
        type="button"
        onClick={() => saveMutation.mutate(customDomain || status?.customDomain || "")}
        disabled={saveMutation.isPending}
      >
        {saveMutation.isPending ? "Saving..." : "Save domain"}
      </Button>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
        <p><strong>Verification status:</strong> {status?.verified ? "Verified" : "Pending"}</p>
        <p className="mt-2"><strong>DNS:</strong> Add a CNAME record pointing <code>track.mycompany.com</code> to <code>{tenantSlug}.fauward.com</code>.</p>
      </div>

      {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p> : null}
    </div>
  );
}
