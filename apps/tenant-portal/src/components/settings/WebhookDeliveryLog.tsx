import { Eye } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Table, TableCell, TableRow } from "@/components/ui/Table";
import { formatDateTime } from "@/lib/utils";
import { useTenantStore } from "@/stores/useTenantStore";

import type { WebhookDeliveryLogItem } from "./types";

type WebhookDeliveryLogProps = {
  logs: WebhookDeliveryLogItem[];
  onViewPayload: (log: WebhookDeliveryLogItem) => void;
};

export function WebhookDeliveryLog({ logs, onViewPayload }: WebhookDeliveryLogProps) {
  const tenant = useTenantStore((state) => state.tenant);

  return (
    <Table columns={["Timestamp", "Event Type", "Status Code", "Latency", "Attempts", "Actions"]}>
      {logs.map((log) => {
        const tone =
          log.statusCode >= 500 ? "bg-red-100 text-red-700" : log.statusCode >= 400 ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-700";
        return (
          <TableRow key={log.id}>
            <TableCell className="text-xs text-gray-700">{formatDateTime(log.timestamp, tenant)}</TableCell>
            <TableCell className="font-mono text-xs">{log.eventType}</TableCell>
            <TableCell>
              <span className={`inline-flex rounded-full px-2 py-1 font-mono text-xs ${tone}`}>{log.statusCode}</span>
            </TableCell>
            <TableCell className="font-mono text-xs text-gray-700">{log.latencyMs}ms</TableCell>
            <TableCell className="font-mono text-xs text-gray-700">{log.attempts}</TableCell>
            <TableCell className="text-right">
              <Button variant="secondary" size="sm" onClick={() => onViewPayload(log)} leftIcon={<Eye size={14} />}>
                View Payload
              </Button>
            </TableCell>
          </TableRow>
        );
      })}
    </Table>
  );
}

