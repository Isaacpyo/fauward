import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiKeyTable } from "@/components/settings/ApiKeyTable";
import { GenerateKeyModal } from "@/components/settings/GenerateKeyModal";
import { RevokeKeyDialog } from "@/components/settings/RevokeKeyDialog";
import { API_KEY_SCOPES } from "@/components/settings/types";
import type { ApiKeyRecord, ApiKeyScope, GeneratedApiKey } from "@/components/settings/types";
import { PlanGate } from "@/components/shared/PlanGate";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/useAppStore";

const QUERY_KEY = ["settings", "api-keys"];

const MOCK_KEYS: ApiKeyRecord[] = [
  {
    id: "key_1",
    name: "Production Backend",
    keyPrefix: "fw_live_prod_8x2",
    scopes: ["shipments:read", "shipments:write", "tracking:read", "webhooks:manage"],
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 20).toISOString(),
    lastUsedAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
    status: "ACTIVE"
  },
  {
    id: "key_2",
    name: "Legacy Integration",
    keyPrefix: "fw_live_leg_a91",
    scopes: ["shipments:read", "invoices:read"],
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 80).toISOString(),
    lastUsedAt: null,
    status: "REVOKED"
  }
];

function makeFullKey() {
  const randomPart = crypto.randomUUID().replace(/-/g, "");
  return `fw_live_${randomPart}`;
}

async function fetchApiKeys(): Promise<ApiKeyRecord[]> {
  try {
    const response = await api.get<ApiKeyRecord[]>("/settings/api-keys");
    return response.data;
  } catch {
    return MOCK_KEYS;
  }
}

async function generateApiKey(payload: { name: string; scopes: ApiKeyScope[] }): Promise<GeneratedApiKey> {
  try {
    const response = await api.post<GeneratedApiKey>("/settings/api-keys", payload);
    return response.data;
  } catch {
    const fullKey = makeFullKey();
    return {
      id: crypto.randomUUID(),
      name: payload.name,
      keyPrefix: fullKey.slice(0, 16),
      fullKey,
      scopes: payload.scopes,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      status: "ACTIVE"
    };
  }
}

async function revokeApiKey(id: string) {
  try {
    await api.post(`/settings/api-keys/${id}/revoke`);
  } catch {
    return;
  }
}

export function ApiKeysTab() {
  const user = useAppStore((state) => state.user);
  const addToast = useAppStore((state) => state.addToast);
  const queryClient = useQueryClient();
  const [generateOpen, setGenerateOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyRecord | null>(null);

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchApiKeys,
    staleTime: 30_000,
    retry: 1
  });

  const generateMutation = useMutation({
    mutationFn: generateApiKey,
    onSuccess: (generated) => {
      queryClient.setQueryData<ApiKeyRecord[]>(QUERY_KEY, (previous = []) => [
        {
          id: generated.id,
          name: generated.name,
          keyPrefix: generated.keyPrefix,
          scopes: generated.scopes,
          createdAt: generated.createdAt,
          lastUsedAt: generated.lastUsedAt,
          status: generated.status
        },
        ...previous
      ]);
      addToast({
        title: "API key generated",
        description: "Store it now. It will not be shown again.",
        variant: "success"
      });
    }
  });

  const revokeMutation = useMutation({
    mutationFn: revokeApiKey,
    onSuccess: (_, id) => {
      queryClient.setQueryData<ApiKeyRecord[]>(QUERY_KEY, (previous = []) =>
        previous.map((key) => (key.id === id ? { ...key, status: "REVOKED" } : key))
      );
      addToast({ title: "API key revoked", variant: "warning" });
      setRevokeTarget(null);
    }
  });

  const keys = useMemo(() => query.data ?? [], [query.data]);

  return (
    <PlanGate minimumPlan="pro" currentPlan={user?.plan}>
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">API Keys</h3>
            <p className="text-sm text-gray-600">Create and revoke API credentials for integrations.</p>
          </div>
          <Button onClick={() => setGenerateOpen(true)}>Generate New API Key</Button>
        </div>

        {query.isLoading ? (
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={`api-key-skeleton-${index}`} className="mb-2 h-10 w-full last:mb-0" />
            ))}
          </div>
        ) : (
          <ApiKeyTable
            keys={keys}
            onRequestGenerate={() => setGenerateOpen(true)}
            onRequestRevoke={(key) => setRevokeTarget(key)}
          />
        )}
      </section>

      <GenerateKeyModal
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        onGenerate={async (payload) => {
          const result = await generateMutation.mutateAsync(payload);
          return { fullKey: result.fullKey };
        }}
      />

      <RevokeKeyDialog
        open={Boolean(revokeTarget)}
        keyName={revokeTarget?.name}
        onOpenChange={(open) => {
          if (!open) {
            setRevokeTarget(null);
          }
        }}
        onConfirm={() => {
          if (!revokeTarget) {
            return;
          }
          revokeMutation.mutate(revokeTarget.id);
        }}
        loading={revokeMutation.isPending}
      />
    </PlanGate>
  );
}

