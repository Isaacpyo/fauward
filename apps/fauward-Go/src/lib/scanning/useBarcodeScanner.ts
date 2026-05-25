import { useCallback, useEffect, useRef, useState } from "react";

export type ScannerCodeType = "qr" | "barcode";

type DetectCallback = (value: string, codeType: ScannerCodeType, format: BarcodeFormat) => void;

interface UseBarcodeScannerOptions {
  formats?: BarcodeFormat[];
  onDetect: DetectCallback;
  /** Stop the camera automatically after the first successful decode. Default true. */
  stopOnDetect?: boolean;
}

const DEFAULT_FORMATS: BarcodeFormat[] = ["qr_code", "code_128", "ean_13", "ean_8", "upc_a", "upc_e"];

export const useBarcodeScanner = ({ formats = DEFAULT_FORMATS, onDetect, stopOnDetect = true }: UseBarcodeScannerOptions) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | undefined>();
  const detectorRef = useRef<BarcodeDetector | undefined>();
  const processingRef = useRef(false);
  const onDetectRef = useRef(onDetect);

  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Keep callback ref up to date without restarting the scan loop.
  useEffect(() => {
    onDetectRef.current = onDetect;
  }, [onDetect]);

  const stopCamera = useCallback(() => {
    if (rafRef.current !== undefined) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = undefined;
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    processingRef.current = false;
    setIsCameraOpen(false);
  }, []);

  // Cleanup on unmount.
  useEffect(() => () => stopCamera(), [stopCamera]);

  const scanFrame = useCallback(async () => {
    if (!videoRef.current || !detectorRef.current || processingRef.current) {
      return;
    }

    processingRef.current = true;

    try {
      const results = await detectorRef.current.detect(videoRef.current);
      const first = results.find((result) => result.rawValue);

      if (first?.rawValue) {
        const codeType: ScannerCodeType = first.format === "qr_code" ? "qr" : "barcode";
        onDetectRef.current(first.rawValue, codeType, first.format);
        if (stopOnDetect) {
          stopCamera();
          return;
        }
      }
    } catch {
      setCameraError("Camera is active, but this browser could not decode the current frame.");
    } finally {
      processingRef.current = false;
    }

    rafRef.current = window.requestAnimationFrame(() => {
      void scanFrame();
    });
  }, [stopCamera, stopOnDetect]);

  const startCamera = useCallback(async () => {
    if (typeof BarcodeDetector === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCameraError("Live scan is unavailable here. Use manual entry instead.");
      return;
    }

    try {
      detectorRef.current = new BarcodeDetector({ formats });
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraError(null);
      setIsCameraOpen(true);
      rafRef.current = window.requestAnimationFrame(() => {
        void scanFrame();
      });
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : "Unable to start the camera.");
      stopCamera();
    }
  }, [formats, scanFrame, stopCamera]);

  return {
    videoRef,
    isCameraOpen,
    cameraError,
    startCamera,
    stopCamera,
  };
};
