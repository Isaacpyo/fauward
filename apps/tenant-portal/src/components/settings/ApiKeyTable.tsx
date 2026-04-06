import { KeyRound, MoreHorizontal, ShieldCheck } from "lucide-react";

import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Table, TableCell, TableRow } from "@/components/ui/Table";
import { formatDateTime } from "@/lib/utils";
import { useTenantStore } from "@/stores/useTenantStore";

import type { ApiKeyRecord } from "./types";

type ApiKeyTableProps = {
  keys: ApiKeyRecord[];
  onRequestGenerate: () => void;
  onRequestRevoke: (key: ApiKeyRecord) => void;
};

export function ApiKeyTable({ keys, onRequestGenerate, onRequestRevoke }: ApiKeyTableProps) {
  const tenant = useTenantStore((state) => state.tenant);

  if (keys.length === 0) {
    return (
      <EmptyState
        icon={KeyRound}
        title="No API keys yet. Generate your first key to start integrating."
        description="API keys let your backend and partner systems call Fauward securely."
        ctaLabel="Generate Key"
        onCtaClick={onRequestGenerate}
      />
    );
  }

  return (
    <Table columns={["Name", "Key Prefix", "Scopes", "Created", "Last Used", "Status", "Actions"]}>
      {keys.map((key) => (
        <TableRow key={key.id}>
          <TableCell className="font-medium text-gray-900">{key.name}</TableCell>
          <TableCell>
            <span className="font-mono text-xs text-gray-700">{key.keyPrefix}</span>
          </TableCell>
          <TableCell>
            <div className="flex flex-wrap gap-1">
              {key.scopes.map((scope) => (
                <Badge key={scope} variant="neutral">
                  {scope}
                </Badge>
              ))}
            </div>
          </TableCell>
          <TableCell className="text-xs text-gray-600">{formatDateTime(key.createdAt, tenant)}</TableCell>
          <TableCell className="text-xs text-gray-600">
            {key.lastUsedAt ? formatDateTime(key.lastUsedAt, tenant) : "Never"}
          </TableCell>
          <TableCell>
            <Badge variant={key.status === "ACTIVE" ? "success" : "neutral"} className={key.status === "REVOKED" ? "line-through" : ""}>
              {key.status === "ACTIVE" ? "Active" : "Revoked"}
            </Badge>
          </TableCell>
          <TableCell className="text-right">
            <Dropdown
              trigger={
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 text-gray-600 hover:bg-gray-100"
                  aria-label={`Actions for ${key.name}`}
                >
                  <MoreHorizontal size={16} />
                </button>
              }
              items={[
                {
                  key: "revoke",
                  label: "Revoke",
                  icon: <ShieldCheck size={14} />,
                  destructive: true,
                  onSelect: () => onRequestRevoke(key)
                }
              ]}
            />
          </TableCell>
        </TableRow>
      ))}
      <TableRow>
        <TableCell colSpan={7}>
          <div className="flex justify-end">
            <Button variant="secondary" size="sm" onClick={onRequestGenerate}>
              Generate New API Key
            </Button>
          </div>
        </TableCell>
      </TableRow>
    </Table>
  );
}

