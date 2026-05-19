import { Globe2, Plus } from "lucide-react";
import { useState } from "react";

import { useSetDomain } from "@/api/domain";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

function errorMessage(error: unknown) {
  const maybeAxios = error as { response?: { data?: { error?: string; code?: string } }; message?: string };
  return maybeAxios.response?.data?.error ?? maybeAxios.message ?? "Unable to add domain";
}

export function DomainEmptyState() {
  const [domain, setDomain] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const setDomainMutation = useSetDomain();

  function submit() {
    setFormError(null);
    setDomainMutation.mutate(domain, {
      onError: (error) => setFormError(errorMessage(error))
    });
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Globe2 className="h-5 w-5 text-[var(--tenant-primary)]" />
            <h3 className="text-base font-semibold text-gray-900">Add a custom domain</h3>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
            Use a branded subdomain for customer tracking and public booking links.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto]">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Custom domain</span>
          <Input
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
            placeholder="track.yourcompany.com"
            autoComplete="off"
            aria-label="Custom domain"
            error={formError ?? undefined}
          />
        </label>
        <Button
          type="button"
          onClick={submit}
          disabled={setDomainMutation.isPending}
          leftIcon={<Plus size={16} />}
          className="self-end"
        >
          {setDomainMutation.isPending ? "Adding..." : "Add domain"}
        </Button>
      </div>
    </div>
  );
}
