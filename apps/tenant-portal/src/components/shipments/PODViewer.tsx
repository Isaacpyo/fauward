import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { api } from "@/lib/api";

type PodAsset = {
  id: string;
  type: string;
  fileUrl: string;
  capturedAt?: string;
};

type PODViewerProps = {
  shipmentId: string;
  podAssets: PodAsset[];
  recipientName: string;
  deliveredAt?: string | null;
  capturedBy: string;
};

export function PODViewer({ shipmentId, podAssets, recipientName, deliveredAt, capturedBy }: PODViewerProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const downloadMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post<{ signedUrl: string }>(`/v1/documents/pod/${shipmentId}`);
      return response.data.signedUrl;
    },
    onSuccess: (url) => {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  });

  const photos = podAssets.filter((asset) => asset.type !== "SIGNATURE");
  const signature = podAssets.find((asset) => asset.type === "SIGNATURE");

  return (
    <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Proof of Delivery</h3>
        <p className="text-xs text-gray-500">
          Recipient: {recipientName} · Delivered: {deliveredAt ? new Date(deliveredAt).toLocaleString() : "N/A"} · Captured by: {capturedBy}
        </p>
      </div>

      {photos.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {photos.map((asset) => (
            <button
              key={asset.id}
              type="button"
              className="overflow-hidden rounded-md border border-gray-200"
              onClick={() => setPreviewUrl(asset.fileUrl)}
            >
              <img src={asset.fileUrl} alt="POD photo" className="h-36 w-full object-cover" />
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500">No POD photos found.</p>
      )}

      {signature ? (
        <div className="w-[300px] max-w-full rounded-md border border-gray-300 p-2">
          <p className="mb-2 text-xs text-gray-500">Signature</p>
          <img src={signature.fileUrl} alt="POD signature" className="h-[150px] w-full object-contain" />
        </div>
      ) : null}

      <Button variant="secondary" onClick={() => downloadMutation.mutate()}>
        Download POD
      </Button>

      <Dialog open={Boolean(previewUrl)} onOpenChange={(open) => !open && setPreviewUrl(null)} title="POD Preview">
        {previewUrl ? <img src={previewUrl} alt="POD full preview" className="max-h-[75vh] w-full object-contain" /> : null}
      </Dialog>
    </section>
  );
}

