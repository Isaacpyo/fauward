import { apiRequest } from "@/lib/api/http";

const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.75;

async function compressDataUrl(dataUrl: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("No canvas context")); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Canvas toBlob failed"))),
        "image/jpeg",
        JPEG_QUALITY,
      );
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

export async function uploadPhoto(accessToken: string, dataUrl: string): Promise<string> {
  // 1. Compress
  const blob = await compressDataUrl(dataUrl);

  // 2. Get signed upload URL from backend (apiRequest carries X-Tenant-Slug header)
  const { uploadUrl, publicUrl } = await apiRequest<{ uploadUrl: string; publicUrl: string }>(
    "/api/v1/field/storage/sign",
    { method: "POST", token: accessToken, body: { contentType: "image/jpeg" } },
  );

  // 3. Upload directly to Supabase Storage
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/jpeg" },
    body: blob,
  });

  if (!uploadRes.ok) throw new Error(`Storage upload failed: ${uploadRes.status}`);

  return publicUrl;
}
