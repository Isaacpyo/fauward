import { Camera, RotateCcw } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/Button";
import { useCamera } from "@/hooks/useCamera";

type CameraCaptureProps = {
  image?: string | null;
  onCapture: (image: string) => void;
  onRetake: () => void;
};

export function CameraCapture({ image, onCapture, onRetake }: CameraCaptureProps) {
  const { videoRef, error, startCamera, stopCamera, captureImage } = useCamera();

  useEffect(() => {
    if (!image) {
      void startCamera();
    }
    return () => stopCamera();
  }, [image, startCamera, stopCamera]);

  if (image) {
    return (
      <div className="space-y-3">
        <img src={image} alt="POD capture" className="h-64 w-full rounded-xl object-cover" />
        <Button variant="secondary" onClick={onRetake} leftIcon={<RotateCcw size={16} />}>
          Retake
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <video ref={videoRef} autoPlay playsInline muted className="h-64 w-full rounded-xl bg-black object-cover" />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <Button
        onClick={() => {
          const snapshot = captureImage();
          if (snapshot) {
            onCapture(snapshot);
            stopCamera();
          }
        }}
        leftIcon={<Camera size={16} />}
      >
        Capture
      </Button>
    </div>
  );
}

