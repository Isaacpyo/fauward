import { Download, FileText, Image as ImageIcon, Trash2, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";

import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/Button";
import { cn, formatDateTime } from "@/lib/utils";
import { useTenantStore } from "@/stores/useTenantStore";
import type { ShipmentDocument } from "@/types/shipment";

type UploadProgress = {
  fileName: string;
  progress: number;
};

type DocumentsPanelProps = {
  documents: ShipmentDocument[];
  onDocumentsChange: (documents: ShipmentDocument[]) => void;
};

const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const maxFileSize = 10 * 1024 * 1024;

export function DocumentsPanel({ documents, onDocumentsChange }: DocumentsPanelProps) {
  const [dragging, setDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const tenant = useTenantStore((state) => state.tenant);

  const simulateUpload = (file: File) => {
    setUploadProgress({ fileName: file.name, progress: 0 });
    let progress = 0;
    const timer = window.setInterval(() => {
      progress += 12;
      if (progress >= 100) {
        window.clearInterval(timer);
        setUploadProgress(null);
        const extension = file.name.split(".").pop()?.toLowerCase() as ShipmentDocument["file_type"];
        onDocumentsChange([
          {
            id: crypto.randomUUID(),
            file_name: file.name,
            file_url: URL.createObjectURL(file),
            file_type: extension || "pdf",
            uploaded_by: "You",
            uploaded_at: new Date().toISOString(),
            preview_url: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined
          },
          ...documents
        ]);
        return;
      }
      setUploadProgress({ fileName: file.name, progress });
    }, 150);
  };

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) {
      return;
    }

    const file = fileList[0];
    if (!allowedTypes.includes(file.type) || file.size > maxFileSize) {
      return;
    }
    simulateUpload(file);
  };

  const removeDocument = (id: string) => {
    const match = documents.find((document) => document.id === id);
    if (!match) {
      return;
    }
    const confirmed = window.confirm(`Delete "${match.file_name}"?`);
    if (!confirmed) {
      return;
    }
    onDocumentsChange(documents.filter((document) => document.id !== id));
  };

  return (
    <div className="space-y-4">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
        className={cn(
          "rounded-lg border border-dashed p-5 text-center",
          dragging ? "border-[var(--tenant-primary)] bg-[var(--tenant-primary-light)]/30" : "border-gray-300 bg-gray-50"
        )}
      >
        <UploadCloud size={20} className="mx-auto text-gray-500" />
        <p className="mt-2 text-sm text-gray-700">Drag and drop files here, or click upload</p>
        <p className="mt-1 text-xs text-gray-500">JPG, PNG, WEBP, PDF up to 10MB</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.pdf"
          className="hidden"
          onChange={(event) => handleFiles(event.target.files)}
        />
        <Button variant="secondary" className="mt-3" onClick={() => fileInputRef.current?.click()}>
          Upload document
        </Button>
      </div>

      {uploadProgress ? (
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <p className="text-sm font-medium text-gray-900">{uploadProgress.fileName}</p>
          <div className="mt-2 h-2 rounded-full bg-gray-200">
            <div className="h-full rounded-full bg-[var(--tenant-primary)]" style={{ width: `${uploadProgress.progress}%` }} />
          </div>
          <p className="mt-1 text-xs text-gray-500">{uploadProgress.progress}%</p>
        </div>
      ) : null}

      {documents.length === 0 ? (
        <EmptyState icon={FileText} title="No documents attached" description="Upload POD photos, labels, or customs files." />
      ) : (
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
                      Uploaded by {document.uploaded_by} · {formatDateTime(document.uploaded_at, tenant)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" asChild>
                    <a href={document.file_url} download={document.file_name}>
                      <Download size={14} />
                      Download
                    </a>
                  </Button>
                  <Button variant="ghost" size="sm" leftIcon={<Trash2 size={14} />} onClick={() => removeDocument(document.id)}>
                    Delete
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
