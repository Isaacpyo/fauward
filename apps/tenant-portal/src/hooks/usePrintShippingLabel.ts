import { useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  LabelGenerationError,
  LabelTimeoutError,
  printShippingLabel
} from "@/lib/shipping-label";
import { useAppStore } from "@/stores/useAppStore";

type PrintLabelOptions = { regenerate?: boolean };
type PrintLabelVariables = {
  shipmentId: string;
  regenerate?: boolean;
  tab: Window | null;
};

export function usePrintShippingLabel() {
  const queryClient = useQueryClient();
  const addToast = useAppStore((state) => state.addToast);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const mutation = useMutation({
    mutationFn: async ({ shipmentId, regenerate, tab }: PrintLabelVariables) => {
      await printShippingLabel(shipmentId, { regenerate, tab });
    },
    onMutate: ({ shipmentId }) => {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.add(shipmentId);
        return next;
      });
    },
    onSuccess: async () => {
      addToast({ title: "Label ready", variant: "success" });
      await queryClient.invalidateQueries({ queryKey: ["shipment-detail"] });
    },
    onError: (error, variables) => {
      // Don't strand a blank placeholder tab on failure or timeout — the label
      // will still surface in the Documents tab via the invalidation above.
      if (variables.tab && !variables.tab.closed) {
        variables.tab.close();
      }
      if (error instanceof LabelTimeoutError) {
        addToast({
          title: "Still generating label",
          description: "Try again in a moment — it may still finish.",
          variant: "warning"
        });
        return;
      }
      const description =
        error instanceof LabelGenerationError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Could not generate the label.";
      addToast({ title: "Label failed", description, variant: "error" });
    },
    onSettled: (_data, _error, variables) => {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(variables.shipmentId);
        return next;
      });
    }
  });

  const printLabel = useCallback(
    (shipmentId: string, opts?: PrintLabelOptions) => {
      // Pending check MUST run before window.open — a double-click on a row
      // that's already generating would otherwise strand a blank tab.
      if (pendingIds.has(shipmentId)) return;

      // Open the tab synchronously inside the user gesture so the browser
      // keeps the popup permission across the queued path's 1.5s–20s poll.
      // Each concurrent click captures its own tab in its own closure.
      // window.open can still return null on a hard popup block — in that
      // case openLabelPdf falls through to the <a>-click fallback.
      const tab = window.open("about:blank", "_blank");
      if (tab) {
        try {
          tab.document.write(
            '<title>Generating label…</title>'
              + '<p style="font:14px sans-serif;padding:24px;color:#374151">Generating shipping label…</p>'
          );
        } catch {
          // Some browsers restrict document.write on cross-origin about:blank
          // tabs — harmless, the navigation below still works.
        }
      }
      mutation.mutate({ shipmentId, regenerate: opts?.regenerate, tab });
    },
    [mutation, pendingIds]
  );

  const isPendingFor = useCallback(
    (shipmentId: string) => pendingIds.has(shipmentId),
    [pendingIds]
  );

  return { printLabel, isPendingFor };
}
