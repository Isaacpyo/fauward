import { Download, FileText, Image as ImageIcon } from "lucide-react";

import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/Button";
import { formatDateTime } from "@/lib/utils";
import { useTenantStore } from "@/stores/useTenantStore";
import type { ShipmentDocument } from "@/types/shipment";

type DocumentsPanelProps = {
  documents: ShipmentDocument[];
};

/**
 * Documents attached to the shipment by the platform (labels, delivery notes, POD, customs). There is no tenant upload
 * endpoint, so this panel is read-only; labels and delivery notes are generated from their own actions.
 */
export function DocumentsPanel({ documents }: DocumentsPanelProps) {
  const tenant = useTenantStore((state) => state.tenant);

  if (documents.length === 0) {
    return <EmptyState icon={FileText} title="No documents attached" description="Labels, delivery notes and proof of delivery appear here once generated." />;
  }

  return (
    <ul className="space-y-2">
      {documents.map((document) => (
        <li key={document.id} className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {document.preview_url ? (
                <img src={document.preview_url} alt={document.file_name} className="h-12 w-12 rounded border border-gray-200 object-cover" />
              ) : (
                <span className="inline-flex h-12 w-12 items-center justify-center rounded border border-gray-200 bg-gray-50">
                  {document.file_type === "pdf" ? <FileText size={16} /> : <ImageIcon size={16} />}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900">{document.file_name}</p>
                <p className="text-xs text-gray-500">
                  Added by {document.uploaded_by} · {formatDateTime(document.uploaded_at, tenant)}
                </p>
              </div>
            </div>
            <Button variant="secondary" size="sm" asChild>
              <a href={document.file_url} download={document.file_name}>
                <Download size={14} />
                Download
              </a>
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
