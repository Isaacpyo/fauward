import { ChevronDown, ChevronUp, Webhook } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { Table, TableCell, TableRow } from "@/components/ui/Table";
import { formatDateTime } from "@/lib/utils";
import { useTenantStore } from "@/stores/useTenantStore";

import { SendTestResult } from "./SendTestResult";
import type { WebhookEndpoint, WebhookSendTestResult } from "./types";

type WebhookEndpointTableProps = {
  endpoints: WebhookEndpoint[];
  testResults: Record<string, WebhookSendTestResult | undefined>;
  onAddEndpoint: () => void;
  onEdit: (endpoint: WebhookEndpoint) => void;
  onSendTest: (endpoint: WebhookEndpoint) => void;
  onDelete: (endpoint: WebhookEndpoint) => void;
  onToggleActive: (endpoint: WebhookEndpoint, active: boolean) => void;
};

export function WebhookEndpointTable({
  endpoints,
  testResults,
  onAddEndpoint,
  onEdit,
  onSendTest,
  onDelete,
  onToggleActive
}: WebhookEndpointTableProps) {
  const tenant = useTenantStore((state) => state.tenant);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (endpoints.length === 0) {
    return (
      <EmptyState
        icon={Webhook}
        title="No webhook endpoints configured. Add one to receive real-time event notifications."
        description="Endpoints receive shipment and invoice lifecycle events."
        ctaLabel="Add Endpoint"
        onCtaClick={onAddEndpoint}
      />
    );
  }

  return (
    <Table columns={["URL", "Events", "Status", "Created", "Actions"]}>
      {endpoints.map((endpoint) => {
        const isExpanded = Boolean(expanded[endpoint.id]);
        const result = testResults[endpoint.id];
        return (
          <TableRow key={endpoint.id}>
            <TableCell>
              <p className="max-w-[320px] truncate font-mono text-xs text-gray-800" title={endpoint.url}>
                {endpoint.url}
              </p>
            </TableCell>
            <TableCell>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-2 py-1 text-xs"
                onClick={() => setExpanded((previous) => ({ ...previous, [endpoint.id]: !isExpanded }))}
              >
                <span>{endpoint.events.length} events</span>
                {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              {isExpanded ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {endpoint.events.map((eventName) => (
                    <Badge key={eventName} variant="neutral" className="font-mono text-[10px]">
                      {eventName}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <Switch checked={endpoint.active} onCheckedChange={(checked) => onToggleActive(endpoint, checked)} />
                <span className="text-xs text-gray-600">{endpoint.active ? "Active" : "Inactive"}</span>
              </div>
            </TableCell>
            <TableCell className="text-xs text-gray-600">{formatDateTime(endpoint.createdAt, tenant)}</TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => onEdit(endpoint)}>
                  Edit
                </Button>
                <Button variant="secondary" size="sm" onClick={() => onSendTest(endpoint)}>
                  Send Test
                </Button>
                <Button variant="destructive" size="sm" onClick={() => onDelete(endpoint)}>
                  Delete
                </Button>
              </div>
              {result ? <div className="mt-2"><SendTestResult result={result} /></div> : null}
            </TableCell>
          </TableRow>
        );
      })}
    </Table>
  );
}
