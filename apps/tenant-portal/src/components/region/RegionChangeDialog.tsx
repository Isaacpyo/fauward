import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Select";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";

type RegionRequest = { id: string; requestedRegion: string; status: string; decisionReason: string | null; decidedAt: string | null; createdAt: string };
type RegionState = { current: string | null; regions: Array<{ key: string; label: string; paymentProviders: string[] }>; latest: RegionRequest | null };

const QUERY_KEY = ["tenant-region-change"];

/** L5 (WP-2.6): request a region; Fauward approves (applied at once) or rejects with a reason shown here. */
export function RegionChangeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const state = useQuery({ queryKey: QUERY_KEY, queryFn: async () => (await api.get<RegionState>("/v1/tenant/region-change-requests")).data, enabled: open });
  const [requestedRegion, setRequestedRegion] = useState("");
  const submit = useMutation({
    mutationFn: async () => (await api.post<{ request: RegionRequest }>("/v1/tenant/region-change-requests", { requestedRegion })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY })
  });

  const setOpen = (next: boolean) => {
    if (!next) {
      submit.reset();
      setRequestedRegion("");
    }
    onOpenChange(next);
  };

  const data = state.data;
  const label = (key: string) => data?.regions.find((region) => region.key === key)?.label ?? key;
  const options = (data?.regions ?? []).filter((region) => region.key !== data?.current).map((region) => ({ label: region.label, value: region.key }));
  const pending = data?.latest?.status === "PENDING" ? data.latest : null;
  const rejected = data?.latest?.status === "REJECTED" ? data.latest : null;

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title="Request region change"
      description="Changing region can affect payment options, currency defaults, operational data handling, and customer-facing settings."
    >
      <div className="space-y-4">
        {state.isError ? <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{apiErrorMessage(state.error, "Region options could not be loaded.")}</p> : null}
        {data ? (
          <>
            <p className="text-sm text-gray-700">
              Current region: <span className="font-semibold">{data.current ? label(data.current) : "—"}</span>
            </p>
            {pending ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-testid="region-pending">
                Waiting for Fauward to review your request to move to {label(pending.requestedRegion)}. A new request replaces it.
              </p>
            ) : null}
            {rejected ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" data-testid="region-rejected">
                Your request to move to {label(rejected.requestedRegion)} was not approved{rejected.decisionReason ? `: ${rejected.decisionReason}` : "."}
              </p>
            ) : null}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Requested region</label>
              <Select value={requestedRegion} onValueChange={setRequestedRegion} options={options} placeholder="Choose a region" />
            </div>
          </>
        ) : null}
        {submit.isError ? <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{apiErrorMessage(submit.error, "Could not submit the region change request.")}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button onClick={() => submit.mutate()} disabled={!requestedRegion || submit.isPending || !data}>
            {submit.isPending ? "Submitting..." : "Request approval"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
