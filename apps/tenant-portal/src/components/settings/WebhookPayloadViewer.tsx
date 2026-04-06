import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";

import type { WebhookDeliveryLogItem } from "./types";

type WebhookPayloadViewerProps = {
  open: boolean;
  log?: WebhookDeliveryLogItem;
  onOpenChange: (open: boolean) => void;
};

export function WebhookPayloadViewer({ open, log, onOpenChange }: WebhookPayloadViewerProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Webhook Payload"
      description={log ? `${log.eventType} at ${new Date(log.timestamp).toLocaleString()}` : undefined}
    >
      {log ? (
        <div className="space-y-3 text-xs">
          <section className="space-y-1">
            <h4 className="font-semibold text-gray-900">Request headers</h4>
            <pre className="overflow-x-auto rounded-md border border-gray-200 bg-gray-50 p-3 font-mono">{JSON.stringify(log.requestHeaders, null, 2)}</pre>
          </section>

          <section className="space-y-1">
            <h4 className="font-semibold text-gray-900">Request body</h4>
            <pre className="overflow-x-auto rounded-md border border-gray-200 bg-gray-50 p-3 font-mono">{JSON.stringify(log.requestBody, null, 2)}</pre>
          </section>

          <section className="space-y-1">
            <h4 className="font-semibold text-gray-900">
              Response <span className="font-mono">{log.statusCode}</span>
            </h4>
            <pre className="overflow-x-auto rounded-md border border-gray-200 bg-gray-50 p-3 font-mono">{JSON.stringify(log.responseHeaders, null, 2)}</pre>
            <pre className="overflow-x-auto rounded-md border border-gray-200 bg-gray-50 p-3 font-mono">{JSON.stringify(log.responseBody ?? {}, null, 2)}</pre>
          </section>

          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}

