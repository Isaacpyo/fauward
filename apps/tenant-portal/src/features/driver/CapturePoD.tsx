import { useRef, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, Pen, X } from 'lucide-react';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';

export function CapturePoD() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasSig, setHasSig] = useState(false);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const primary = getComputedStyle(document.documentElement)
      .getPropertyValue('--color-primary-base')
      .trim();
    ctx.strokeStyle = primary || '#0D1F3C';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    setDrawing(true);
    const ctx = canvasRef.current!.getContext('2d')!;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSig(true);
  };

  const onPointerUp = () => setDrawing(false);

  const clearSignature = () => {
    const canvas = canvasRef.current!;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    setHasSig(false);
  };

  const capturePhoto = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: 1280, height: 720 }
      });
      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();

      const cap = document.createElement('canvas');
      cap.width = video.videoWidth;
      cap.height = video.videoHeight;
      cap.getContext('2d')!.drawImage(video, 0, 0);
      stream.getTracks().forEach(t => t.stop());

      cap.toBlob(blob => {
        if (blob) {
          setPhotoBlob(blob);
          setPhotoUrl(URL.createObjectURL(blob));
        }
      }, 'image/jpeg', 0.8);
    } catch {
      alert('Camera access denied or unavailable.');
    }
  };

  const { mutate: submit, isPending } = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      const canvas = canvasRef.current!;
      formData.append('signature', canvas.toDataURL('image/png'));
      if (photoBlob) formData.append('photo', photoBlob, 'pod.jpg');

      await api.post(`/shipments/${id}/pod`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      await api.patch(`/shipments/${id}/status`, { status: 'DELIVERED' });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shipment', id] });
      navigate('/driver', { replace: true });
    }
  });

  const canSubmit = hasSig;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-0)] p-4">
        <button onClick={() => navigate(-1)} className="text-sm text-[var(--color-primary-base)]">Back</button>
        <h1 className="mt-1 text-base font-semibold text-[var(--color-text-primary)]">Proof of delivery</h1>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 p-4">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-0)] p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-[var(--color-text-primary)]">
              <Pen className="mr-1 inline h-4 w-4" /> Customer signature
            </p>
            {hasSig && (
              <button onClick={clearSignature} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-danger)]">
                Clear
              </button>
            )}
          </div>
          <canvas
            ref={canvasRef} width={600} height={200}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            className="w-full touch-none rounded-lg bg-[var(--color-surface-50)] border border-dashed border-[var(--color-border)]"
            style={{ height: '200px', cursor: 'crosshair' }}
          />
          {!hasSig && (
            <p className="mt-2 text-center text-xs text-[var(--color-text-muted)]">
              Ask the customer to sign above
            </p>
          )}
        </div>

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-0)] p-4">
          <p className="mb-3 text-sm font-medium text-[var(--color-text-primary)]">
            <Camera className="mr-1 inline h-4 w-4" /> Delivery photo (optional)
          </p>
          {photoUrl
            ? (
              <div className="relative">
                <img src={photoUrl} alt="POD" className="w-full rounded-lg object-cover" style={{ maxHeight: '200px' }} />
                <button onClick={() => { setPhotoBlob(null); setPhotoUrl(null); }}
                  className="absolute right-2 top-2 rounded-full bg-black/50 p-1 text-white hover:bg-black/70">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )
            : (
              <button onClick={capturePhoto}
                className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[var(--color-border)] py-8 text-sm text-[var(--color-text-muted)] hover:border-[var(--color-primary-base)] hover:text-[var(--color-primary-base)] transition-colors">
                <Camera className="h-5 w-5" /> Take photo
              </button>
            )
          }
        </div>
      </div>

      <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-0)] p-4">
        <Button variant="primary" size="lg" className="w-full" loading={isPending}
          disabled={!canSubmit} onClick={() => submit()}>
          Confirm delivery
        </Button>
      </div>
    </div>
  );
}
